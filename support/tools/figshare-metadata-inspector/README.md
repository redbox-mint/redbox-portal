# Figshare Metadata Inspector

This standalone TypeScript utility inspects the Figshare metadata relevant to a ReDBox `dataset` publishing integration. It uses only authenticated Figshare v2 endpoints and generates artifacts for building and checking a ReDBox → Figshare crosswalk.

The scope is deliberately narrow:

- institution: the institution associated with the authenticated Figshare account;
- item type: `dataset`;
- one configured Figshare group per run;
- API: Figshare v2 only;
- operations: read-only.

The utility is independent of the ReDBox runtime. It does not create drafts, publish items, or make any other write request.

## Requirements

- Node.js 20 or newer;
- a Figshare personal API token that can read account metadata for the selected institution group.

Install the pinned dependencies from this directory:

```sh
npm install
```

## Configuration

The token is sent only in the `Authorization` header. It is never logged, included in an endpoint URL, or retained in a report. HTTP errors redact token-shaped properties and the configured token value.

| Variable                | Purpose                                  | Default                           |
| ----------------------- | ---------------------------------------- | --------------------------------- |
| `FIGSHARE_TOKEN`        | Personal Figshare API token              | required                          |
| `FIGSHARE_API_URL`      | Figshare API root, with or without `/v2` | `https://api.figsh.com` (staging) |
| `FIGSHARE_GROUP_ID`     | Institution group to inspect             | `32014` (staging)                 |
| `FIGSHARE_OUTPUT`       | Output directory                         | `./output`                        |
| `FIGSHARE_TIMEOUT_MS`   | Per-request timeout                      | `30000`                           |
| `FIGSHARE_MAX_ATTEMPTS` | Attempts for transient GET failures      | `3`                               |

Configuration precedence is command-line option → environment variable → built-in default. The built-in group is intended for the repository's staging configuration. Verify the deployed institution configuration and pass the appropriate `--group-id` when inspecting another environment.

Do not put a real token in a committed shell script, `.env` file, fixture, or report.

## Usage

```sh
FIGSHARE_TOKEN=... \
FIGSHARE_API_URL=https://api.figsh.com/v2 \
npm run inspect
```

Or pass CLI options through the npm script:

```sh
npm run inspect -- \
  --token "$FIGSHARE_TOKEN" \
  --api-url https://api.figsh.com/v2 \
  --group-id 32014 \
  --output ./output
```

Run `npm run inspect -- --help` for all options. Raw output is enabled by default. `--no-raw` disables it, while `--raw-only` stops after writing the discovery payloads. `--verbose` prints endpoint and rate-limit diagnostics but never prints the token.

## What is discovered

The inspector makes these authenticated v2 requests:

| Endpoint                                     | Purpose                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| `/v2/account/institution/custom_fields`      | Institution custom-field definitions and stable IDs                              |
| `/v2/account/groups/{groupId}/metadata/item` | Effective fields, settings, ordering, and mandatory state for the selected group |
| `/v2/account/licenses`                       | Licence IDs and labels accepted by account items                                 |
| `/v2/account/categories`                     | Category IDs and hierarchy accepted by account items                             |

The group metadata response includes both inherited institution fields and group-only fields, but omits field IDs. The inspector matches effective group fields to institution definitions by exact field name. A match retains the institution ID and is marked `institution-custom`; an unmatched field is marked `group-custom` and receives the deterministic synthetic ID `group:{groupId}:{fieldName}`.

The v2 API does not expose the complete item-type/core-field schema available through v3. The standard fields actually emitted by the ReDBox dataset publisher are therefore represented by a pinned local integration contract:

- `title`;
- `description`;
- `keywords`;
- `authors`;
- `categories`;
- `license`;
- `funding`;
- `related_materials`;
- `defined_type`, fixed to `dataset`;
- `group_id`, fixed to the selected group.

This distinction is preserved in every report: these fields have source `core`, while remotely discovered fields use `institution-custom` or `group-custom`.

Custom fields are shown individually for crosswalk purposes. The publisher places their values inside the v2 payload's `custom_fields` object; that transport envelope is not emitted as a second field in the reports.

