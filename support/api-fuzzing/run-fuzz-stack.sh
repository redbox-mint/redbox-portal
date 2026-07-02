#!/usr/bin/env bash
set -euo pipefail

# -- Ephemeral ReDBox API Fuzzing Toolkit --
# Runs destructive-safe fuzzing against a dedicated ephemeral
# Docker Compose stack. MongoDB and Solr have no persistent
# volumes -- "docker compose down -v" fully resets state.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.fuzz.yml"
COMPOSE_PROJECT="redbox-api-fuzz"

TMP_DIR="$REPO_ROOT/.tmp/api-fuzzing"
OPENAPI_DIR="$TMP_DIR/openapi"
REPORT_DIR="$TMP_DIR/reports"
SEED_DIR="$TMP_DIR/seeds"
ATTACHMENTS_DIR="$TMP_DIR/attachments"
EMAIL_DIR="$TMP_DIR/email"

FUZZ_TOKEN="d077835a-696b-4728-85cf-3ffd57152b1e"

# -- Prerequisite checks --
for cmd in docker npm curl python3; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "ERROR: Required command '$cmd' not found. Please install it first."
        exit 1
    fi
done

if ! docker compose version >/dev/null 2>&1; then
    echo "ERROR: 'docker compose' (v2 plugin) not available."
    exit 1
fi

# -- Profile variables (overridable) --
REDBOX_FUZZ_PROFILE="${REDBOX_FUZZ_PROFILE:-full}"
REDBOX_FUZZ_SEED="${REDBOX_FUZZ_SEED:-}"
REDBOX_FUZZ_MAX_EXAMPLES="${REDBOX_FUZZ_MAX_EXAMPLES:-50}"
REDBOX_FUZZ_KEEP_STACK="${REDBOX_FUZZ_KEEP_STACK:-false}"
REDBOX_FUZZ_EXCLUDE_CHECKS="${REDBOX_FUZZ_EXCLUDE_CHECKS:-missing_required_header,ignored_auth,unsupported_method}"
REDBOX_FUZZ_AUTH_MODE="${REDBOX_FUZZ_AUTH_MODE:-bearer}"
# Multipart file-upload operations cannot be meaningfully fuzzed (Schemathesis cannot
# synthesise real uploaded files), and RVA imports depend on an upstream service that
# is not reliable enough for deterministic fuzzing. Set to an empty string to include
# them.
REDBOX_FUZZ_EXCLUDE_OPERATIONS="${REDBOX_FUZZ_EXCLUDE_OPERATIONS:-uploadBrandingLogo,uploadRecordDatastreams,importVocabulary,syncVocabulary}"

