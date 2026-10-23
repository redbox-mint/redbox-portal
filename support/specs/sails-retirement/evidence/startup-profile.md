# Source-load timing investigation

Runtime source: `ab0164416` on `stack/sails-retirement`, host **agentvm**.
Node **26.11.1**, npm **11.20.0**, TypeScript **5.9.3**, ts-node **10.9.2**,
Mocha **11.7.6**, JSDOM **30.1.2**. The original full-core result was 11.875 s
against a 12 s child timeout, with an earlier timeout in the same assertion.

## Measured cause

`profile-startup.cjs` times cold imports and the first real HTML sanitization.
For source loading it also times each ts-node `.ts` handler outside the module's
JavaScript evaluation. That measures file handling/transpilation/compiler overhead
without counting nested JavaScript evaluation twice. It is a diagnostic process;
no loader instrumentation is installed in the application.

| Measurement | Initial source | Final source | Initial compiled barrel | Final compiled barrel | Final standalone HTTP entry |
| --- | ---: | ---: | ---: | ---: | ---: |
| Import | 9,057 ms | 10,841 ms | 1,972 ms | 2,335 ms | 1,558 ms |
| First sanitize | 597 ms | 1,058 ms | 620 ms | 718 ms | 669 ms |
| TS file handling/transpilation | 7,153 ms | 8,396 ms | 0 | 0 | 0 |
| TS files processed | 615 | 615 | 0 | 0 | 0 |
| Total including loader setup | 9,956 ms | 12,229 ms | 2,592 ms | 3,053 ms | 2,227 ms |

Logs: `startup-{source,compiled}-profile.log` and
`startup-{source,compiled,standalone}-final.log`, under `.tmp/sails-retirement/`.
Every diagnostic exited **0**. The final runs were sequential after build/typecheck,
without a competing compilation. Provider fixtures were idle after their assertions.

The dominant cost is transpiling the full source barrel's 615 TypeScript modules.
The published comparison barrel exports services/controllers and their retained
adapters; source tests load that surface on each fresh child. Deployed code uses
the compiled tree. The narrow standalone HTTP entry loads in 1.558 s; its first
sanitize remains lazy and takes a further 669 ms. These are import/sanitize timings,
not a whole listener/database initialization benchmark.

## Timing policy and retained assertions

The source-import child's timeout is now **25 s**, with **30 s** for its Mocha
case. This gives roughly twice the final 12.229 s cold source-loader measurement.
A focused run while build/typecheck activity competed for CPU passed all original
assertions in **20.850 s** (`startup-headroom1.log`, **1 passing**, exit **0**),
which confirms why a 12 s subprocess limit was unreliable. No production startup
limit was increased: the compiled real-Mongo HTTP pilot retains its separate
**10 s** startup bound.

All original assertions remain: no eager Prisma implementations, JSDOM, full
Effect barrel or physical repository modules on core import; first-use HTML is
actually sanitized; comparison DOM ownership and persistence cleanup still work.
No startup algorithm was found consuming those extra 7–8 seconds in deployed
code. The correction therefore applies to the source-transpilation test budget.

## Reproduction

From repository root, select the qualified toolchain, then run in
`packages/redbox-core` after a successful build:

```sh
export PATH="/home/andrew/src/github/redbox-portal/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  ../../support/specs/sails-retirement/evidence/profile-startup.cjs source
node --no-experimental-strip-types \
  ../../support/specs/sails-retirement/evidence/profile-startup.cjs compiled
node --no-experimental-strip-types \
  ../../support/specs/sails-retirement/evidence/profile-startup.cjs standalone
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config test/unit/startup-module-loading.test.ts
```

The final Mongo-backed `npm run test:core` on source `3551a2985` executes this
unchanged assertion body in **11.717 s**: **4417 passing / 68 existing pending /
0 failing**, actual exit **0** (`companion-full-core-final.log`). It ran after
active HTTP/provider assertions, with only their idle Agenda watchdogs remaining.
Every new standalone/provider case ran separately without skips; see the
[upload qualification](p6-uploads.md#final-full-mongo-core-regression). The observed
source-loader range, including the 20.850 s competing-build run, supports the
test-only headroom rather than treating the original 11.875 s result as stable.
