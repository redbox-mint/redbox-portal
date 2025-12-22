# Agents Guide (@researchdatabox/redbox-core-types)

Shared TypeScript types for ReDBox core and hooks.

## Basics
- Node target: 24.x (matches root `.nvmrc`).
- Sources live in `src/`; compiled output in `dist/` (shipped in npm tarball).
- Used by the portal, hooks, and sibling packages; keep API changes deliberate.

## Install & Build
- Install: `npm ci`.
- Compile: `npx tsc` (or run via root script `npm run compile:core`).

## Tests
- No automated tests here; if modifying type contracts, add quick unit tests (e.g., `ts-node` + assertions) or compile a dependent package to prove compatibility.

## Tips
- Avoid breaking type contracts without coordinating downstream updates (`sails-ng-common`, hook-kit, portal controllers).
- Keep `types` and `main` pointing at `dist/`; do not commit `node_modules/`.
