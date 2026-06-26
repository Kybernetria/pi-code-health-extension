import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProtocolFabric, registerProtocolManifest, type PiProtocolManifest } from "@kyvernitria/pi-protocol-minimal";
import manifestJson from "../pi.protocol.json" with { type: "json" };
import { createCodeHealthProtocolHandlers } from "../protocol/handlers.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "pi-health-protocol-"));
  mkdirSync(path.join(root, "src"));
  writeFileSync(path.join(root, "src", "utils.ts"), "export function tiny() {\n  return 1;\n}\n");
  writeFileSync(path.join(root, "src", "main.ts"), "import { tiny } from './utils';\nexport function used() { return tiny(); }\nexport function unused() { return 2; }\n");
  writeFileSync(path.join(root, "README.md"), "TODO: add title\n");
  return root;
}

function registeredFabric() {
  const fabric = createProtocolFabric();
  registerProtocolManifest(fabric, {
    manifest: manifestJson as unknown as PiProtocolManifest,
    handlers: createCodeHealthProtocolHandlers(),
  });
  return fabric;
}

test("protocol manifest registers all read-only provides", () => {
  const fabric = registeredFabric();
  const node = fabric.describeNode("code_health");
  assert.ok(node);
  assert.deepEqual(node.provides.map((provide) => provide.name).sort(), ["doc_hygiene_scan", "slice_diagnose", "slice_plan", "slice_scan"]);
  for (const provide of node.provides) assert.deepEqual(provide.effects, ["file_read"]);
});

test("protocol invoke supports scan, diagnose, plan, and doc hygiene", async () => {
  const rootDir = fixture();
  const fabric = registeredFabric();

  const scan = await fabric.invoke({ nodeId: "code_health", provide: "slice_scan", input: { rootDir, maxResults: 10 } });
  assert.equal(scan.ok, true);
  const candidates = (scan as { ok: true; output: Array<{ smell: string; functionName?: string }> }).output;
  const candidate = candidates.find((item) => item.smell === "dead_export" && item.functionName === "unused");
  assert.ok(candidate);

  const diagnosis = await fabric.invoke({ nodeId: "code_health", provide: "slice_diagnose", input: candidate });
  assert.equal(diagnosis.ok, true);

  const plan = await fabric.invoke({ nodeId: "code_health", provide: "slice_plan", input: (diagnosis as { ok: true; output: unknown }).output });
  assert.equal(plan.ok, true);
  assert.equal(typeof (plan as { ok: true; output: { id: string } }).output.id, "string");

  const docs = await fabric.invoke({ nodeId: "code_health", provide: "doc_hygiene_scan", input: { rootDir } });
  assert.equal(docs.ok, true);
  assert.ok((docs as { ok: true; output: Array<{ signal: string }> }).output.some((item) => item.signal === "missing_title"));
});

test("protocol validator rejects invalid input", async () => {
  const fabric = registeredFabric();
  const result = await fabric.invoke({ nodeId: "code_health", provide: "slice_diagnose", input: { file: "src/a.ts", smell: "not_a_smell", severity: "low" } });
  assert.equal(result.ok, false);
  assert.equal((result as { ok: false; error: { code: string } }).error.code, "INVALID_INPUT");
});
