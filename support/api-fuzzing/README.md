# ReDBox API Fuzzing Toolkit

Destructive-safe API fuzzing for ReDBox Portal using [Schemathesis](https://schemathesis.readthedocs.io/).

## How it works

The toolkit runs against a **dedicated ephemeral Docker Compose stack**. MongoDB and Solr have **no persistent data volumes**, so `docker compose down -v --remove-orphans` returns the environment to a clean state every time.

Bootstrap fixtures are mounted read-only and loaded on portal startup, providing known records, vocabularies, named queries, and reports for the fuzzer to target.

## Quick start

```bash
# Full destructive fuzzing run
./support/api-fuzzing/run-fuzz-stack.sh
```

## Directory layout

```
support/api-fuzzing/
├── docker-compose.fuzz.yml      # Dedicated ephemeral fuzz stack
├── run-fuzz-stack.sh            # Orchestrator: clean, generate, run, teardown
├── schemathesis.toml            # Schemathesis configuration
├── hooks/
│   └── redbox_hooks.py          # Auth injection (bearer/session-cookie), secret redaction
├── dictionaries/
│   └── redbox-edge.dict         # Mutation payload dictionary
├── bootstrap-data/              # Bootstrap fixtures (mounted read-only)
│   ├── records/
│   │   ├── rdmp.json
│   │   └── dataPublication.json
│   ├── vocabularies/
│   │   └── anzsrc-for.json
│   ├── namedqueries/
│   │   ├── listRDMPRecords.json
│   │   └── listDataPublications.json
│   └── reports/
│       ├── rdmpRecords.json
│       └── dataPublicationRecords.json
├── config/
│   └── local.js                 # Fuzz-specific config overlay
├── seeds/                       # Static seed ID files (consumed via TOML dictionaries)
│   ├── records.json
│   ├── users.json
│   ├── vocabularies.json
│   └── named-queries.json
└── README.md
```

Runtime artifacts go under `.tmp/api-fuzzing/`:

```
.tmp/api-fuzzing/
├── openapi/openapi.json         # Generated OpenAPI spec (default/rdmp)
├── reports/                     # Schemathesis JUnit reports
├── seeds/                       # Extracted seed IDs from bootstrap data
└── attachments/                 # Temp directory for file upload fuzzing
```

## Fuzzing profiles

### Full (default)
```bash
./support/api-fuzzing/run-fuzz-stack.sh
```
All HTTP methods. Bounded by `max_examples=50`. Destructive mutations do not persist after stack teardown.

### Smoke
```bash
REDBOX_FUZZ_PROFILE=smoke ./support/api-fuzzing/run-fuzz-stack.sh
```
`max_examples=3`. Quick validation that auth, spec loading, and bootstrap work.

### Read-heavy
```bash
REDBOX_FUZZ_PROFILE=read-heavy ./support/api-fuzzing/run-fuzz-stack.sh
```
GET only, no mutation endpoints. Safer for diagnosis.

### Reproduction
```bash
REDBOX_FUZZ_PROFILE=reproduction \
  REDBOX_FUZZ_SEED=12345 \
  REDBOX_FUZZ_OPERATION="listRecordsUsingGET" \
  ./support/api-fuzzing/run-fuzz-stack.sh
```
Re-runs a stored seed against one operation ID.

### Unauthenticated
```bash
REDBOX_FUZZ_PROFILE=unauthenticated ./support/api-fuzzing/run-fuzz-stack.sh
```
No bearer token. Tests auth-boundary behavior for session-cookie-only routes. Uses
`not_a_server_error`, `status_code_conformance`, and `content_type_conformance`
checks. No `500` responses should occur; privileged data must not be returned to
unauthenticated requests.

### Stable-smoke
```bash
REDBOX_FUZZ_PROFILE=stable-smoke ./support/api-fuzzing/run-fuzz-stack.sh
```
`--workers=1`, `max_examples=3`, phases=examples+coverage. Designed for
diagnosing network/resolution issues. On Schemathesis failure, automatically
prints container status and portal log tail to help diagnose harness problems.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `REDBOX_FUZZ_KEEP_STACK` | `false` | Keep stack alive after fuzzing for debugging |
| `REDBOX_FUZZ_SEED` | (random) | Hypothesis seed for reproducible runs |
| `REDBOX_FUZZ_MAX_EXAMPLES` | `50` | Max examples per endpoint |
| `REDBOX_FUZZ_OPERATION` | — | Operation ID filter (reproduction profile) |
| `REDBOX_FUZZ_PROFILE` | `full` | Fuzzing profile (full/smoke/read-heavy/reproduction/unauthenticated/stable-smoke) |
| `REDBOX_FUZZ_EXCLUDE_CHECKS` | `missing_required_header,ignored_auth,unsupported_method` | Comma-separated checks to exclude from the fuzz run |
| `REDBOX_FUZZ_AUTH_MODE` | `bearer` | Auth mode: `bearer` (injects token) or `none` (no credentials) |
| `RBPORTAL_IMAGE` | `qcifengineering/redbox-portal:develop` | Portal Docker image |

## Bootstrap data

Fixtures are mounted at `/opt/redbox-portal/bootstrap-data:ro` and loaded automatically by the ReDBox bootstrap service on portal startup.

Each service reads its subdirectory:
- `RecordsService.bootstrapData()` → `bootstrap-data/records/*.json`
- `ReportsService.bootstrapData()` → `bootstrap-data/reports/*.json`
- `NamedQueryService.bootstrapData()` → `bootstrap-data/namedqueries/*.json`
- `VocabularyService.bootstrapData()` → `bootstrap-data/vocabularies/*.json`

### Record format

JSON array of record objects. Each record requires `metaMetadata.type`, `workflow.stage`, `authorization`, `metadata`, and date fields.

### Vocabulary format

Single JSON object with `name`, `slug`, `description`, `type`, and `entries` array.

### Named query format

Single JSON object with `collectionName`, `mongoQuery`, `resultObjectMapping`, and optional `queryParams`/`sort`.

### Report format

Single JSON object with `title`, `reportSource`, `databaseQuery` referencing a named query, optional `filter` and `columns`.

## Seed extraction

During a run, the orchestrator calls API endpoints to discover IDs for bootstrapped records, vocabularies, etc., and writes them to `.tmp/api-fuzzing/seeds/seeds.dict` in libFuzzer/AFL format. These seed values are injected into the Schemathesis run via the `[parameters]` TOML config section, which binds the `seeds` dictionary to specific path/query parameters matching known ID patterns (`oid`, `record`, `slug`, `vocab`, etc.) with 0.3 probability.

Static seed files in `support/api-fuzzing/seeds/` provide fallback values when the API hasn't been queried yet.

## Auth model

ReDBox `/api/**` routes support two valid authentication modes:

- **Bearer token auth** — for external API clients.
- **Browser session cookie auth** — for embedded Angular apps (uses the session cookie + CSRF token).

The default authenticated fuzz run injects a bearer token. By default, three
Schemathesis checks are excluded:

- `missing_required_header` and `ignored_auth` — they assume the OpenAPI
  `Authorization` header is the only credential, which produces false positives
  for dual-auth routes.
- `unsupported_method` — Sails returns `404` (not `405`) for verbs like `TRACE`
  on unmatched routes.

To test bearer-only contract compliance strictly:

```bash
REDBOX_FUZZ_EXCLUDE_CHECKS="" ./support/api-fuzzing/run-fuzz-stack.sh
```

For auth-boundary testing (no credentials at all):

```bash
REDBOX_FUZZ_PROFILE=unauthenticated ./support/api-fuzzing/run-fuzz-stack.sh
```

## Security

- **Token**: The fuzz token `d077835a-696b-4728-85cf-3ffd57152b1e` is the standard ReDBox integration test token. It appears only in ephemeral, non-production environments.
- **Redaction**: The hooks module redacts the bearer token from all captured output.
- **No persistence**: MongoDB and Solr use no host or named data volumes. `docker compose down -v` completely resets state.

## Test scenarios

1. **Clean environment**: Run the fuzz stack twice. The second run starts with only bootstrap data, not data created by the first run.
2. **Bootstrap fixture**: Verify records, named queries, reports, and vocabularies are visible via API.
3. **Smoke fuzz**: Run with `REDBOX_FUZZ_PROFILE=smoke`. Confirm reports are generated.
4. **Destructive full run**: Allow all methods. Confirm mutations do not persist after teardown.
5. **Reproduction**: Re-run a stored seed against one operation ID.

## Troubleshooting

```bash
# Keep the stack alive for inspection
REDBOX_FUZZ_KEEP_STACK=true ./support/api-fuzzing/run-fuzz-stack.sh

# View portal logs
docker compose -p redbox-api-fuzz logs -f redboxportal-fuzz

# View schemathesis logs
docker compose -p redbox-api-fuzz logs schemathesis-fuzz

# Manual teardown
docker compose -p redbox-api-fuzz -f support/api-fuzzing/docker-compose.fuzz.yml down -v --remove-orphans
```
