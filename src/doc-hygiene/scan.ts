import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { DocHygieneFinding, DocHygieneScanParams } from "./types.js";

const EXCLUDED = new Set(["node_modules", ".git", "dist", "build", ".pi"]);

export async function scanDocHygiene(params: DocHygieneScanParams = {}): Promise<DocHygieneFinding[]> {
  const root = path.resolve(params.rootDir ?? process.cwd());
  const files = params.files?.length ? params.files.map((f) => path.resolve(root, f)).filter(existsSync) : collectMarkdown(root);
  const findings: DocHygieneFinding[] = [];
  for (const abs of files) {
    const rel = path.relative(root, abs).split(path.sep).join("/");
    const text = readFileSync(abs, "utf8");
    const firstNonEmpty = text.split(/\r?\n/).find((l) => l.trim());
    if (!firstNonEmpty?.startsWith("#")) findings.push({ file: rel, signal: "missing_title", severity: "low", reason: "First non-empty line is not a markdown heading." });
    if (/\b(TODO|TBD|FIXME|WIP)\b/i.test(text)) findings.push({ file: rel, signal: "needs_review", severity: "medium", reason: "Contains TODO/TBD/FIXME/WIP marker." });
    if (/deprecated|obsolete|out[- ]?of[- ]?date|stale/i.test(text)) findings.push({ file: rel, signal: "stale", severity: "high", reason: "Contains explicit stale/deprecated wording." });
    if (/archive|historical|superseded/i.test(text) || rel.toLowerCase().includes("archive")) findings.push({ file: rel, signal: "archive_candidate", severity: "medium", reason: "Looks archival or superseded." });
  }
  return findings.slice(0, params.maxResults ?? 100);
}

function collectMarkdown(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDED.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (/\.mdx?$/i.test(entry.name)) out.push(abs);
    }
  };
  if (statSync(root).isDirectory()) walk(root);
  return out;
}
