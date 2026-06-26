import { existsSync } from "node:fs";
import path from "node:path";
import {
  ArrowFunction,
  CallExpression,
  ConstructorDeclaration,
  FunctionDeclaration,
  FunctionExpression,
  GetAccessorDeclaration,
  MethodDeclaration,
  Node,
  Project,
  SetAccessorDeclaration,
  SourceFile,
  SyntaxKind,
  VariableDeclaration,
} from "ts-morph";
import type { CandidateMetrics, ScanParams, Severity, SliceCandidate, SmellType } from "./types.js";

export const THRESHOLDS = {
  GOD_FILE_LOC: 800,
  GOD_FILE_EXPORTS: 8,
  HIGH_COMPLEXITY_CALLERS: 15,
  HIGH_COMPLEXITY_CALLEES: 10,
  HUB_CREEP_CALLEES: 12,
  HUB_CREEP_DISTINCT_FILES: 8,
  TIGHT_COUPLING_EDGES: 5,
  TRIVIAL_HELPER_MAX_LOC: 5,
} as const;

const DEFAULT_GLOBS = ["src/**/*.ts", "src/**/*.tsx", "lib/**/*.ts", "lib/**/*.tsx", "app/**/*.ts", "app/**/*.tsx", "server/**/*.ts", "server/**/*.tsx", "api/**/*.ts", "api/**/*.tsx", "shared/**/*.ts", "shared/**/*.tsx", "packages/**/*.ts", "packages/**/*.tsx", "extensions/**/*.ts", "extensions/**/*.tsx"];
const UTILS_BASENAME_RE = /(?:^|\/)(?:utils|helpers|common|misc)\.tsx?$/i;
const SEVERITY_ORDER: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const SEVERITY_WEIGHT: Record<SmellType, number> = {
  god_file: 25,
  high_complexity: 20,
  tight_coupling: 15,
  hub_creep: 10,
  dead_export: 5,
  singleton_utils_file: 40,
  trivial_helper: 20,
};

type CallableNode = FunctionDeclaration | MethodDeclaration | ConstructorDeclaration | GetAccessorDeclaration | SetAccessorDeclaration | ArrowFunction | FunctionExpression;

interface FnInfo {
  id: string;
  file: string;
  name: string;
  exported: boolean;
  loc: number;
  node: CallableNode;
  calls: Set<string>;
}

interface FileInfo {
  file: string;
  loc: number;
  exports: Set<string>;
  imports: Map<string, Set<string>>;
  functions: FnInfo[];
}

export async function scanForCandidates(params: ScanParams = {}): Promise<SliceCandidate[]> {
  const rootDir = path.resolve(params.rootDir ?? process.cwd());
  const infos = buildProjectModel(rootDir, params.files);
  let candidates = detectCandidates(infos);

  if (params.minSeverity) {
    const min = SEVERITY_ORDER[params.minSeverity];
    candidates = candidates.filter((c) => SEVERITY_ORDER[c.severity] >= min);
  }
  if (params.smells?.length) {
    const smells = new Set(params.smells);
    candidates = candidates.filter((c) => smells.has(c.smell));
  }
  if (params.files?.length) {
    const wanted = new Set(params.files.map(normalizeRel));
    candidates = candidates.filter((c) => wanted.has(normalizeRel(c.file)));
  }

  return candidates.sort((a, b) => b.impactScore - a.impactScore).slice(0, params.maxResults ?? 50);
}

