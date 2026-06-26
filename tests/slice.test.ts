import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanForCandidates } from "../src/slice/scan.js";
import { diagnoseCandidate } from "../src/slice/diagnose.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "pi-health-"));
  mkdirSync(path.join(root, "src"));
  writeFileSync(path.join(root, "src", "utils.ts"), "export function tiny() {\n  return 1;\n}\n");
  writeFileSync(path.join(root, "src", "main.ts"), "import { tiny } from './utils';\nexport function used() { return tiny(); }\nexport function unused() { return 2; }\n");
  return root;
}

test("slice_scan finds deterministic candidates", async () => {
  const rootDir = fixture();
  const results = await scanForCandidates({ rootDir, maxResults: 10 });
  assert.ok(results.some((r) => r.smell === "dead_export" && r.functionName === "unused"));
  assert.ok(results.some((r) => r.smell === "singleton_utils_file"));
});

test("slice_diagnose explains candidates", async () => {
  const diagnosis = await diagnoseCandidate({ file: "src/main.ts", functionName: "unused", smell: "dead_export", severity: "low", metrics: { callerCount: 0 }, impactScore: 5 });
  assert.equal(diagnosis.recommendedPattern, "Remove Dead Code");
  assert.ok(diagnosis.rationale.includes("dynamic imports"));
});
