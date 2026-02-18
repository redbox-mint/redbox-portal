# Secure Uppy Companion Endpoint

- [ ] Analyze current Companion configuration and usage <!-- id: 0 -->
  - [ ] Review `packages/redbox-core-types/src/config/companion.config.ts` <!-- id: 1 -->
  - [ ] Review `packages/redbox-core-types/src/config/http.config.ts` middleware setup <!-- id: 2 -->
  - [ ] Review `packages/redbox-core-types/src/config/policies.config.ts` and related policies for upload/auth interaction <!-- id: 3 -->
  - [ ] Review `file-upload` component interaction <!-- id: 4 -->
- [ ] Design security mechanism <!-- id: 5 -->
  - [ ] Define secure authenticated default for all `/companion/*` routes <!-- id: 6 -->
  - [ ] Define optional role/path-rule restriction for authenticated users only <!-- id: 7 -->
- [ ] Implement restrictions <!-- id: 8 -->
  - [ ] Add companion auth guard in `http.config.ts` (return `401` for unauthenticated requests) <!-- id: 10 -->
  - [ ] Keep existing companion middleware lifecycle intact (token restore, send-token, lazy init) <!-- id: 11 -->
  - [ ] Ensure no direct edits to generated shim files (`config/*.js`) <!-- id: 12 -->
- [ ] Verify changes <!-- id: 9 -->
  - [ ] Add/extend unit tests for companion auth middleware allow/deny behavior <!-- id: 13 -->
  - [ ] Re-run core-types tests and mocha integration tests <!-- id: 14 -->
  - [ ] Manually verify authenticated provider flow, unauthenticated 401, and optional role-based 403 <!-- id: 15 -->
