import type { ProtocolHandler } from "@kyvernitria/pi-protocol-minimal";
import { scanForCandidates } from "../src/slice/scan.js";
import { diagnoseCandidate } from "../src/slice/diagnose.js";
import { generateSlicePlan } from "../src/slice/plan.js";
import { scanDocHygiene } from "../src/doc-hygiene/scan.js";
import type { ScanParams, Severity, SliceCandidate, SliceDiagnosis, SmellType } from "../src/slice/types.js";
import type { DocHygieneScanParams } from "../src/doc-hygiene/types.js";

export function createCodeHealthProtocolHandlers(): Record<string, ProtocolHandler> {
  return {
    slice_scan: async (input) => scanForCandidates(parseSliceScanInput(input)),
    slice_diagnose: async (input) => diagnoseCandidate(parseSliceCandidateInput(input)),
    slice_plan: async (input) => generateSlicePlan(parseSliceDiagnosisInput(input)),
    doc_hygiene_scan: async (input) => scanDocHygiene(parseDocHygieneScanInput(input)),
  };
}

function parseSliceScanInput(input: unknown): ScanParams {
  const value = optionalRecord(input, "slice_scan input");
  return {
    rootDir: optionalString(value.rootDir, "rootDir"),
    files: optionalStringArray(value.files, "files"),
    minSeverity: optionalSeverity(value.minSeverity, "minSeverity"),
    smells: optionalSmellArray(value.smells, "smells"),
    maxResults: optionalNumber(value.maxResults, "maxResults"),
  };
}

function parseDocHygieneScanInput(input: unknown): DocHygieneScanParams {
  const value = optionalRecord(input, "doc_hygiene_scan input");
  return {
    rootDir: optionalString(value.rootDir, "rootDir"),
    files: optionalStringArray(value.files, "files"),
    maxResults: optionalNumber(value.maxResults, "maxResults"),
  };
}

function parseSliceCandidateInput(input: unknown): SliceCandidate {
  const value = requiredRecord(input, "slice_diagnose input");
  const metrics = optionalMetrics(value.metrics, "metrics") ?? {};
  return {
    file: requiredString(value.file, "file"),
    functionName: optionalString(value.functionName, "functionName"),
    smell: requiredSmell(value.smell, "smell"),
    severity: requiredSeverity(value.severity, "severity"),
    metrics,
    impactScore: optionalNumber(value.impactScore, "impactScore") ?? 0,
  };
}

function parseSliceDiagnosisInput(input: unknown): SliceDiagnosis {
  const value = requiredRecord(input, "slice_plan input");
  return {
    candidate: parseSliceCandidateInput(value.candidate),
    recommendedPattern: requiredString(value.recommendedPattern, "recommendedPattern"),
    patternSource: parsePatternSource(value.patternSource),
    toolSupport: optionalStringArray(value.toolSupport, "toolSupport") ?? [],
    riskLevel: requiredRiskLevel(value.riskLevel, "riskLevel"),
    blastRadius: optionalNumber(value.blastRadius, "blastRadius") ?? 0,
    rationale: requiredString(value.rationale, "rationale"),
    inspectBeforeChanging: optionalStringArray(value.inspectBeforeChanging, "inspectBeforeChanging") ?? [],
  };
}

const severities = new Set(["low", "medium", "high", "critical"] as const);
const smells = new Set(["god_file", "high_complexity", "dead_export", "tight_coupling", "hub_creep", "singleton_utils_file", "trivial_helper"] as const);
const riskLevels = new Set(["low", "medium", "high"] as const);

function optionalRecord(input: unknown, name: string): Record<string, unknown> {
  if (input === undefined || input === null) return {};
  return requiredRecord(input, name);
}

function requiredRecord(input: unknown, name: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error(`${name} must be an object.`);
  return input as Record<string, unknown>;
}

function requiredString(input: unknown, name: string): string {
  if (typeof input !== "string" || !input.trim()) throw new Error(`${name} must be a non-empty string.`);
  return input;
}

function optionalString(input: unknown, name: string): string | undefined {
  if (input === undefined) return undefined;
  return requiredString(input, name);
}

function optionalStringArray(input: unknown, name: string): string[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input) || input.some((item) => typeof item !== "string")) throw new Error(`${name} must be an array of strings.`);
  return input;
}

function optionalNumber(input: unknown, name: string): number | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== "number" || !Number.isFinite(input)) throw new Error(`${name} must be a finite number.`);
  return input;
}

function requiredSeverity(input: unknown, name: string): Severity {
  if (typeof input !== "string" || !severities.has(input as Severity)) throw new Error(`${name} must be one of: ${[...severities].join(", ")}.`);
  return input as Severity;
}

function optionalSeverity(input: unknown, name: string): Severity | undefined {
  if (input === undefined) return undefined;
  return requiredSeverity(input, name);
}

function requiredSmell(input: unknown, name: string): SmellType {
  if (typeof input !== "string" || !smells.has(input as SmellType)) throw new Error(`${name} must be one of: ${[...smells].join(", ")}.`);
  return input as SmellType;
}

function optionalSmellArray(input: unknown, name: string): SmellType[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) throw new Error(`${name} must be an array of smell names.`);
  return input.map((item, index) => requiredSmell(item, `${name}[${index}]`));
}

function requiredRiskLevel(input: unknown, name: string): SliceDiagnosis["riskLevel"] {
  if (typeof input !== "string" || !riskLevels.has(input as SliceDiagnosis["riskLevel"])) throw new Error(`${name} must be one of: low, medium, high.`);
  return input as SliceDiagnosis["riskLevel"];
}

function parsePatternSource(input: unknown): SliceDiagnosis["patternSource"] {
  if (input === undefined || input === "builtin") return "builtin";
  throw new Error("patternSource must be builtin when provided.");
}

function optionalMetrics(input: unknown, name: string): SliceCandidate["metrics"] | undefined {
  if (input === undefined) return undefined;
  const value = requiredRecord(input, name);
  const metrics: Record<string, number> = {};
  for (const [key, metric] of Object.entries(value)) {
    if (typeof metric !== "number" || !Number.isFinite(metric)) throw new Error(`${name}.${key} must be a finite number.`);
    metrics[key] = metric;
  }
  return metrics as SliceCandidate["metrics"];
}