# -- Help --
usage() {
    cat <<EOF
Usage: $(basename "$0") [profile]

Profiles:
  full            (default) All HTTP methods, max_examples=50
  smoke           max_examples=3, validate auth/spec/bootstrap
  read-heavy      GET only, safe for diagnosis
  reproduction    Re-run a specific seed + operation ID
                  Set REDBOX_FUZZ_SEED=<seed> and REDBOX_FUZZ_OPERATION=<op-id>
  unauthenticated No bearer token, tests auth-boundary for session-only routes
  stable-smoke    workers=1, max_examples=3, phases=examples+coverage

Environment:
  REDBOX_FUZZ_KEEP_STACK=true         Keep stack alive after fuzzing
  REDBOX_FUZZ_SEED=<int>              Hypothesis seed for reproducibility
  REDBOX_FUZZ_MAX_EXAMPLES=<int>      Max examples per endpoint (default 50)
  REDBOX_FUZZ_OPERATION=<id>          Filter to single operation (reproduction)
  REDBOX_FUZZ_EXCLUDE_CHECKS=<list>   Comma-separated checks to exclude (default: missing_required_header,ignored_auth,unsupported_method)
  REDBOX_FUZZ_AUTH_MODE=<bearer|none> Auth mode for requests (default: bearer)
EOF
    exit 1
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    usage
fi

PROFILE="${1:-$REDBOX_FUZZ_PROFILE}"

# -- Banner --
echo "=========================================="
echo " ReDBox API Fuzzing Toolkit"
echo "=========================================="
echo " Profile:       $PROFILE"
echo " Compose:       $COMPOSE_FILE"
echo " Project:       $COMPOSE_PROJECT"
echo "=========================================="
echo ""

# -- Step 1: Clean previous fuzz stack --
echo "[1/8] Cleaning previous fuzz stack..."
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
rm -rf "$TMP_DIR"

# -- Step 2: Compile backend package artifacts used by the mounted portal --
echo "[2/8] Compiling redbox-core..."
npm run compile:core 2>&1 || {
    echo "ERROR: redbox-core compilation failed."
    exit 1
}

# -- Step 3: Generate OpenAPI spec --
echo "[3/8] Generating OpenAPI spec..."
mkdir -p "$OPENAPI_DIR"
npm run doc:api -- --branding=default --portal=rdmp --out-dir="$OPENAPI_DIR" 2>&1 || {
    echo "ERROR: OpenAPI generation failed."
    echo "       Ensure redbox-core is built: npm install && npm run build"
    exit 1
}
echo "  OpenAPI spec: $OPENAPI_DIR/openapi.json"

# -- Step 4: Create runtime directories and seed files --
echo "[4/8] Creating runtime directories..."
mkdir -p "$REPORT_DIR" "$SEED_DIR" "$ATTACHMENTS_DIR" "$EMAIL_DIR"

echo '[]' > "$SEED_DIR/records.json"
echo '[]' > "$SEED_DIR/storage-oids.json"
echo '[]' > "$SEED_DIR/users.json"
echo '[]' > "$SEED_DIR/vocabularies.json"
echo '[]' > "$SEED_DIR/named-queries.json"
echo '[]' > "$SEED_DIR/harvest-runs.json"
echo '[]' > "$SEED_DIR/vocab-entries.json"
echo '[]' > "$SEED_DIR/dashboard-configs.json"
echo '[]' > "$SEED_DIR/report-configs.json"

# Copy schemathesis.toml into the tmp dir so it's available to the container
cp "$SCRIPT_DIR/schemathesis.toml" "$TMP_DIR/schemathesis.toml"

# -- Step 5: Build fuzz image and launch ephemeral stack --
echo "[5/8] Building fuzz image and launching ephemeral stack..."
echo "  Building schemathesis-fuzz image (pinned 4.21.0)..."
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" build schemathesis-fuzz
echo "  Launching stack services..."
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" up -d \
    mongodb-fuzz solr-fuzz keycloak-fuzz email-fuzz redboxportal-fuzz

echo "  Waiting for portal to become healthy..."
portal_healthy=false
for i in $(seq 1 60); do
    if curl -sf "http://localhost:1500/default/rdmp/home" >/dev/null 2>&1; then
        portal_healthy=true
        echo "  Portal is healthy after ${i}s"
        break
    fi
    sleep 5
done

if [ "$portal_healthy" = false ]; then
    echo "ERROR: Portal failed to become healthy within 5 minutes."
    echo "       Logs: docker compose -p $COMPOSE_PROJECT logs redboxportal-fuzz"
    exit 1
fi

# -- Step 6: Extract seed data --
echo "[6/8] Extracting seed data from API..."
API_BASE="http://localhost:1500/default/rdmp/api"

echo "  Creating tracked harvest run fixture..."
HARVEST_FIXTURE_RESP=$(curl -sf -H "Authorization: Bearer $FUZZ_TOKEN" \
    -H "Content-Type: application/json" \
    -X POST "$API_BASE/records/harvest/rdmp" \
    --data @- <<'JSON' 2>/dev/null || echo '{}'
{
  "records": [
    {
      "harvestId": "fuzz-harvest-record-001",
      "operation": "upsert",
      "recordRequest": {
        "metadata": {
          "title": "Fuzz tracked harvest fixture",
          "identifier": "fuzz-harvest-record-001"
        }
      }
    }
  ],
  "sourceRunId": "fuzz-harvest-source-run-001",
  "sourceName": "fuzz-api",
  "finalChunk": true,
  "chunk": {
    "index": 1,
    "label": "fuzz-fixture"
  }
}
JSON
)
HARVEST_RUN_IDS=$(echo "$HARVEST_FIXTURE_RESP" | python3 -c "
import json, sys
data = json.load(sys.stdin)
run = data.get('run') if isinstance(data, dict) else {}
run_id = run.get('id') if isinstance(run, dict) else None
print(json.dumps([run_id] if run_id else []))
" 2>/dev/null || echo '[]')
echo "$HARVEST_RUN_IDS" > "$SEED_DIR/harvest-runs.json"

# Records
echo -n "  Records: "
RECORDS_RESP=$(curl -sf -H "Authorization: Bearer $FUZZ_TOKEN" "$API_BASE/records/list" 2>/dev/null || echo '[]')
RECORD_EXTRACT=$(echo "$RECORDS_RESP" | python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data if isinstance(data, list) else data.get('data', data.get('records', []))
oids = []
storage_oids = []
for r in items:
    oid = r.get('redboxOid') or r.get('oid') or ''
    if oid:
        oids.append(oid)
    sid = r.get('_id') or r.get('id') or ''
    if sid and sid != oid:
        storage_oids.append(sid)
# Prefer storage OID, fall back to redboxOid for the main records seed
combined = list(dict.fromkeys(storage_oids + oids))
print(json.dumps({'oids': oids, 'storage_oids': storage_oids, 'combined': combined}))
" 2>/dev/null || echo '{"oids":[],"storage_oids":[],"combined":[]}')
echo "$RECORD_EXTRACT" > "$TMP_DIR/record-extract.json"
RECORD_OIDS=$(echo "$RECORD_EXTRACT" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin).get('oids',[])))" 2>/dev/null || echo '[]')
RECORD_STORAGE_OIDS=$(echo "$RECORD_EXTRACT" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin).get('storage_oids',[])))" 2>/dev/null || echo '[]')
echo "$RECORD_OIDS" > "$SEED_DIR/records.json"
echo "$RECORD_STORAGE_OIDS" > "$SEED_DIR/storage-oids.json"
echo "$(echo "$RECORD_OIDS" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))') public, $(echo "$RECORD_STORAGE_OIDS" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))') storage"

