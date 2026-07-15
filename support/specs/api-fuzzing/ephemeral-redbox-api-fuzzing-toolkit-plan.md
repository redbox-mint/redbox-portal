# Ephemeral ReDBox API Fuzzing Toolkit Plan

## Summary

Build a destructive-safe fuzzing toolkit that runs against a dedicated ephemeral Docker Compose stack by default. The stack must not persist MongoDB or Solr data through host or named volumes, so `docker compose down -v --remove-orphans` returns the environment to a clean state.

Use Schemathesis first for OpenAPI-driven structure-aware fuzzing, with fuzz dictionaries for mutation-style payloads and random generation enabled. Add bootstrap support so each run can start with known users, records, vocabularies, named queries, reports, and config.

## Public Interfaces / Files To Add

- `support/api-fuzzing/docker-compose.fuzz.yml`
  - Dedicated fuzz stack.
  - Services:
    - `redboxportal-fuzz`
    - `mongodb-fuzz`
    - `solr-fuzz`
    - `keycloak-fuzz`
    - `email-fuzz`
    - `schemathesis-fuzz`
  - MongoDB and Solr must have no host or named data volumes.
  - Only allowed mounts:
    - read-only source/config/bootstrap fixtures
    - writable `.tmp/api-fuzzing` reports/artifacts
    - optional attachment temp directory under `.tmp/api-fuzzing`.

- `support/api-fuzzing/run-fuzz-stack.sh`
  - Cleans prior fuzz stack with:
    ```bash
    docker compose -p redbox-api-fuzz -f support/api-fuzzing/docker-compose.fuzz.yml down -v --remove-orphans
    ```
  - Generates OpenAPI for `default/rdmp`.
  - Starts the ephemeral stack.
  - Runs Schemathesis.
  - Always prints the seed and report paths.
  - On success, tears down by default.
  - Supports `REDBOX_FUZZ_KEEP_STACK=true` for debugging.

- `support/api-fuzzing/schemathesis.toml`
  - Uses env vars for spec, base URL, token, seed, max examples, max time.
  - Enables examples, coverage, fuzzing, and bounded stateful phases.
  - Enables reports under `.tmp/api-fuzzing/reports`.

- `support/api-fuzzing/hooks/redbox_hooks.py`
  - Inject bearer auth.
  - Load optional seed IDs.
  - Apply ReDBox-specific parameter defaults.
  - Redact secrets in output.
  - Exclude or soften binary/download schema expectations unless explicitly included.

- `support/api-fuzzing/dictionaries/redbox-edge.dict`
  - Mutation values for strings, IDs, dates, query payloads, role names, record types, Lucene/Solr-ish search strings, HTML/script-like text, long values, malformed UUIDs.

- `support/api-fuzzing/bootstrap-data/`
  - Fuzz-specific bootstrap fixtures using existing ReDBox bootstrap conventions:
    - `records/*.json`
    - `reports/*.json`
    - `namedqueries/*.json`
    - `vocabularies/*.json`
  - Start by copying/adapting the current development bootstrap examples from `support/resources/development/bootstrap-data`.

- `support/api-fuzzing/config/`
  - Optional fuzz-only config overlays, mounted read-only into the portal container.
  - Include email notification config if needed.
  - Include any Solr/recordtype test config needed for representative API coverage.

- `support/api-fuzzing/seeds/`
  - Optional seed files consumed by Schemathesis hooks:
    - `records.json`
    - `users.json`
    - `vocabularies.json`
    - `named-queries.json`
  - These are derived from known bootstrap fixtures or a pre-fuzz setup script.

- `support/api-fuzzing/README.md`
  - Documents destructive behavior.
  - Documents clean teardown.
  - Documents bootstrap data shape.
  - Documents smoke, full, read-heavy, and reproduction runs.

## Default Compose Behavior

Use a dedicated Compose project name:

```bash
redbox-api-fuzz
```

MongoDB:
- Image: match current integration stack default.
- No `volumes:` entry for `/data/db`.
- Healthcheck same as existing integration compose.

Solr:
- Image: match current integration stack default.
- No data volume.
- `solr-precreate redbox`.
- Mount only read-only config if required, not data directories.

Portal:
- `NODE_ENV=integrationtest`
- `LOAD_DEFAULT_FORMS=true`
- `sails_security__csrf=false`
- fixed fuzz token:
  - `sails_brandingConfigurationDefaults__auth__local__default__token=d077835a-696b-4728-85cf-3ffd57152b1e`
