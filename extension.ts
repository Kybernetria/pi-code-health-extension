/**
 * pi-code-health-extension — protocol-only entry point.
 *
 * Registers the code_health node on the protocol fabric so callers can
 * invoke provides (slice_scan, slice_diagnose, slice_plan, doc_hygiene_scan)
 * through the shared protocol gateway instead of individual Pi tools.
 *
 * Reduces tool surface bloat: all capabilities are discoverable via
 * protocol describe_provide and invocable via protocol invoke.
 *
 * @kyvernitria/pi-protocol-minimal is an optional peer dep — if unavailable
 * the extension loads silently without protocol registration.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCodeHealthProtocolHandlers } from "./protocol/handlers.js";

const _require = createRequire(import.meta.url);

export default function codeHealthExtension(pi: ExtensionAPI) {
  registerProtocolIfAvailable();
}

function registerProtocolIfAvailable(): void {
  let protocolMinimal: typeof import("@kyvernitria/pi-protocol-minimal");
  try {
    protocolMinimal = _require("@kyvernitria/pi-protocol-minimal");
  } catch {
    // @kyvernitria/pi-protocol-minimal not installed — skip protocol registration.
    return;
  }

  const manifest = JSON.parse(
    readFileSync(new URL("./pi.protocol.json", import.meta.url), "utf8"),
  );

  const fabric = protocolMinimal.ensureProtocolFabric();
  fabric.unregister("code_health");
  protocolMinimal.registerProtocolManifest(fabric, {
    manifest,
    handlers: createCodeHealthProtocolHandlers(),
  });
}