Responses are runtime-validated with permissive Zod schemas. Known stable properties are checked, while unknown properties pass through and are retained in `raw`. A malformed list or entry fails explicitly instead of silently producing an incomplete schema. GET requests retry network errors, HTTP 408/425/429 responses, and 5xx responses with bounded exponential backoff.

## Output

The default run writes:

```text
output/
├── raw/
│   ├── dataset-target.json
│   ├── core-fields.json
│   ├── institution-custom-fields.json
│   ├── group-<group-id>-item-metadata.json
│   ├── licenses.json
│   └── categories.json
├── figshare-schema.json
├── figshare-schema.html
├── figshare-schema.csv
└── crosswalk-template.json
```

- `raw/` contains the API objects exactly as received and the explicitly identified local core-field contract.
- `figshare-schema.json` is the canonical normalized model.
- `figshare-schema.html` is a human-readable field matrix with expandable controlled values and technical configuration.
- `figshare-schema.csv` is flat; controlled fields produce one row per value.
- `crosswalk-template.json` creates a blank ReDBox mapping entry for every field and includes controlled-value IDs where available.

Category parent identifiers are retained, and a readable `Parent → Child` path is constructed from category titles rather than relying on the API's numeric path representation.

## Controlled values

Controlled values are reported as one of:

- `inline`: options found directly in field settings;
- `license`: values from `/v2/account/licenses`;
- `category`: values and constructed hierarchy from `/v2/account/categories`;
- `dynamic`: authors or Figshare-managed large-list fields that require another runtime lookup;
- `none`: a recognized free-form type;
- `unknown`: a type or constraint that cannot be interpreted safely.

Unknown types remain in every output with their untouched configuration so they are visible for manual review.

## Library use

The CLI is an adapter over reusable services:

```ts
import {
  FigshareClient,
  MetadataDiscoveryService,
  MetadataNormaliser,
} from '@researchdatabox/figshare-metadata-inspector';

const http = new FigshareClient({
  token: process.env.FIGSHARE_TOKEN!,
  baseUrl: process.env.FIGSHARE_API_URL,
});

const discovery = await new MetadataDiscoveryService(http, {
  groupId: Number(process.env.FIGSHARE_GROUP_ID ?? 32014),
}).discover();

const metadata = await new MetadataNormaliser(http.baseUrl).normalise(discovery);
```

## Tests

The normal suite uses sanitized fixtures and never needs a real token:

```sh
npm test
```

The optional integration suite performs only the four authenticated GET requests listed above:

```sh
FIGSHARE_TOKEN=... \
FIGSHARE_API_URL=https://api.figsh.com/v2 \
FIGSHARE_GROUP_ID=32014 \
npm run test:integration
```

The integration suite is skipped unless a token is supplied and the integration-test script enables it.

## Known gaps and limitations

- The availability of Figshare v3 metadata endpoints depends on the institution configuration. The inspector does not call v3 and cannot discover enabled item types or their complete field configuration.
- Only `dataset` is represented. Other Figshare item types are intentionally excluded.
- Core dataset fields are a versioned local description of the ReDBox publishing payload, not a schema returned by Figshare. Changes to the publisher or Figshare's validation rules require this contract and its tests to be updated.
- One group is inspected per run. Fields belonging only to other institution groups are not included.
- `/v2/account/groups/{groupId}/metadata/item` is group-scoped rather than item-type-scoped. v2 provides no way to prove that a returned custom field applies exclusively to `dataset`; this tool treats the selected group's effective item fields as the relevant dataset field set.
- The group endpoint omits custom-field IDs. Institution fields are correlated by exact name, which can become ambiguous if names are duplicated or renamed. Group-only field IDs are synthetic and are not valid Figshare API identifiers.
- Figshare-managed large-list options and author values are not fully enumerated by these endpoints and remain `dynamic`.
- v2 does not expose every stock-field constraint or item-type-specific validation rule. A successful report is not proof that every constructed publish payload will be accepted.
- For information absent from v2, use an institution-admin metadata export or configuration review, compare a known-good dataset payload, and confirm uncertain validation rules with the Figshare liaison. Any manual findings should be captured in the local contract and regression fixtures.
- Write-based validation probing is intentionally excluded because it can create drafts or other account state. If added later, it must be a separate, explicit opt-in workflow with cleanup and authorization safeguards.
