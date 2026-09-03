# @researchdatabox/sails-hook-redbox-pdfgen

A ReDBox (Sails.js) hook that renders record view pages to PDF with headless Chromium (Puppeteer) and attaches the result to the record as a datastream.

It is typically wired into a record type's `onCreate`/`onUpdate` post-save triggers so that every save produces an up-to-date PDF snapshot of the record, without blocking the workflow if rendering fails.

- **Non-blocking** — `createPDF` returns the record immediately; rendering failures never fail the record save.
- **Self-healing** — transient failures are retried in the background with exponential backoff.
- **Branding aware** — configuration resolves per brand, with per-trigger overrides.
- **Observable** — every attempt emits an `IntegrationAuditService` record and an Effect tracing span.

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Wiring the hook into a record type](#wiring-the-hook-into-a-record-type)
- [How generation works](#how-generation-works)
- [Retries and error handling](#retries-and-error-handling)
- [Integration audit](#integration-audit)
- [Development](#development)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Requirements

| Requirement | Version / notes |
| --- | --- |
| Node.js | `24.14.1` (see `.nvmrc`) |
| ReDBox portal | v5 architecture; `@researchdatabox/redbox-core-types` `0.0.1-beta.10760` is a peer dependency |
| Chromium | Provided by the runtime image, or bundled by Puppeteer `25.0.4` |
| Docker | Only needed for the dev stack and Bruno API tests |

The hook resolves a Chromium binary in this order:

1. `PUPPETEER_EXECUTABLE_PATH`
2. `/usr/bin/chromium`
3. `/usr/bin/chromium-browser`
4. `/usr/bin/google-chrome-stable`
5. Puppeteer's own bundled download

Chromium is launched headless with `--no-sandbox` and a throwaway `--user-data-dir` that is removed after each attempt.

## Installation

Install into a ReDBox portal deployment:

```bash
npm install @researchdatabox/sails-hook-redbox-pdfgen
```

Sails loads it automatically as a hook (`sails.isHook` is set in `package.json`). The hook:

- merges its defaults into `sails.config.pdfgen`
- registers the `PDFService-CreatePDF` Agenda job into `sails.config.agendaQueue.jobs` (existing jobs are preserved)
- exposes `sails.services.pdfservice`
- registers the `pdfgen` config model with `AppConfigService` so it is editable from the portal admin UI

Local installs intentionally allow lifecycle scripts so Puppeteer and other native postinstall steps can run. Use `npm install --ignore-scripts` only in controlled CI or container contexts where a Chromium binary is provided separately.

## Configuration

Configuration lives under `sails.config.pdfgen` and is branding aware, so each brand can override it. Values are resolved with this precedence:

```
per-trigger options  >  branding-aware sails.config.pdfgen  >  built-in default
```

The same settings are editable in the portal admin UI under **PDF Generation Config** (config key `pdfgen`); `token` is registered as a secret field so it is masked there.

### Core settings

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `token` | string | `''` | API bearer token used to authenticate Chromium against the portal. **Required** — generation is skipped with a warning if unset. |
| `appUrlOverride` | string | `''` | Base URL to render from. Falls back to `sails.config.appUrl`. Useful when the portal's public URL is not reachable from inside the container. |
| `sourceUrlBase` | string | `/default/rdmp/record/view` | Path prefix for the page to render. The final URL is `` `${baseUrl}${sourceUrlBase}/${oid}` ``. Defaults to `/${brand.name}/rdmp/record/view` when unset. |
| `pdfPrefix` | string | `pdf` | Prefix for the generated filename. |
| `readinessStrategy` | enum | `networkIdle` | How to decide the page has finished rendering. See below. |
| `readinessTimeout` | number (ms) | `60000` | Timeout applied to the readiness wait. |
| `networkIdleTime` | number (ms) | `2000` | Idle window for the `networkIdle` strategies. |
| `waitForSelector` | string | `''` | CSS selector to wait for. Required by the `selector` strategies. |
| `waitForFunction` | string | `''` | JS expression polled every 500ms. Required by the `jsFlag` strategy. |
| `enableChromeLogging` | boolean | `false` | Pipe Chromium console, page errors, responses and failed requests into the Sails log. |
| `maxRetries` | number | `2` | Background retry attempts after the initial attempt. `0` disables retries. |
| `retryDelayMs` | number (ms) | `5000` | Base delay before the first retry. |
| `retryBackoffMultiplier` | number | `2` | Exponential multiplier: delay is `retryDelayMs * multiplier ^ retryIndex`. |
| `PDFOptions` | object | `{}` | Puppeteer `page.pdf()` options. |

### Readiness strategies

| Strategy | Waits for | Requires |
| --- | --- | --- |
| `networkIdle` | No network activity for `networkIdleTime` | — |
| `selector` | `waitForSelector` to appear | `waitForSelector` |
| `jsFlag` | `waitForFunction` to evaluate truthy | `waitForFunction` |
| `networkIdle+selector` | Network idle, then the selector | `waitForSelector` |

An unknown strategy logs a warning and falls back to `networkIdle`. A `selector`/`jsFlag` strategy with its required option missing or blank fails fast (and is *not* retried) rather than hanging until the timeout.

Angular-rendered record views generally need `selector` or `networkIdle+selector` — waiting on the loading indicator to disappear is the usual choice:

```js
{ readinessStrategy: 'selector', waitForSelector: 'div#loading.hidden' }
```

### PDF options

`PDFOptions` is passed to Puppeteer's `page.pdf()` on top of the defaults `{ format: 'A4', printBackground: true }`. Supported keys: `scale`, `displayHeaderFooter`, `headerTemplate`, `footerTemplate`, `printBackground`, `landscape`, `pageRanges`, `format`, `width`, `height`, `preferCSSPageSize`, `margin` (`top`/`bottom`/`left`/`right`), `omitBackground`, `tagged`, `outline`, `timeout`, `waitForFonts`.

`path` is deliberately stripped before the call — the buffer is written through ReDBox storage, never straight to the filesystem.

### Example

```js
// config/pdfgen.js
module.exports.pdfgen = {
  token: process.env.PDFGEN_API_TOKEN,
  sourceUrlBase: '/default/rdmp/record/view',
  pdfPrefix: 'rdmp-pdf',
  readinessStrategy: 'networkIdle+selector',
  waitForSelector: 'div#loading.hidden',
  readinessTimeout: 90000,
  maxRetries: 3,
  PDFOptions: {
    format: 'A4',
    printBackground: true,
    margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' }
  }
};
```

Environment-variable form (as used by the bundled Docker stacks):

```
sails_brandingConfigurationDefaults__pdfgen__token=6b088b4d-d54c-470c-8568-2f2695fcdab9
```

## Wiring the hook into a record type

### Inline trigger (simplest)

Call the service directly from a record type post-save trigger in `recordtype.config.js`:

```js
onUpdate: {
  post: [{
    function: 'sails.services.pdfservice.createPDF',
    options: {
      waitForSelector: 'div#loading.hidden',
      pdfPrefix: 'rdmp-pdf'
    }
  }]
}
```

Any config key from the table above can be supplied in `options` to override the brand-level configuration for that trigger.

### Queued trigger (recommended for busy portals)

The hook registers the `PDFService-CreatePDF` Agenda job (`lockLifetime` 120s, `lockLimit` 1, `concurrency` 1), so PDF work runs off the request path and only one render happens at a time per worker:

```js
{
  function: 'sails.services.rdmpservice.queueTriggerCall',
  options: {
    jobName: 'PDFService-CreatePDF',
    triggerConfiguration: {
      function: 'sails.services.pdfservice.createPDF',
      options: {
        readinessStrategy: 'networkIdle',
        pdfPrefix: 'rdmp-pdf'
      }
    }
  }
}
```

> Do **not** put `PDFService-CreatePDF` in a record hook's `function` field. ReDBox evaluates `function` as JavaScript, whereas `PDFService-CreatePDF` is the Agenda job name.

## How generation works

For each `createPDF(oid, record, options, user)` call:

1. Resolve the brand from `record.metaMetadata.brandId` and merge configuration.
2. Build the target URL: `` `${appUrlOverride || sails.config.appUrl}${sourceUrlBase}/${oid}` ``.
3. Skip if a render for that exact URL is already in flight (duplicate suppression).
4. Launch headless Chromium in a temporary user-data directory.
5. Set `Authorization: Bearer <token>` and navigate, waiting for `domcontentloaded`.
6. Apply the readiness strategy.
7. Render the PDF buffer with the merged `PDFOptions`.
8. Write it to the staging disk as `<pdfPrefix>-<oid>-<epochMillis>.pdf` and attach it via `DatastreamService.addDatastream`. If attaching fails, the staged file is deleted.
9. Tear down the page, browser and temp directory — including on failure.

`createPDF` returns an RxJS `Observable` that emits the **unchanged record**. Generation is best-effort: the record save proceeds regardless of the PDF outcome.

Effect tracing spans are emitted for `createPDF`, `generatePDF`, `navigatePage`, `waitForPageReady`, `renderPDFBuffer` and `saveToDatastream`.

## Retries and error handling

Errors are tagged, and only transient ones are retried:

| Error | Retryable | Meaning |
| --- | --- | --- |
| `BrowserError` | ✅ | Chromium launch, navigation or readiness failure |
| `PDFRenderError` | ✅ | `page.pdf()` failed |
| `DatastreamSaveError` | ✅ | Staging write or datastream attach failed |
| `MissingTokenError` | ❌ | `token` is unset — generation is skipped, logged as a warning |
| `InvalidReadinessOptionError` | ❌ | Strategy requires `waitForSelector`/`waitForFunction` and it is blank |
| `MissingBrandError` | ❌ | `record.metaMetadata.brandId` did not resolve to a brand |

Retry behaviour:

- Retries run in a background Effect daemon fiber, so the initial call returns straight away.
- Delay for retry *n* (0-indexed) is `retryDelayMs * retryBackoffMultiplier ^ n` — with defaults, 5s then 10s.
- A pending retry is cancelled if a newer request for the same URL succeeds first.
- On Sails `lower`, in-flight retry fibers are interrupted and the audit trail is closed out.

## Integration audit

Every pipeline emits records to ReDBox's `IntegrationAuditService`, surfaced via `GET /:branding/:portal/api/integration-audit/:oid` and the audit dashboard. Records are filed under `integrationName: 'pdf'` with two action types:

- **`generatePdfTrigger`** — one parent span per `createPDF` call. Captures `triggeredBy` (defaults to `'createPDF'`; override with `options.triggerSource`), `requestSummary.maxRetries`/`baseDelayMs`/`multiplier`, and on completion `responseSummary.finalStatus` (`success` / `failed` / `skipped`) plus `attemptsRun`.
- **`generatePdf`** — one child span per attempt (initial and every background retry). Each child shares the parent's `traceId` and links via `parentSpanId`. `requestSummary` carries `attempt`, `url`, `sourceUrlBase`, `readinessStrategy` and `pdfPrefix`. On success `responseSummary` includes `fileId` and `pdfBufferSize`; on failure it includes `errorTag` and the underlying `cause` message.

The hook owns its audit identifiers in `src/api/services/PDFAudit.ts` rather than registering with `redbox-core`. The relevant core types (`IntegrationAuditNameLike`, `IntegrationAuditActionLike`) are widened so hooks can ship new audit categories without a core release.

Audit calls degrade gracefully: when the global `IntegrationAuditService` is unavailable (for example in unit tests), `startPdfAudit`/`completePdfAudit`/`failPdfAudit` no-op and PDF generation is unaffected.

## Development

```bash
nvm use          # Node 24.14.1
npm install
npm run compile
npm run test:unit
```

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run compile` | TypeScript build to `dist/` via `redbox-dev-tools` |
| `npm run test:unit` | Compile, then run the Mocha unit suite in `test/unit` |
| `npm run test:integration:bruno` | Bring up the Bruno API test stack and run `test/bruno` |
| `npm run test:integration:bruno:clean` | Tear that stack down, including volumes |
| `npm test` | Unit tests followed by the Bruno suite |
| `npm run dev:run:prepare` | Create the local attachment staging directory |
| `npm run dev:run:build` | Build the dev portal image |
| `npm run dev:run` | Start the docker-backed portal harness |
| `npm run dev:run:clean` | Tear the dev stack down, including volumes |

Use the provided `run-hook-tsc` / `run-hook-mocha` entrypoints rather than calling `tsc` or `mocha` directly — they apply the shared ReDBox toolchain configuration.

### Local portal harness

```bash
npm run dev:run:prepare
npm run dev:run:build
npm run dev:run
```

This brings up the portal (with this hook mounted from your working copy), MongoDB and Solr:

| Service | URL |
| --- | --- |
| ReDBox portal | http://localhost:1500 |
| Node inspector | `localhost:9876` |
| MongoDB | `localhost:27017` |
| Solr | http://localhost:8983 |

Rebuild (`dev:run:build`) after changing `Dockerfile` or dependencies; for source changes, `npm run compile` and restart the stack.

The dev stack sets `NODE_TLS_REJECT_UNAUTHORIZED=0` and seeds a fixed `pdfgen.token` so Chromium can authenticate against the local portal over its self-signed setup. Both are development-only conveniences — never carry them into a deployed environment.

### API tests

`npm run test:integration:bruno` builds the portal image, waits for a healthy portal, and runs the Bruno collection in `test/bruno` (create an RDMP, confirm the PDF datastream exists, fetch it, and verify the integration audit records). JUnit output is written to `.tmp/junit/backend-bruno/`.

### CI

CircleCI (`.circleci/config.yml`) runs compile, unit tests and the Bruno suite on Node 24.14.1. Beta/next/alpha releases to npm are published through the `npm_publish_mode` pipeline parameters.

## Project structure

```
src/
  index.ts                        hook entrypoint (defineRedboxHook)
  config/pdfgen.ts                sails.config.pdfgen defaults and types
  config/agendaQueue.ts           PDFService-CreatePDF job registration
  api/services/PDFService.ts      generation pipeline, retries, duplicate suppression
  api/services/PDFErrors.ts       tagged error types
  api/services/PDFAudit.ts        IntegrationAuditService helpers
  api/configmodels/PDFGenConfig.ts  admin UI config model and JSON schema
test/
  unit/                           fast hook-local TypeScript tests
  bruno/                          Bruno API collection
support/
  development/                    docker-compose dev harness
  api-integration-testing/        docker-compose Bruno harness + record type fixture
```

### Dependency contract

This hook keeps its dependency declarations intentionally small:

- `@researchdatabox/redbox-core` is the ReDBox runtime compatibility anchor.
- `@researchdatabox/redbox-dev-tools` provides the shared compile and unit-test toolchain.
- Direct `dependencies` are reserved for hook-owned runtime libraries only (currently just `puppeteer`).
- Shared runtime/toolchain packages (`axios`, `rxjs`, `lodash`, `typescript`, `ts-node`, `mocha`, `chai`, `@researchdatabox/sails-ng-common`) come from the portal and must not be added here.
- Versions assume `redbox-core` and `redbox-dev-tools` are installed from npm, not from a sibling `redbox-portal` checkout.

The Docker compose files set `NODE_PATH` so a mounted hook resolves host-provided runtime dependencies from the portal's dependency tree — don't remove that unless the install model changes deliberately.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `API token for PDF generation is not set. Skipping generation` | `pdfgen.token` is empty for that brand. |
| PDF is blank or half-rendered | Readiness strategy returns too early — switch to `selector` / `networkIdle+selector`, or raise `readinessTimeout`. |
| `BrowserError` on every attempt | No Chromium at the resolved path — set `PUPPETEER_EXECUTABLE_PATH`. |
| Renders a login page instead of the record | Token invalid, or `appUrlOverride`/`sails.config.appUrl` unreachable from inside the container. |
| `MissingBrandError` | The record has no resolvable `metaMetadata.brandId`. |
| Nothing happens on save, no logs | The trigger isn't wired, or `PDFService-CreatePDF` was used in the `function` field instead of via `queueTriggerCall`. |

Set `enableChromeLogging: true` and raise the Sails log level to `verbose` to see Chromium console output, responses and failed requests.

## License

GPL-3.0
