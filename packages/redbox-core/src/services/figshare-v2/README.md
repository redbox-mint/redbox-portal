Figshare V2 uses small Effect-powered runtime programs around a branded `figsharePublishing` config.

Patterns used here:
- keep Sails-facing services thin
- assemble dependencies in `runtime.ts`
- keep binding/config/state helpers pure where practical
- isolate external Figshare calls behind `http.ts`