# Extract storage OIDs via objectmetadata endpoint (returns full doc including
# MongoDB _id).  The permissions endpoints (edit/editRole/view/viewRole) route
# on the storage OID (_id), not the redboxOid.  The records/list response may
# not expose _id fields, so we query each bootstrap record by its known
# redboxOid to get the real storage OID.
# Dynamic: iterate over all extracted record OIDs, not just hardcoded ones.
# Retry: bootstrap records may not be fully loaded on first attempt.
echo -n "  Storage OIDs (objectmetadata): "
STORAGE_OIDS="[]"
KNOWN_OIDS=$(python3 -c "
import json
try:
    with open('$SEED_DIR/records.json') as f:
        oids = json.load(f)
    if oids:
        print(' '.join(oids))
    else:
        print('fuzz-rdmp-001 fuzz-dp-001')
except:
    print('fuzz-rdmp-001 fuzz-dp-001')
" 2>/dev/null || echo 'fuzz-rdmp-001 fuzz-dp-001')
for RBOID in $KNOWN_OIDS; do
    for RETRY in 1 2 3; do
        META_RESP=$(curl -sf -H "Authorization: Bearer $FUZZ_TOKEN" \
            "$API_BASE/records/objectmetadata/$RBOID" 2>/dev/null || echo '{}')
        META_ID=$(echo "$META_RESP" | python3 -c "
import json, sys
d = json.load(sys.stdin)
_id = d.get('_id', '')
print(_id)
" 2>/dev/null || echo '')
        if [ -n "$META_ID" ]; then
            break
        fi
        sleep 2
    done
    if [ -n "$META_ID" ]; then
        STORAGE_OIDS=$(echo "$STORAGE_OIDS" | python3 -c "
import json, sys
ids = json.load(sys.stdin)
if '$META_ID' not in ids:
    ids.append('$META_ID')
print(json.dumps(ids))
" 2>/dev/null || echo '[]')
    fi
done
if [ "$(echo "$STORAGE_OIDS" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))' 2>/dev/null || echo 0)" -gt 0 ]; then
    echo "$STORAGE_OIDS" > "$SEED_DIR/storage-oids.json"
    echo "$(echo "$STORAGE_OIDS" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))' 2>/dev/null || echo 0) extracted from metadata"
else
    echo "falling back to records.json"
fi

# Vocabularies
echo -n "  Vocabularies: "
VOCAB_RESP=$(curl -sf -H "Authorization: Bearer $FUZZ_TOKEN" "$API_BASE/vocabulary" 2>/dev/null || echo '{}')
VOCAB_IDS=$(echo "$VOCAB_RESP" | python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data if isinstance(data, list) else data.get('data', data.get('vocabularies', []))
all_ids = []
for v in items:
    # Prefer _id (storage OID) for routes that resolve by DB id
    if v.get('id'):
        all_ids.append(v['id'])
    if v.get('_id') and v['_id'] not in all_ids:
        all_ids.append(v['_id'])
    if v.get('slug') and v['slug'] not in all_ids:
        all_ids.append(v['slug'])
print(json.dumps(all_ids))
" 2>/dev/null || echo '[]')
echo "$VOCAB_IDS" > "$SEED_DIR/vocabularies.json"
echo "$(echo "$VOCAB_IDS" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"

# Users - extract actual database IDs
echo -n "  Users: "
USERS_RESP=$(curl -sf -H "Authorization: Bearer $FUZZ_TOKEN" "$API_BASE/users" 2>/dev/null || echo '{}')
USER_IDS=$(echo "$USERS_RESP" | python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data.get('records', []) if isinstance(data, dict) else []
ids = [u.get('id','') for u in items if u.get('id')]
print(json.dumps(ids))
" 2>/dev/null || echo '[]')
echo "$USER_IDS" > "$SEED_DIR/users.json"
echo "$(echo "$USER_IDS" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"

echo "  Seed files written to: $SEED_DIR"

# Fall back to static seeds if API extraction returned nothing
for sf in records.json vocabularies.json named-queries.json users.json harvest-runs.json; do
    if [ "$(python3 -c "import json; print(len(json.load(open('$SEED_DIR/$sf'))))" 2>/dev/null || echo 0)" -eq 0 ]; then
        cp "$SCRIPT_DIR/seeds/$sf" "$SEED_DIR/$sf" 2>/dev/null || true
    fi
done

# Storage OIDs must come from the objectmetadata lookup. Do not fall back to
# records.json here: permissions routes resolve against the storage _id, not the
# public redboxOid, and mixing the two causes spurious 404s.
if [ "$(python3 -c "import json; print(len(json.load(open('$SEED_DIR/storage-oids.json'))))" 2>/dev/null || echo 0)" -eq 0 ]; then
    echo "WARNING: no storage OIDs were captured; permissions routes may 404 until objectmetadata extraction succeeds."
fi

# Dashboard configs: fall back to static seed (empty)
if [ "$(python3 -c "import json; print(len(json.load(open('$SEED_DIR/dashboard-configs.json'))))" 2>/dev/null || echo 0)" -eq 0 ]; then
    cp "$SCRIPT_DIR/seeds/dashboard-configs.json" "$SEED_DIR/dashboard-configs.json" 2>/dev/null || true
fi

# Vocab entries: fall back to static seed (empty)
if [ "$(python3 -c "import json; print(len(json.load(open('$SEED_DIR/vocab-entries.json'))))" 2>/dev/null || echo 0)" -eq 0 ]; then
    cp "$SCRIPT_DIR/seeds/vocab-entries.json" "$SEED_DIR/vocab-entries.json" 2>/dev/null || true
fi

# Report configs: fall back to static seed
if [ "$(python3 -c "import json; print(len(json.load(open('$SEED_DIR/report-configs.json'))))" 2>/dev/null || echo 0)" -eq 0 ]; then
    cp "$SCRIPT_DIR/seeds/report-configs.json" "$SEED_DIR/report-configs.json" 2>/dev/null || true
fi

# Create a secondary fuzz test user for link operations
curl -sf -H "Authorization: Bearer $FUZZ_TOKEN" \
    -H "Content-Type: application/json" \
    -X PUT "$API_BASE/users" \
    --data '{"username":"fuzz-user-001","name":"Fuzz Test User","email":"fuzz@test.local","password":"FuzzP@ss123!","roles":["guest"]}' >/dev/null 2>&1 || true

# Capture the disposable fuzz user's id. Destructive user operations (API token
# generate/revoke, account disable/enable, profile update) must target THIS user --
# never the admin account whose token authenticates the whole run. Otherwise the
# fuzzer revokes/rotates its own credential mid-run and every later request 401s,
# which both poisons results and masks real findings. The hook reads fuzz-user.json
# and falls back to a non-existent id (harmless 404) if capture fails.
FUZZ_USER_ID=$(curl -sf -H "Authorization: Bearer $FUZZ_TOKEN" \
    "$API_BASE/users/find?searchBy=username&query=fuzz-user-001" 2>/dev/null \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo '')
if [ -n "$FUZZ_USER_ID" ]; then
    echo "[\"$FUZZ_USER_ID\"]" > "$SEED_DIR/fuzz-user.json"
else
    echo '["fuzz-nonexistent-user"]' > "$SEED_DIR/fuzz-user.json"
fi
echo "  Fuzz user id: ${FUZZ_USER_ID:-<none>}"

# Seed a named query and a report config so the report-config endpoints can reach
# their service logic. ReportsService requires databaseQuery.queryName to reference
# an existing named query, and update/delete-by-name require an existing report; the
# hook injects "listRDMPRecords"/"rdmpRecords" for these, so create them here.
NAMED_QUERY_PAYLOAD='{"collectionName":"record","brandIdFieldPath":"metaMetadata.brandId","resultObjectMapping":{"oid":"{{record.redboxOid}}","title":"{{record.metadata.title}}","description":"{{record.metadata.description}}","dateCreated":"{{record.dateCreated}}","dateModified":"{{record.lastSaveDate}}"},"mongoQuery":{"metaMetadata.type":"rdmp"},"sort":[{"lastSaveDate":"DESC"}],"queryParams":{"title":{"type":"string","path":"metadata.title","queryType":"contains","whenUndefined":"ignore"},"dateCreatedBefore":{"type":"string","path":"dateCreated","queryType":"<=","whenUndefined":"ignore"},"dateCreatedAfter":{"type":"string","path":"dateCreated","queryType":">=","whenUndefined":"ignore"}}}'
if ! curl -sf -H "Authorization: Bearer $FUZZ_TOKEN" -H "Content-Type: application/json" \
    -X POST "$API_BASE/named-query" \
    --data "{\"name\":\"listRDMPRecords\",${NAMED_QUERY_PAYLOAD#\{}" >/dev/null 2>&1; then
    curl -sf -H "Authorization: Bearer $FUZZ_TOKEN" -H "Content-Type: application/json" \
        -X PUT "$API_BASE/named-query/listRDMPRecords" \
        --data "$NAMED_QUERY_PAYLOAD" >/dev/null
fi
curl -sf -H "Authorization: Bearer $FUZZ_TOKEN" -H "Content-Type: application/json" \
    -X POST "$API_BASE/report-config" \
    --data '{"name":"rdmpRecords","title":"Fuzz RDMP Report","reportSource":"database","databaseQuery":{"queryName":"listRDMPRecords"},"columns":[{"label":"Title","property":"title"}]}' >/dev/null 2>&1 || true
echo '["listRDMPRecords"]' > "$SEED_DIR/named-queries.json"
echo '["rdmpRecords"]' > "$SEED_DIR/report-configs.json"

# Seed a known vocabulary with stable entries so the vocabulary update/reorder
# endpoints can reach their logic. {id} is the vocabulary's DB id (not the slug),
# and reorder requires the entries' DB ids, so capture both after creation and write
# them to seeds the hook injects (vocabularies.json -> {id}, vocab-entries.json -> reorder).
curl -sf -H "Authorization: Bearer $FUZZ_TOKEN" -H "Content-Type: application/json" \
    -X POST "$API_BASE/vocabulary" \
    --data '{"name":"Fuzz Vocab","slug":"fuzz-vocab","type":"flat","source":"local","entries":[{"id":"01","label":"One","value":"one","order":0},{"id":"02","label":"Two","value":"two","order":1}]}' >/dev/null 2>&1 || true
FUZZ_VOCAB_ID=$(curl -sf -H "Authorization: Bearer $FUZZ_TOKEN" "$API_BASE/vocabulary?q=fuzz-vocab" 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((r['id'] for r in d.get('records',[]) if r.get('slug')=='fuzz-vocab'), ''))" 2>/dev/null || echo '')
if [ -n "$FUZZ_VOCAB_ID" ]; then
    # MERGE the fuzz vocab ID into existing list (do NOT overwrite, which would
    # drop bootstrap vocabulary _id/slug entries that GET /vocabulary/{id} needs).
    EXISTING_VOCAB_IDS=$(python3 -c "
import json
with open('$SEED_DIR/vocabularies.json') as f:
    ids = json.load(f)
fuzz_id = '$FUZZ_VOCAB_ID'
if fuzz_id and fuzz_id not in ids:
    ids.insert(0, fuzz_id)
print(json.dumps(ids))
" 2>/dev/null || echo "[\"$FUZZ_VOCAB_ID\"]")
    echo "$EXISTING_VOCAB_IDS" > "$SEED_DIR/vocabularies.json"
    curl -sf -H "Authorization: Bearer $FUZZ_TOKEN" "$API_BASE/vocabulary/$FUZZ_VOCAB_ID" 2>/dev/null \
        | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps([e.get('_id') or e.get('id') or '' for e in (d.get('entries') or [])[:2]]))" 2>/dev/null \
        > "$SEED_DIR/vocab-entries.json" || echo '[]' > "$SEED_DIR/vocab-entries.json"
else
    echo '[]' > "$SEED_DIR/vocab-entries.json"
fi
echo "  Fuzz vocabulary id: ${FUZZ_VOCAB_ID:-<none>}"

# Create a dedicated second fuzz user used ONLY as the secondary in account-link
# operations. linkAccounts wipes the secondary's token and converts it to a
# linked-alias, so it must never be the admin (auth) account or fuzz-user-001
# (which other destructive user ops target). The primary stays the admin account,
# which linkAccounts only role-merges -- its token and login remain intact.
curl -sf -H "Authorization: Bearer $FUZZ_TOKEN" -H "Content-Type: application/json" \
    -X PUT "$API_BASE/users" \
    --data '{"username":"fuzz-user-002","name":"Fuzz Link Secondary","email":"fuzz2@test.local","password":"FuzzP@ss123!","roles":["guest"]}' >/dev/null 2>&1 || true
FUZZ_USER2_ID=$(curl -sf -H "Authorization: Bearer $FUZZ_TOKEN" \
    "$API_BASE/users/find?searchBy=username&query=fuzz-user-002" 2>/dev/null \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo '')
if [ -n "$FUZZ_USER2_ID" ]; then
    echo "[\"$FUZZ_USER2_ID\"]" > "$SEED_DIR/fuzz-user-2.json"
else
    echo '["fuzz-nonexistent-user"]' > "$SEED_DIR/fuzz-user-2.json"
fi
echo "  Fuzz link-secondary user id: ${FUZZ_USER2_ID:-<none>}"

# Build seeds.dict from final seed files for Schemathesis dictionary injection
echo "  Generating seeds.dict for parameter generation..."
{
    echo "# ReDBox fuzz seeds - known entity IDs"
    python3 -c "
import json, sys
for f in ['records.json', 'storage-oids.json', 'vocabularies.json', 'named-queries.json', 'report-configs.json', 'users.json', 'harvest-runs.json', 'vocab-entries.json']:
    try:
        with open('$SEED_DIR/' + f) as fh:
            for item in json.load(fh):
                if isinstance(item, str) and item:
                    print(json.dumps(item))
    except (json.JSONDecodeError, FileNotFoundError):
        pass
"
} > "$SEED_DIR/seeds.dict"
echo "  seeds.dict entries: $(wc -l < "$SEED_DIR/seeds.dict")"

# Discover API parameter names from OpenAPI spec for targeted dictionary bindings
SEED_COUNT=$(grep -c '^[^#]' "$SEED_DIR/seeds.dict" 2>/dev/null || echo 0)

# Append dictionaries, generation, and parameter sections to TOML config
# (base TOML has [dictionaries.edge]; adds seeds + generation.dictionaries + parameters)
{
    echo ""
    # Always add edge dictionary for string generation
    echo "[generation.dictionaries]"
    echo "string = { dictionary = \"edge\", probability = 0.05 }"

    if [ "$SEED_COUNT" -gt 0 ]; then
        echo ""
        echo "[dictionaries.seeds]"
        echo "from-file = \"seeds/seeds.dict\""
        echo ""
        echo "[parameters]"
        python3 -c "
import json, sys
with open('$OPENAPI_DIR/openapi.json') as f:
    spec = json.load(f)
paths = spec.get('paths', {})
bindings = {}
for path, methods in paths.items():
    path_params = methods.get('parameters', [])
    for method, op in methods.items():
        if method.startswith('_') or method == 'parameters':
            continue
        for param in op.get('parameters', []) + path_params:
            name = param.get('name', '')
            location = param.get('in', '')
            key = f'{location}.{name}'
            if any(x in name.lower() for x in ['record', 'oid', 'redboxoid', 'slug', 'vocab', 'dashboard', 'workflow', 'view', 'step', 'locale', 'namespace', 'key', 'version', 'name']):
                bindings[key] = True
for key in sorted(bindings):
    print(f'\"{key}\" = {{ dictionary = \"seeds\", probability = 0.3 }}')
" 2>/dev/null || true
    fi
} >> "$TMP_DIR/schemathesis.toml"

# -- Step 7: Run Schemathesis --
echo "[7/8] Running Schemathesis ($PROFILE profile)..."
echo "  Seed: ${REDBOX_FUZZ_SEED:-<random>}"
echo ""

# -- Auth mode from profile --
if [ "$PROFILE" = "unauthenticated" ]; then
    REDBOX_FUZZ_AUTH_MODE=none
fi

# Build CLI args (take precedence over schemathesis.toml)
CONFIG_FILE="/opt/api-fuzzing/schemathesis.toml"
SPEC_FILE="/opt/api-fuzzing/openapi/openapi.json"

ST_ARGS=()
ST_ARGS+=(--url="http://redboxportal-fuzz:1500")
if [ "$REDBOX_FUZZ_AUTH_MODE" = "bearer" ]; then
    ST_ARGS+=(--header="Authorization: Bearer $FUZZ_TOKEN")
fi
ST_ARGS+=(--max-examples="$REDBOX_FUZZ_MAX_EXAMPLES")
ST_ARGS+=(--phases="examples,coverage,fuzzing,stateful")
ST_ARGS+=(--checks="all")
# Excluded paths (combined into a single regex; --exclude-path-regex is not repeatable):
#   1. {key}.{keyExt} translation asset routes (handled elsewhere).
#   2. GET /records/datastreams/{oid}/{datastreamId} (getDataStream): seeded harvest
#      records have no datastreams to download, so every positive case returns 404 and
#      trips Schemathesis' MISSING_TEST_DATA warning. Seeding one would need a working
#      multipart upload plus per-run datastreamId capture; the not-found path is low
#      value and the upload counterpart (uploadRecordDatastreams) is already excluded.
#      Excluded by path because the spec assigns this route no operationId.
ST_ARGS+=(--exclude-path-regex=".*(\\{key\\}\\.\\{keyExt\\}|/datastreams/\\{oid\\}/\\{datastreamId\\}).*")
# Exclude selected built-in checks; our hooks register Redbox wrappers that
# preserve those checks while filtering known harness false positives.
if [ -n "$REDBOX_FUZZ_EXCLUDE_CHECKS" ]; then
    ST_ARGS+=(--exclude-checks="status_code_conformance,negative_data_rejection,ensure_resource_availability,${REDBOX_FUZZ_EXCLUDE_CHECKS}")
else
    ST_ARGS+=(--exclude-checks="status_code_conformance,negative_data_rejection,ensure_resource_availability")
fi
ST_ARGS+=(--report=junit)
ST_ARGS+=(--report-dir=/opt/api-fuzzing/reports)

# Optional seed
if [ -n "$REDBOX_FUZZ_SEED" ]; then
    ST_ARGS+=(--seed="$REDBOX_FUZZ_SEED")
fi

# Profile-specific overrides
case "$PROFILE" in
    smoke)
        ST_ARGS+=(--max-examples=3)
        ST_ARGS+=(--phases="examples,coverage")
        ;;
    read-heavy)
        ST_ARGS+=(--exclude-method=POST)
        ST_ARGS+=(--exclude-method=PUT)
        ST_ARGS+=(--exclude-method=PATCH)
        ST_ARGS+=(--exclude-method=DELETE)
        ;;
    reproduction)
        if [ -z "${REDBOX_FUZZ_OPERATION:-}" ]; then
            echo "ERROR: REDBOX_FUZZ_OPERATION must be set for reproduction profile"
            exit 1
        fi
        ST_ARGS+=(--max-examples=100)
        ST_ARGS+=(--include-operation-id="$REDBOX_FUZZ_OPERATION")
        ;;
    unauthenticated)
        ST_ARGS+=(--checks="not_a_server_error,content_type_conformance")
        ;;
    stable-smoke)
        ST_ARGS+=(--workers=1)
        ST_ARGS+=(--max-examples=3)
        ST_ARGS+=(--phases="examples,coverage")
        ;;