- mount:
  - `support/api-fuzzing/bootstrap-data:/opt/redbox-portal/bootstrap-data:ro`
  - fuzz config overlays read-only
  - `.tmp/api-fuzzing/attachments:/attachments`
- set `sails_bootstrap__bootstrapDataPath=/opt/redbox-portal/bootstrap-data` if config env expansion supports it; otherwise rely on the mounted default `bootstrap-data` path.

Schemathesis:
- Runs after `redboxportal-fuzz` is healthy.
- Uses:
  - `REDBOX_OPENAPI_SPEC=/opt/api-fuzzing/openapi/openapi.json`
  - `REDBOX_BASE_URL=http://redboxportal-fuzz:1500`
  - `REDBOX_API_TOKEN=d077835a-696b-4728-85cf-3ffd57152b1e`

## Bootstrap Provisioning

Use existing ReDBox bootstrap service behavior:
- `RecordsService.bootstrapData()` reads `${bootstrap.bootstrapDataPath}/records/*.json`.
- `ReportsService.bootstrapData()` reads `${bootstrap.bootstrapDataPath}/reports/*.json`.
- Named query and vocabulary services already use bootstrap data conventions.

Add fuzz fixtures for:
- One RDMP record.
- One data publication record.
- One deleted/restorable record if useful for delete/restore endpoints.
- One vocabulary with representative entries.
- Named queries used by list/search/report endpoints.
- Report config with a small safe query.
- Users/roles can initially rely on core bootstrap and API token; add explicit user bootstrap only if an existing service supports it cleanly.

Add a pre-fuzz seed extraction step:
- After portal healthcheck passes, call selected API endpoints to discover IDs for bootstrapped records, users, vocabularies, named queries.
- Write discovered IDs to `.tmp/api-fuzzing/seeds/*.json`.
- Mount/pass those files to Schemathesis hooks.

## Fuzzing Profiles

Default full destructive profile:
- All methods enabled.
- All `/default/rdmp/api/**` endpoints included.
- Bounded by max examples and max time.
- Cleans stack before every run.

Smoke profile:
- `examples,coverage`
- `max_examples=3`
- Used to validate auth/spec/bootstrap.

Read-heavy profile:
- Excludes `POST`, `PUT`, `PATCH`, `DELETE`.
- Still uses ephemeral stack but safer for diagnosis.

Reproduction profile:
- Accepts seed plus include path/operation ID.
- Runs one endpoint or tag repeatedly.

File profile:
- Enables multipart/upload endpoints.
- Uses `test/bruno/attachment.png` or a fuzz fixture file.

## OpenAPI Flow

Generate before starting or inside the fuzz wrapper:

```bash
npm run doc:api -- --branding=default --portal=rdmp --out-dir=.tmp/api-fuzzing/openapi
```

Use:

```bash
.tmp/api-fuzzing/openapi/openapi.json
```

The specialized `default/rdmp` spec remains the default to avoid fuzzing branding/portal path params unnecessarily.

## Acceptance Criteria

- Default fuzz run creates a fresh Docker Compose project and starts from empty MongoDB/Solr container data.
- `docker compose down -v --remove-orphans` fully resets database/search state.
- Bootstrap fixtures are mounted read-only and loaded on portal startup.
- Schemathesis can run full destructive fuzzing without touching developer Mongo/Solr volumes.
- Reports and reproduction artifacts are written under `.tmp/api-fuzzing`.
- The stack can be kept alive for debugging with one env var.
- No mandatory CI changes are made initially.
- No semantic version ranges are added to `package.json`.

## Test Scenarios

1. Clean environment test
   - Run fuzz stack twice.
   - Confirm second run starts with only bootstrap data, not data created by first fuzz run.

2. Bootstrap fixture test
   - Verify records, named queries, reports, and vocabularies from `support/api-fuzzing/bootstrap-data` are visible via API.

3. Smoke fuzz test
   - Run Schemathesis with `max_examples=3`.
   - Confirm reports are generated.

4. Destructive full run
   - Allow all HTTP methods.
   - Confirm destructive mutations do not persist after stack teardown.

5. Reproduction run
   - Re-run a stored seed against one operation ID/path.

## Assumptions

- Fuzzing should default to this new ephemeral compose stack.
- Existing integration env settings and bootstrap conventions are suitable for fuzzing.
- MongoDB and Solr persistence must be container-local only.
- Bootstrap data should be explicit fixtures under `support/api-fuzzing/bootstrap-data`, not hidden state from previous test runs.