export function detectCandidates(files: FileInfo[]): SliceCandidate[] {
  const candidates: SliceCandidate[] = [];
  const allFns = files.flatMap((f) => f.functions);
  const totalNodes = Math.max(1, allFns.length);
  const byId = new Map(allFns.map((fn) => [fn.id, fn]));
  const callers = new Map<string, Set<string>>();
  const callees = new Map<string, Set<string>>();

  for (const fn of allFns) {
    const out = new Set<string>();
    for (const calleeId of fn.calls) {
      if (!byId.has(calleeId) || calleeId === fn.id) continue;
      out.add(calleeId);
      const incoming = callers.get(calleeId) ?? new Set<string>();
      incoming.add(fn.id);
      callers.set(calleeId, incoming);
    }
    callees.set(fn.id, out);
  }

  for (const file of files) {
    if (file.loc >= THRESHOLDS.GOD_FILE_LOC && file.exports.size >= THRESHOLDS.GOD_FILE_EXPORTS) {
      const metrics = { loc: file.loc, exportCount: file.exports.size };
      candidates.push(candidate(file.file, undefined, "god_file", file.loc > 2000 ? "critical" : file.loc > 1200 ? "high" : "medium", metrics, totalNodes));
    }
    if (UTILS_BASENAME_RE.test(file.file) && file.exports.size === 1) {
      candidates.push(candidate(file.file, undefined, "singleton_utils_file", "medium", { loc: file.loc, exportCount: 1 }, totalNodes));
    }
  }

  for (const fn of allFns) {
    const callerCount = callers.get(fn.id)?.size ?? 0;
    const calleeSet = callees.get(fn.id) ?? new Set<string>();
    const calleeCount = calleeSet.size;

    if (callerCount >= THRESHOLDS.HIGH_COMPLEXITY_CALLERS || calleeCount >= THRESHOLDS.HIGH_COMPLEXITY_CALLEES) {
      const metrics = { callerCount, calleeCount, loc: fn.loc };
      candidates.push(candidate(fn.file, fn.name, "high_complexity", callerCount > 30 ? "critical" : callerCount > 20 || calleeCount > 15 ? "high" : "medium", metrics, totalNodes));
    }
    if (fn.exported && callerCount === 0) {
      candidates.push(candidate(fn.file, fn.name, "dead_export", "low", { callerCount: 0 }, totalNodes));
    }
    if (fn.exported && callerCount === 1 && fn.loc <= THRESHOLDS.TRIVIAL_HELPER_MAX_LOC) {
      candidates.push(candidate(fn.file, fn.name, "trivial_helper", "low", { loc: fn.loc, callerCount }, totalNodes));
    }
    if (calleeCount >= THRESHOLDS.HUB_CREEP_CALLEES) {
      const distinctFiles = new Set([...calleeSet].map((id) => byId.get(id)?.file).filter((f): f is string => Boolean(f) && f !== fn.file));
      if (distinctFiles.size >= THRESHOLDS.HUB_CREEP_DISTINCT_FILES) {
        candidates.push(candidate(fn.file, fn.name, "hub_creep", "medium", { calleeCount, distinctFiles: distinctFiles.size }, totalNodes));
      }
    }
  }

  const filePairs = new Map<string, { forward: number; backward: number }>();
  for (const f of files) {
    for (const [imported, names] of f.imports) {
      if (imported === f.file) continue;
      const key = f.file < imported ? `${f.file}|${imported}` : `${imported}|${f.file}`;
      const pair = filePairs.get(key) ?? { forward: 0, backward: 0 };
      const weight = Math.max(1, names.size);
      if (f.file < imported) pair.forward += weight;
      else pair.backward += weight;
      filePairs.set(key, pair);
    }
  }
  for (const [key, pair] of filePairs) {
    const total = pair.forward + pair.backward;
    if (pair.forward > 0 && pair.backward > 0 && total > THRESHOLDS.TIGHT_COUPLING_EDGES) {
      const [a, b] = key.split("|");
      candidates.push(candidate(pair.forward >= pair.backward ? a : b, undefined, "tight_coupling", "medium", { bidirectionalImports: total }, totalNodes));
    }
  }

  return candidates;
}