esac


# Exclude non-fuzzable multipart file-upload operations (skipped for the reproduction
# profile, which explicitly targets a single operation id).
if [ "$PROFILE" != "reproduction" ] && [ -n "$REDBOX_FUZZ_EXCLUDE_OPERATIONS" ]; then
    IFS=',' read -ra _excluded_ops <<< "$REDBOX_FUZZ_EXCLUDE_OPERATIONS"
    for _op in "${_excluded_ops[@]}"; do
        [ -n "$_op" ] && ST_ARGS+=(--exclude-operation-id="$_op")
    done
fi

ST_ARGS+=("$SPEC_FILE")

# Run with set +e so we capture exit code without aborting due to set -e
set +e
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" run --rm schemathesis-fuzz \
    --config-file "$CONFIG_FILE" run "${ST_ARGS[@]}"
ST_EXIT_CODE=$?
set -e

# -- Diagnostics on failure --
HARNESS_FAILURE=false
if [ "$ST_EXIT_CODE" -ne 0 ]; then
    echo ""
    echo "--- Container status ---"
    docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" ps
    echo ""
    echo "--- Portal logs (tail 200) ---"
    docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" logs --tail=200 redboxportal-fuzz
    echo ""
fi

# -- JUnit report check for harness network errors --
echo ""
echo "--- Checking reports for harness network errors ---"
for report_file in "$REPORT_DIR"/*.xml; do
    if [ -f "$report_file" ]; then
        NETWORK_ERRORS=$(python3 -c "
import xml.etree.ElementTree as ET, sys, os
ns = 'http://schemas.hetznercloud.com/junit'
tree = ET.parse('$report_file')
root = tree.getroot()
count = 0
for testcase in root.iter('{' + ns + '}testcase'):
    for child in testcase:
        tag = child.tag
        if not (tag.endswith('}failure') or tag.endswith('}error')):
            continue
        msg = (child.get('message') or child.text or '')
        if 'Failed to resolve' in msg or 'Connection refused' in msg:
            count += 1
print(count)
" 2>/dev/null || echo 0)
        if [ "$NETWORK_ERRORS" -gt 0 ]; then
            HARNESS_FAILURE=true
            echo "  WARNING: $report_file contains $NETWORK_ERRORS network errors (Failed to resolve / Connection refused)"
        fi
    fi
done

if [ "$HARNESS_FAILURE" = "true" ]; then
    echo ""
    echo "--- HARNESS FAILURE: network errors found; endpoint results are non-authoritative ---"
    echo "  Network errors found in JUnit report. Endpoint results are non-authoritative."
    echo "  Run with REDBOX_FUZZ_PROFILE=stable-smoke REDBOX_FUZZ_KEEP_STACK=true to diagnose."
    echo "--- Compose status ---"
    docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" ps
    echo ""
    echo "--- Portal logs (tail 100) ---"
    docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" logs --tail=100 redboxportal-fuzz
    echo ""
    echo "--- Schemathesis logs (tail 100) ---"
    docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" logs --tail=100 schemathesis-fuzz
    echo ""
fi

# -- Step 8: Report and teardown --
echo ""
echo "=========================================="
echo " Fuzzing Complete"
echo "=========================================="
echo " Exit code:     $ST_EXIT_CODE"
echo " Harness:       $(if [ "$HARNESS_FAILURE" = "true" ]; then echo 'NETWORK ERRORS'; else echo 'OK'; fi)"
echo " Seed:          ${REDBOX_FUZZ_SEED:-<random>}"
echo " Reports:       $REPORT_DIR"
echo " Seeds used:    $SEED_DIR"
echo " Profile:       $PROFILE"
echo "=========================================="

if [ "$REDBOX_FUZZ_KEEP_STACK" = "true" ]; then
    echo ""
    echo "Stack kept alive (REDBOX_FUZZ_KEEP_STACK=true)."
    echo "  Teardown: docker compose -p $COMPOSE_PROJECT -f $COMPOSE_FILE down -v --remove-orphans"
else
    echo ""
    echo "[8/8] Tearing down ephemeral stack..."
    docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" down -v --remove-orphans
    echo "  Stack destroyed."
fi

exit $ST_EXIT_CODE
