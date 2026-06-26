# pi-code-health-extension

A standalone Pi extension that points out where a TypeScript codebase is getting messy.

It is intentionally read-only: it suggests refactors, diagnoses risks, and can draft a plan, but it does **not** edit or refactor files automatically.

## Tools and protocol provides

The Pi extension still registers the original read-only tools:

- `slice_scan` — ranks TypeScript code smells/refactor candidates.
- `slice_diagnose` — explains one candidate in plain language.
- `slice_plan` — optional read-only refactor plan from a diagnosis.
- `doc_hygiene_scan` — optional deterministic Markdown hygiene scan.

It also registers `pi.protocol.json` with node id `code_health` and exposes the same names as handler-backed pi-protocol provides. All protocol provides declare only the `file_read` effect and never mutate files.

Preserved smell types:

- `god_file`
- `high_complexity`
- `dead_export`
- `tight_coupling`
- `hub_creep`
- `singleton_utils_file`
- `trivial_helper`

## Install/use in Pi

From this directory:

```bash
npm install
pi -e ./extension.ts
```

Or add this folder to Pi settings/packages; `package.json` exposes `./extension.ts` as the package extension.

## Protocol package notes

- Manifest: `pi.protocol.json` (`protocolVersion`: `0.2.0`).
- Bootstrap: `extension.ts` calls `ensureProtocolFabric()`, unregisters `code_health` for reload safety, and registers the manifest with handlers from `protocol/handlers.ts`.
- Local development currently uses `@kyvernitria/pi-protocol-minimal` via a relative `file:` dependency because the package is not published in npm.

## Checks

```bash
npm test
npm run typecheck
```

## Notes

The scanner is deterministic and works without LLM calls or bakery orchestration. It uses `ts-morph`/TypeScript AST analysis for functions, methods, imports, exports, and call resolution, but results are still candidates to inspect, not proof that code is safe to delete or move. Always check tests, dynamic imports, public package consumers, CLIs, and config references before refactoring.