function buildProjectModel(rootDir: string, requested?: string[]): FileInfo[] {
  const tsconfig = path.join(rootDir, "tsconfig.json");
  const project = existsSync(tsconfig)
    ? new Project({ tsConfigFilePath: tsconfig, skipAddingFilesFromTsConfig: true })
    : new Project({ compilerOptions: { allowJs: false, skipLibCheck: true } });

  if (requested?.length) {
    for (const file of requested) project.addSourceFileAtPathIfExists(path.resolve(rootDir, file));
  } else {
    project.addSourceFilesAtPaths(DEFAULT_GLOBS.map((g) => path.join(rootDir, g).replaceAll(path.sep, "/")));
  }

  const sourceFiles = project.getSourceFiles().filter((sf) => isProjectSource(rootDir, sf));
  const declarationToId = new Map<Node, string>();
  const files: FileInfo[] = [];

  for (const sf of sourceFiles) {
    const rel = relPath(rootDir, sf);
    const functions: FnInfo[] = [];
    for (const node of getTopLevelCallables(sf)) {
      const name = callableName(node);
      if (!name) continue;
      const id = uniqueId(functions, `${rel}:${name}`);
      const fn: FnInfo = { id, file: rel, name, exported: isExportedCallable(node), loc: node.getEndLineNumber() - node.getStartLineNumber() + 1, node, calls: new Set() };
      functions.push(fn);
      declarationToId.set(node, id);
      const nameNode = getNameNode(node);
      if (nameNode) declarationToId.set(nameNode, id);
    }
    files.push({ file: rel, loc: sf.getEndLineNumber(), exports: getExportNames(sf), imports: getImports(rootDir, sf), functions });
  }

  const allFunctions = files.flatMap((f) => f.functions);
  const byName = new Map<string, FnInfo[]>();
  for (const fn of allFunctions) byName.set(fn.name, [...(byName.get(fn.name) ?? []), fn]);

  for (const fn of allFunctions) {
    for (const call of fn.node.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (nearestCallable(call) !== fn.node) continue;
      const targetId = resolveCall(call, declarationToId, byName);
      if (targetId) fn.calls.add(targetId);
    }
  }

  return files;
}

function getTopLevelCallables(sf: SourceFile): CallableNode[] {
  const out: CallableNode[] = [];
  sf.forEachDescendant((node, traversal) => {
    if (isCallable(node)) {
      if (isNamedCallable(node)) out.push(node);
      traversal.skip();
    }
  });
  return out;
}

function isCallable(node: Node): node is CallableNode {
  return Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node) || Node.isConstructorDeclaration(node) || Node.isGetAccessorDeclaration(node) || Node.isSetAccessorDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node);
}

function isNamedCallable(node: CallableNode): boolean {
  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) return Node.isVariableDeclaration(node.getParentIfKind(SyntaxKind.VariableDeclaration));
  return Boolean(callableName(node));
}

function callableName(node: CallableNode): string | undefined {
  if (Node.isConstructorDeclaration(node)) return `${node.getParentIfKind(SyntaxKind.ClassDeclaration)?.getName() ?? "AnonymousClass"}.constructor`;
  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) return node.getParentIfKind(SyntaxKind.VariableDeclaration)?.getName();
  const own = node.getName();
  const cls = node.getParentIfKind(SyntaxKind.ClassDeclaration)?.getName();
  return cls && !Node.isFunctionDeclaration(node) ? `${cls}.${own}` : own;
}

function getNameNode(node: CallableNode): Node | undefined {
  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) return node.getParentIfKind(SyntaxKind.VariableDeclaration)?.getNameNode();
  if (Node.isConstructorDeclaration(node)) return node.getParentIfKind(SyntaxKind.ClassDeclaration)?.getNameNode();
  return node.getNameNode();
}

function isExportedCallable(node: CallableNode): boolean {
  const container: Node = (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) ? node.getFirstAncestorByKind(SyntaxKind.VariableStatement) ?? node : node;
  if (Node.isModifierable(container) && container.getModifiers().some((m) => m.getKind() === SyntaxKind.ExportKeyword)) return true;
  const sf = node.getSourceFile();
  const name = callableName(node)?.split(".").at(-1);
  return Boolean(name && sf.getExportSymbols().some((s) => s.getName() === name || s.getDeclarations().some((d) => d === node || d === getNameNode(node))));
}

