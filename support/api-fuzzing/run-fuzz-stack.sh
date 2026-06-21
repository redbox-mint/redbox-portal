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
echo "[1/7] Cleaning previous fuzz stack..."
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
rm -rf "$TMP_DIR"

# -- Step 2: Generate OpenAPI spec --
echo "[2/7] Generating OpenAPI spec..."
mkdir -p "$OPENAPI_DIR"
npm run doc:api -- --branding=default --portal=rdmp --out-dir="$OPENAPI_DIR" 2>&1 || {
    echo "ERROR: OpenAPI generation failed."
    echo "       Ensure redbox-core is built: npm install && npm run build"
    exit 1
}
echo "  OpenAPI spec: $OPENAPI_DIR/openapi.json"

# -- Step 3: Create runtime directories and seed files --
echo "[3/7] Creating runtime directories..."
mkdir -p "$REPORT_DIR" "$SEED_DIR" "$ATTACHMENTS_DIR" "$EMAIL_DIR"

echo '[]' > "$SEED_DIR/records.json"
echo '[]' > "$SEED_DIR/users.json"
echo '[]' > "$SEED_DIR/vocabularies.json"
echo '[]' > "$SEED_DIR/named-queries.json"

# Copy schemathesis.toml into the tmp dir so it's available to the container
cp "$SCRIPT_DIR/schemathesis.toml" "$TMP_DIR/schemathesis.toml"

# -- Step 4: Build fuzz image and launch ephemeral stack --
echo "[4/7] Building fuzz image and launching ephemeral stack..."
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

# -- Step 5: Extract seed data --
echo "[5/7] Extracting seed data from API..."
API_BASE="http://localhost:1500/default/rdmp/api"

# Records
echo -n "  Records: "
RECORDS_RESP=$(curl -sf -H "Authorization: Bearer $FUZZ_TOKEN" "$API_BASE/record" 2>/dev/null || echo '[]')
RECORD_OIDS=$(echo "$RECORDS_RESP" | python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data if isinstance(data, list) else data.get('data', data.get('records', []))
oids = [r.get('redboxOid') or r.get('oid') or r.get('id') or r.get('_id','') for r in items if r.get('redboxOid') or r.get('oid') or r.get('id')]
print(json.dumps(oids))
" 2>/dev/null || echo '[]')
echo "$RECORD_OIDS" > "$SEED_DIR/records.json"
echo "$(echo "$RECORD_OIDS" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"

# Vocabularies
echo -n "  Vocabularies: "
VOCAB_RESP=$(curl -sf -H "Authorization: Bearer $FUZZ_TOKEN" "$API_BASE/vocabulary" 2>/dev/null || echo '{}')
VOCAB_SLUGS=$(echo "$VOCAB_RESP" | python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data if isinstance(data, list) else data.get('data', data.get('vocabularies', []))
slugs = [v.get('slug','') for v in items if v.get('slug')]
print(json.dumps(slugs))
" 2>/dev/null || echo '[]')
echo "$VOCAB_SLUGS" > "$SEED_DIR/vocabularies.json"
echo "$(echo "$VOCAB_SLUGS" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"

echo "  Seed files written to: $SEED_DIR"

# Fall back to static seeds if API extraction returned nothing
for sf in records.json vocabularies.json named-queries.json; do
    if [ "$(python3 -c "import json; print(len(json.load(open('$SEED_DIR/$sf'))))" 2>/dev/null || echo 0)" -eq 0 ]; then
        cp "$SCRIPT_DIR/seeds/$sf" "$SEED_DIR/$sf" 2>/dev/null || true
    fi
done

# Build seeds.dict from final seed files for Schemathesis dictionary injection
echo "  Generating seeds.dict for parameter generation..."
{
    echo "# ReDBox fuzz seeds - known entity IDs"
    python3 -c "
import json, sys
for f in ['records.json', 'vocabularies.json', 'named-queries.json']:
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
            if any(x in name.lower() for x in ['record', 'oid', 'redboxoid', 'slug', 'vocab']):
                bindings[key] = True
for key in sorted(bindings):
    print(f'\"{key}\" = {{ dictionary = \"seeds\", probability = 0.3 }}')
" 2>/dev/null || true
    fi
} >> "$TMP_DIR/schemathesis.toml"

# -- Step 6: Run Schemathesis --
echo "[6/7] Running Schemathesis ($PROFILE profile)..."
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
        ST_ARGS+=(--checks="not_a_server_error,status_code_conformance,content_type_conformance")
        ;;
    stable-smoke)
        ST_ARGS+=(--workers=1)
        ST_ARGS+=(--max-examples=3)
        ST_ARGS+=(--phases="examples,coverage")
        ;;
esac

# Exclude auth false-positive checks for dual-auth routes (bearer + session cookie)
if [ "$REDBOX_FUZZ_AUTH_MODE" = "bearer" ] && [ -n "$REDBOX_FUZZ_EXCLUDE_CHECKS" ]; then
    ST_ARGS+=(--exclude-checks="$REDBOX_FUZZ_EXCLUDE_CHECKS")
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

# -- Step 7: Report and teardown --
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
    echo "[7/7] Tearing down ephemeral stack..."
    docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" down -v --remove-orphans
    echo "  Stack destroyed."
fi

exit $ST_EXIT_CODE
