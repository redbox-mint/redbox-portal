# Agents Guide (@researchdatabox/raido-openapi-generated-node)

Generated TypeScript/axios client for Raido OpenAPI.

## Basics
- Lives under `packages/raido`. Uses root Node toolchain (24.x).
- Source under `src/` is generated; `dist/` is the published payload.
- Spec URL is remote (see `package.json generate`); avoid regenerating if offline or without approval.

## Install & Build
- Install: `npm ci` (from this folder).
- Build: `npm run build` (tsc emits to `dist/`).
- Generate (when network allowed): `npm run generate` (downloads OpenAPI spec) then `npm run build`.

## Tests
- No automated tests defined. If you change generation templates or postprocessing, add a minimal smoke script or compile check to validate the emitted client.

## Tips
- Prefer not to hand-edit `src/`; patch upstream spec or postprocess if necessary.
- Keep version numbers in sync with the root portal dependency and publish flow.
- Do not commit `node_modules/`; only `dist/` is tracked for packaging.
