/**
 * pi-code-health-extension — protocol-only entry point.
 *
 * Registers the code_health node on the protocol fabric so callers can
 * invoke provides (slice_scan, slice_diagnose, slice_plan, doc_hygiene_scan)
 * through the shared protocol gateway instead of individual Pi tools.
 *
 * Reduces tool surface bloat: all capabilities are discoverable via
 * protocol describe_provide and invocable via protocol invoke.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ensureProtocolFabric, registerProtocolManifest, type PiProtocolManifest } from "@kyvernitria/pi-protocol-minimal";
import { createCodeHealthProtocolHandlers } from "./protocol/handlers.js";
import manifestJson from "./pi.protocol.json" with { type: "json" };

const manifest = manifestJson as unknown as PiProtocolManifest;

export default function codeHealthExtension(pi: ExtensionAPI) {
  const fabric = ensureProtocolFabric();
  fabric.unregister(manifest.nodeId);
  registerProtocolManifest(fabric, {
    manifest,
    handlers: createCodeHealthProtocolHandlers(),
  });
}
