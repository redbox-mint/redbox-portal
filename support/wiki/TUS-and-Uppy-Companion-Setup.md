# TUS and Uppy Companion setup

V6 uses the owned Express `ResumableUploads` and `CompanionUploads` adapters.
Browser integrations must follow [v6 client compatibility](V6-Client-Compatibility.md)
and [upload ownership and maintenance](../specs/sails-retirement/maintenance-v6.md#uploadprogress-cutover-qualification).

## Explicit configuration

Put `companion` in the deployment data module selected by
`REDBOX_APPLICATION_CONFIG`. The following complete module illustrates the data
shape; replace the example secret and provider credentials in private deployment
configuration before enabling a real provider:

```js
module.exports = {
  companion: {
    enabled: true,
    secret: 'replace-this-with-a-private-secret-of-at-least-32-characters',
    filePath: '/var/lib/redbox/companion',
    route: '/companion',
    server: { host: 'research.example.edu', protocol: 'https', path: '/companion' },
    providerOptions: {
      drive: { key: 'replace-with-provider-client-id', secret: 'replace-with-provider-client-secret' },
    },
    uploadUrls: ['https://research.example.edu/default/rdmp/companion/record/.+/attach'],
    metrics: false,
  },
};
```

Set `server.publicUrl` and `server.rootContext` consistently with the deployed
origin/root. Keep `filePath` on persistent writable storage through drain and
process exit. Configure only the selected providers and exact permitted upload
URLs. Register provider callbacks under the selected public Companion path:
`/companion/drive/redirect`, `/companion/onedrive/redirect`, or
`/companion/dropbox/redirect` as applicable. Provider credentials and institutional
OAuth acceptance need separate verification.

The local development Compose workflow deliberately converts a **subset** of
`UPPY_*` variables in `support/development/application.cjs`: enablement, secret,
bearer/attachment credentials, upload URLs, Google/OneDrive keys and server
host/protocol. These are inputs to that specific data module, not general v6
host environment overrides. Other deployment settings, including `filePath`,
belong in the explicit module. See [development](../development/README.md).

## Authentication and client changes

Every attachment request requires an authenticated actor with current brand and
record edit permission. A configured shared attachment secret does not establish
that actor. A remote transfer must supply the deployment's verified actor
credential; configure provider upload headers through `companion.uploadHeaders`
when needed. Keep browser CSRF tokens on applicable raw requests, including HEAD
resume checks. Only the host's independently verified bearer identity receives
the API CSRF exemption. Recheck current permissions when resuming.

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

The host creates one pinned Companion 7.1.1 app during initialization. Metrics
are explicit; Redis and periodic pings are unsupported. A second application or
restart needs a fresh process. Stop fences new work, drains admitted transfers
within the deadline and terminates remaining transports. Provider-internal I/O
and cleanup cron have process lifetime; keep temporary bytes until process exit.

With the [development prerequisites](../development/README.md) met, test fresh
login, local create/chunk/HEAD resume, remote provider authorization and actual
transfer, wrong actor/brand/record rejection, missing CSRF, denied origin, restart
and interrupted-transfer reconciliation. `/readyz` alone does not verify OAuth
or successful bytes. Old staging metadata without trusted ownership stays
retained for explicit reconciliation or an authorized restart of the upload.

## Code paths

- `packages/redbox-core/src/http/express/resumableUploads.ts`: routes and owned tus adapter.
- `packages/redbox-core/src/http/express/companion.ts`: provider HTTP/socket admission and cleanup.
- `packages/redbox-core/src/application/portal/http.ts`: production composition and policies.
- `packages/redbox-core/src/configuration/portal.ts`: explicit configuration validation.
- `angular/projects/researchdatabox/form/src/app/component/file-upload.component.ts`: browser client.
