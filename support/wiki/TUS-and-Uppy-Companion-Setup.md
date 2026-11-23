# TUS and Uppy Companion setup

The Fastify host uses native TUS upload handling and an isolated adapter for
optional Companion imports.
Browser integrations must follow [v6 client compatibility](V6-Client-Compatibility.md)
and [upload ownership and maintenance](../specs/sails-retirement/maintenance-v6.md#uploadprogress-cutover-qualification).

## Explicit configuration

Put `companion` in the deployment data module selected by
`REDBOX_APPLICATION_CONFIG`. The following complete module illustrates the data
shape; replace the example secret and provider credentials in private deployment
configuration before enabling a real provider:

```js
module.exports = {
  server: { publicUrl: 'https://research.example.edu/research', rootContext: '/research' },
  companion: {
    enabled: true,
    secret: 'replace-this-with-a-private-secret-of-at-least-32-characters',
    filePath: '/var/lib/redbox/companion',
    route: '/companion',
    server: { host: 'research.example.edu', protocol: 'https', path: '/companion' },
    providerOptions: {
      drive: { key: 'replace-with-provider-client-id', secret: 'replace-with-provider-client-secret' },
    },
    uploadUrls: ['https://research.example.edu/research/default/rdmp/companion/record/'],
    metrics: false,
  },
};
```

Set `server.publicUrl` and `server.rootContext` consistently with the deployed
origin/root. Keep `filePath` on persistent writable storage through drain and
process exit. For each allowed brand and portal, give `uploadUrls` a literal
origin and path prefix ending in `/companion/record/`, including any deployment
root. Companion 7.1.1 compares string entries by origin and literal path
boundary, admitting the attachment creation and resume URLs under that prefix.

The portal supports Google Drive and OneDrive. For the `/research` example, the
OAuth redirect paths are `/research/companion/drive/redirect` and
`/research/companion/onedrive/redirect`. Register the full HTTPS URL for each
selected provider and verify institutional OAuth separately.

The development data module maps selected `UPPY_*` values for enablement,
the Companion application secret, Google Drive and OneDrive credentials,
upload URLs, and server host/protocol. Its default allowlist uses the
configured public origin and root context with the `default/rdmp` paths.
Set `UPPY_COMPANION_UPLOAD_URLS` to comma-separated literal prefixes to override
it. In other deployments, supply explicit `companion` configuration data.
[Development module](../development/application.cjs)

## Authentication and client changes

Both local TUS and Companion attachment creation and resume require an
authenticated actor with membership in the target brand. The target determines
which permission the server checks on both creation and resume.

- For an existing record, the actor needs edit permission on that record and
  the record must belong to the target brand.
- For `pending-oid`, the actor needs create permission at the initial workflow
  step of at least one eligible record type in the target brand. An eligible record type is any record type in the target brand that has a workflow step marked `starting: true`. Hidden starting steps count. Access is granted when the actor passes the create-access check for that record type's package type and starting step.

A remote transfer supplies the actor credential through `companion.uploadHeaders`
when needed. Keep browser CSRF tokens on applicable raw requests, including
HEAD resume checks. Only the host's independently verified bearer identity
receives the API CSRF exemption.

The browser/local routes are `/:branding/:portal/record/:oid/attach` and its
`/:attachId` resource. Remote routes add `/companion` before `/record`; they use
the same owned upload authorization and actor/brand/record binding. Returned
Locations are root-relative; resolve them against the configured public origin.

Companion HTTP runs the bound actor/brand/path policies. Mutating provider requests
also require CSRF or the verified bearer exemption. Its WebSocket protocol is
separate from portal Socket.IO and validates canonical origins and known transfer
or callback paths. No shared secret authorizes arbitrary browser or socket work.

Use the current `FileUploadComponent` declaration and `FileUploadModel` from
`sails-ng-common`; see [form configuration](Configuring-Record-Forms.md).
Select `enabledSources`, the root-aware `companionUrl`, restrictions and any
required `tusHeaders` in the component's config. Deploy current browser assets
with the server. Do not reuse v5 virtual socket upload calls.

## Lifecycle and verification

When enabled, the host creates one pinned Companion 7.1.1 app during
initialization. Let the host load it first so the version- and hash-checked
loader can install bounded provider logging. Metrics are opt-in. Omit Redis
and periodic pings. Socket grants and transfers are process-local. Restart in
a fresh process, retaining temporary bytes until the previous process exits.
Stop fences new work and drains admitted transfers within the deadline.
Provider I/O and cleanup cron can outlive transport closure. Reconcile
interrupted work against the provider and record before retrying.
[Companion process limits](../specs/fastify-migration/companion.md#process-lifetime-and-limits)

With the [development prerequisites](../development/README.md) met, test fresh
login, local create/chunk/HEAD resume, remote provider authorization and actual
transfer, wrong actor/brand/record rejection, missing CSRF, denied origin, restart
and interrupted-transfer reconciliation. `/readyz` alone does not verify OAuth
or successful bytes. Old staging metadata without trusted ownership stays
retained for explicit reconciliation or an authorized restart of the upload.

## Code paths

- `packages/redbox-core/src/http/fastify/resumableUploads.ts`: routes and owned tus adapter.
- `packages/redbox-core/src/http/integrations/companion/`: provider HTTP/socket admission and cleanup.
- `packages/redbox-core/src/application/portal/host.ts`: production composition and policies.
- `packages/redbox-core/src/configuration/portal.ts`: explicit configuration validation.
- `angular/projects/researchdatabox/form/src/app/component/file-upload.component.ts`: browser client.
