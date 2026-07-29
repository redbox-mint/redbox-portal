Figshare V2 uses small Effect-powered runtime programs around a branded `figsharePublishing` config.

Patterns used here:

- keep Sails-facing services thin
- assemble dependencies in `runtime.ts`
- keep binding/config/state helpers pure where practical
- isolate external Figshare calls behind `http.ts`

Hosted file uploads stage source datastreams through `StorageManagerService` before
Figshare multipart upload. The default disk is `figshare-staging`, with object keys under
`figshare/`; both can be overridden via `figsharePublishing.assets.staging.disk` and
`figsharePublishing.assets.staging.keyPrefix`. Staged objects are deleted after a
successful upload by default, or retained on success when `cleanupPolicy` is
`retainForRetry`. Failed uploads always make a best-effort delete of the staged object.

The legacy `tempDir` and `diskSpaceThresholdBytes` settings are retained for stored
configuration compatibility, but Figshare staging no longer reads them. Capacity failures
now surface from the configured StorageManager disk.
