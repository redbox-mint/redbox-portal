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

## SR-027 — Authenticated actor, brand and effective policies

`http/express/identity.ts` binds only credential-safe identity repository operations.
It hashes bearer credentials using the existing SHA-256/base64 representation,
verifies local passwords through the repository, resolves linked primary accounts,
and rereads disabled state and memberships. Cycles/orphan aliases fail closed.
Only ID, username and brand-qualified role IDs reach the authenticated context.
Brand/portal comes from matched path parameters and a current branding repository
read; query/body/session snapshots cannot supply actor or tenant authority.

`policies.ts` resolves ordered route policies followed by the most specific
controller/action/global mapping, including boolean allow/deny, normalized targets,
explicit overrides and missing-binding failure before serving. Pilot execution is
no-cache → brand/portal → authentication → brand-specific role/path authorization →
contract validation (the latter is bound in SR-029). An absent grant denies access.

Focused commands (qualified Node 26 PATH):

```sh
# In packages/redbox-core:
./node_modules/.bin/tsc
TS_NODE_PROJECT=test/tsconfig.json ../../node_modules/.bin/mocha --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --timeout 10000 test/http/Policies.test.ts
# Root:
npm --prefix packages/redbox-core run typecheck:application
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http npm --prefix packages/redbox-core run test:http-pilot:mongo
npm run lint
```

Production compile and strict application typecheck **exit 0**. Unit/real-loopback
HTTP **3 passing / 0 failures/pending**: policy overrides/order/booleans; linked,
disabled/orphan/cyclic actors and repository failures; unauthenticated/wrong-role/
wrong-brand/invalid-portal/spoofed-query denial and sanitized authentication errors.
Actual Prisma/Mongo identity **2 passing / 0 failures/pending**: credential hashing,
password verification, populated memberships, primary/alias resolution, immediate
membership/disable changes and deleted primary rejection. Required URL is asserted;
no conditional skip. Lint **890 files / 0 errors/warnings**, exit 0.

Disposable database host `sr-p4-mongo8`: **MongoDB 8.0.34 / FCV 8.0**, unauthenticated
standalone at **127.0.0.1:34903**, image
`sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
Commands: `docker run -d --name sr-p4-mongo8 --memory=768m -p 127.0.0.1::27017 mongo:8.0.34 --bind_ip_all --wiredTigerCacheSizeGB 0.25`,
`docker port sr-p4-mongo8 27017/tcp`, and live `mongosh` build/version, FCV and hello
queries. Fixture databases have checked unique `sr_p4_http_` prefixes and teardown
drops only those databases. No institution/topology qualification is claimed.

Initial strict check required an explicit linked-ID string annotation. First Mongo
setup attempted index maintenance before persistence initialization; fixed ordering.
Next **0 pass / 2 fail** exposed raw test tokens where the existing repository expects
already hashed tokens. Corrected the fixture to existing storage semantics; final
same tests pass. No production assertion, timeout or skip condition was weakened.

Deliberate security changes versus the legacy chain: absent/invalid authentication
returns **401** with a Bearer challenge, rather than a login redirect or a path-rule
403; operational auth errors return sanitized **500**. Missing path rules and
orphan aliases deny instead of recovering permissive legacy behavior. Authenticated
wrong-role/wrong-brand requests retain **403**. Consumers must authenticate and
configure explicit brand grants; there is no anonymous pilot access.
