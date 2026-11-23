# Uppy and TUS architecture

The Fastify production composition explicitly constructs the owned `ResumableUploads` and
`CompanionUploads` resources. Angular's `FileUploadComponent` uses Uppy and tus;
its remote provider plugins talk to the separately mounted Companion HTTP and
WebSocket protocol. See [setup and authorization](TUS-and-Uppy-Companion-Setup.md)
for deployment data, client credentials and verification.

1. Local uploads enter `/:branding/:portal/record/:oid/attach`; provider uploads
   enter `/:branding/:portal/companion/record/:oid/attach`. Resource requests add
   `/:attachId`. Both require an authenticated brand member and use the same
   authorization for existing records and `pending-oid`.
   [Upload permissions and CSRF](TUS-and-Uppy-Companion-Setup.md#authentication-and-client-changes)
2. The adapter binds staging and resume state to that actor/brand/record. Accepted
   chunk/finalization writes remain owned through connection loss and stop.
3. Companion is initialized once per process behind a private, unlistened
   Express app on the Fastify-owned server. That app serves only the configured
   provider namespace after native admission and security checks. Companion's
   Express request types and middleware are private to the provider adapter.
   Fastify verifies provider upgrade paths and canonical origins before dispatch.
   Portal progress uses its own Socket.IO protocol.
   [Audited Companion boundary](../specs/fastify-migration/evidence/FM-043.md#companion-express-boundary)
4. Stop closes admission, joins accepted work and releases owned resources.
   Beyond-deadline provider I/O and cleanup cron retain their documented process
   lifetime; restarting Companion requires a fresh process.

The production wiring is `packages/redbox-core/src/application/portal/host.ts`.
Transport implementations are `packages/redbox-core/src/http/fastify/resumableUploads.ts`
and `packages/redbox-core/src/http/integrations/companion/`. Configuration is validated
in `packages/redbox-core/src/configuration/portal.ts`; browser integration lives in
`angular/projects/researchdatabox/form/src/app/component/file-upload.component.ts`.

Read [maintenance and cutover](../specs/sails-retirement/maintenance-v6.md#uploadprogress-cutover-qualification)
before replacing v5 clients or reconciling incomplete transfers. Persistent bytes,
current ownership and actual completion must be checked independently of readiness
or a closed socket.