function getExportNames(sf: SourceFile): Set<string> {
  return new Set(sf.getExportSymbols().map((s) => s.getName()).filter((n) => n !== "default"));
}

function getImports(rootDir: string, sf: SourceFile): Map<string, Set<string>> {
  const imports = new Map<string, Set<string>>();
  for (const decl of sf.getImportDeclarations()) {
    const target = decl.getModuleSpecifierSourceFile();
    if (!target || !isProjectSource(rootDir, target)) continue;
    const names = new Set<string>();
    for (const spec of decl.getNamedImports()) names.add(spec.getName());
    const def = decl.getDefaultImport();
    if (def) names.add(def.getText());
    const ns = decl.getNamespaceImport();
    if (ns) names.add(ns.getText());
    imports.set(relPath(rootDir, target), names);
  }
  return imports;
}

function resolveCall(call: CallExpression, declarationToId: Map<Node, string>, byName: Map<string, FnInfo[]>): string | undefined {
  const expr = call.getExpression();
  const symbol = expr.getSymbol() ?? (Node.isPropertyAccessExpression(expr) ? expr.getNameNode().getSymbol() : undefined);
  for (const decl of symbol?.getDeclarations() ?? []) {
    const callable = decl as Node;
    const direct = declarationToId.get(callable) ?? declarationToId.get(callable.getParentIfKind(SyntaxKind.VariableDeclaration) as VariableDeclaration);
    if (direct) return direct;
    const ancestor = callable.getFirstAncestor((a): a is Node => isCallable(a));
    if (ancestor && declarationToId.has(ancestor)) return declarationToId.get(ancestor);
  }
  const fallbackName = Node.isPropertyAccessExpression(expr) ? expr.getName() : Node.isIdentifier(expr) ? expr.getText() : undefined;
  const matches = fallbackName ? byName.get(fallbackName) ?? byName.get([...byName.keys()].find((n) => n.endsWith(`.${fallbackName}`)) ?? "") : undefined;
  return matches?.length === 1 ? matches[0].id : undefined;
}

function nearestCallable(node: Node): CallableNode | undefined {
  return node.getFirstAncestor((a): a is CallableNode => isCallable(a));
}

function isProjectSource(rootDir: string, sf: SourceFile): boolean {
  const abs = sf.getFilePath();
  return abs.startsWith(rootDir) && /\.tsx?$/.test(abs) && !/\.d\.ts$/.test(abs) && !/[\\/](node_modules|dist|build|coverage|\.pi)[\\/]/.test(abs) && !/\.(test|spec)\.tsx?$/.test(abs);
}

function uniqueId(existing: FnInfo[], base: string): string {
  let id = base;
  let i = 2;
  while (existing.some((f) => f.id === id)) id = `${base}#${i++}`;
  return id;
}

function candidate(file: string, functionName: string | undefined, smell: SmellType, severity: Severity, metrics: CandidateMetrics, totalNodes: number): SliceCandidate {
  return { file, ...(functionName ? { functionName } : {}), smell, severity, metrics, impactScore: scoreCandidate(smell, metrics, totalNodes) };
}

export function scoreCandidate(smell: SmellType, metrics: CandidateMetrics, totalNodes = 500): number {
  const base = SEVERITY_WEIGHT[smell];
  const scale = Math.min(2, ((metrics.callerCount ?? 0) * 0.5 + (metrics.calleeCount ?? 0) * 0.3 + (metrics.loc ?? 0) / 100 + (metrics.exportCount ?? 0) * 0.5 + (metrics.bidirectionalImports ?? 0) * 2) / Math.max(1, totalNodes / 100));
  return Math.min(100, Math.round(base * (1 + scale)));
}

function relPath(rootDir: string, sf: SourceFile): string {
  return normalizeRel(path.relative(rootDir, sf.getFilePath()));
}
function normalizeRel(p: string): string {
  return p.split(path.sep).join("/").replace(/^\.\//, "");
}
