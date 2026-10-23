# P4 authenticated standalone HTTP pilot

Starting source: `29c29f326` on `stack/sails-retirement`, shared checkout.
P0–P3 implementations are reused. Commands run from the repository root unless
specified. All checks prepend the absolute local toolchain directory
`.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin` to PATH:
Node **26.11.1**, npm **11.20.0**, TypeScript **5.9.3**, ts-node **10.9.2**,
Mocha **11.7.6**. Logs are summarized here and retained locally in ignored
`.tmp/sails-retirement/p4-*.log`. No dependency changes.

## SR-026 — Contract inputs and injected resolution

Shared extraction/validation now consumes `ApiRequestInput`: params, query, headers,
body and files, with optional route metadata for legacy resolution. No Sails request
type or helper is required. `getMergedApiRoutes(configuration)` accepts explicit
providers/runtime routes; `createApiRouteResolver(routes)` owns its selected route
snapshot. Existing no-argument comparison conveniences and their cache remain
legacy consumers for later retirement. Role metadata is documentation, not execution.
Public URLs, declared fallback order and Zod/OpenAPI contracts are retained.

Commands actually run:

```sh
npm --prefix packages/redbox-core run build
# In packages/redbox-core, with the absolute qualified PATH:
./node_modules/.bin/tsc
# Root:
npm --prefix packages/redbox-core run typecheck:application
npm run validate:api-routes
# In packages/redbox-core:
TS_NODE_PROJECT=test/tsconfig.json ../../node_modules/.bin/mocha --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts --timeout 10000 test/http/Contracts.test.ts test/bootstrap.test.ts test/unit/generate-openapi.test.ts
# Root:
npm run lint
```

Final production compilation and strict application typecheck **exit 0**.
Existing contract validation **49 passing / 0 failing/pending**. Focused contract,
bootstrap and actual OpenAPI/Blueprint generation **19 passing / 0 failing/pending**.
New cases cover minimal requests, missing/repeated query, query/path/body fallback
precedence, registry isolation and compiled imports with Sails loading forbidden.
Repository lint **888 files / 0 errors/warnings**, exit 0. No prior tests removed.

Initial clean build/typecheck failed because the new optional method needed an
explicit absent-value default; corrected. Initial new compiled-import case hit
Mocha's default 2-second limit while parallel compilers were running (**18 pass /
1 fail**); its subprocess allowance is explicitly 10 seconds and the final complete
focused command passes. Existing timeouts/assertions remain unchanged. The initial
build's Prisma generation/copy inputs passed; final phase clean build follows below.
