# Uppy and TUS architecture

The Express host explicitly constructs the owned `ResumableUploads` and
`CompanionUploads` resources. Angular's `FileUploadComponent` uses Uppy and tus;
its remote provider plugins talk to the separately mounted Companion HTTP and
WebSocket protocol. See [setup and authorization](TUS-and-Uppy-Companion-Setup.md)
for deployment data, client credentials and verification.

1. Local uploads enter `/:branding/:portal/record/:oid/attach`; provider uploads
   enter `/:branding/:portal/companion/record/:oid/attach`. Resource requests add
   `/:attachId`. Both require the current authenticated actor, brand and record
   edit permission, with CSRF or independently verified bearer exemption.
2. The adapter binds staging and resume state to that actor/brand/record. Accepted
   chunk/finalization writes remain owned through connection loss and stop.
3. Companion is initialized once per process on an owned unlistened server
   bridge. The host forwards canonical allowed provider socket paths and origins;
   portal Socket.IO remains separate. Mutating Companion HTTP uses the bound
   policies and CSRF. A shared upload secret alone cannot authenticate an actor.
4. Stop closes admission, joins accepted work and releases owned resources.
   Beyond-deadline provider I/O and cleanup cron retain their documented process
   lifetime; restarting Companion requires a fresh process.

The production wiring is `packages/redbox-core/src/application/portal/http.ts`.
Transport implementations are `packages/redbox-core/src/http/express/resumableUploads.ts`
and `packages/redbox-core/src/http/express/companion.ts`. Configuration is validated
in `packages/redbox-core/src/configuration/portal.ts`; browser integration lives in
`angular/projects/researchdatabox/form/src/app/component/file-upload.component.ts`.

Read [maintenance and cutover](../specs/sails-retirement/maintenance-v6.md#uploadprogress-cutover-qualification)
before replacing v5 clients or reconciling incomplete transfers. Persistent bytes,
current ownership and actual completion must be checked independently of readiness
or a closed socket.
