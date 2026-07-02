import os
import json
import logging
import re

import schemathesis
from schemathesis.core.failures import AcceptedNegativeData
from schemathesis.specs.openapi.checks import negative_data_rejection
from schemathesis.specs.openapi.checks import status_code_conformance
from schemathesis.specs.openapi.checks import UndefinedStatusCode

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("redbox-hooks")

OID_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")
INVALID_OID_SENTINEL = "invalid*oid"


# Known false-positive endpoint patterns for status_code_conformance.
# These endpoints accept data that Schemathesis considers schema-violating
# due to server-side query parameter coercion or intentionally permissive
# schemas (passthrough body, non-restrictive regex patterns).
_FALSE_POSITIVE_PATTERNS = [
    "/api/deletedrecords/list",
    "/api/records/datastreams/",
    "/api/records/list",
    "/api/users",
    "/api/i18n/bundles/",
    "/api/mint/harvest/",
    # Branding rollback requires pre-existing brand versions, which no bootstrap
    # fixture creates. Every positive case returns 404 because there is nothing
    # to roll back to — treat as a known limitation rather than missing test data.
    "/api/branding/rollback/",
]

_DEFAULT_PATH_PARAMETER_EXAMPLES = {
        "/api/records/permissions/edit/": {"oid": "fuzz-rdmp-001"},
        "/api/records/permissions/editRole/": {"oid": "fuzz-rdmp-001"},
        "/api/records/permissions/view/": {"oid": "fuzz-rdmp-001"},
        "/api/records/permissions/viewRole/": {"oid": "fuzz-rdmp-001"},
        "/api/records/datastreams/": {"oid": "fuzz-rdmp-001", "datastreamId": "metadata.json"},
        "/api/deletedrecords/": {"oid": "fuzz-rdmp-001"},
        "/api/dashboard-config/merged/": {"recordType": "rdmp", "workflowStage": "draft"},
        "/api/dashboard-config/merged-view/": {"viewName": "consolidated", "stepName": "consolidated"},
        "/api/dashboard-config/merged-type/": {"dashboardType": "rdmp"},
        "/api/harvest-runs/": {"id": "fuzz-harvest-run"},
        "/api/i18n/entries/": {"locale": "en", "namespace": "translation", "key": "menu-dashboard-config", "keyExt": "json"},
        "/api/branding/rollback/": {"versionId": "1"},
        "/api/report-config/": {"name": "rdmpRecords"},
        "/api/vocabulary/": {"id": "anzsrc-for"},
        # NEVER inject the admin id here: /api/users/{id}/disable would disable the
        # API token's own account and 401 the rest of the run. Default to a
        # non-existent id; _path_param_examples overrides with the disposable fuzz user.
        "/api/users/": {"id": "fuzz-nonexistent-user"},
        "/api/records/harvest/": {"recordType": "rdmp"},
        "/api/mint/harvest/": {"recordType": "rdmp"},
}

_QUERY_PARAMETER_EXAMPLES = {
    "/api/forms/get": {"recordType": "rdmp"},
    "/api/recordtypes/get": {"recordType": "rdmp"},
    "/api/report/namedQuery": {"queryName": "listRDMPRecords"},
    "/api/users/find": {"username": "admin"},
    "/api/users/get": {"username": "admin"},
    # token generate/revoke are resolved dynamically against the disposable fuzz
    # user in _query_param_examples (never the admin account); see note there.
    "/api/users/link/candidates": {"query": "admin", "primaryUserId": "admin"},
}

_SEED_CACHE = {}


def _seed_value(filename, fallback):
    if filename not in _SEED_CACHE:
        path = os.path.join("/opt/api-fuzzing/seeds", filename)
        try:
            with open(path, encoding="utf-8") as handle:
                data = json.load(handle)
            _SEED_CACHE[filename] = [item for item in data if isinstance(item, str) and item]
        except (OSError, json.JSONDecodeError):
            _SEED_CACHE[filename] = []
    return _SEED_CACHE[filename][0] if _SEED_CACHE[filename] else fallback


def _seed_list(filename):
    """Return all string entries from a seed file (caches via _seed_value)."""
    _seed_value(filename, "")
    return list(_SEED_CACHE.get(filename) or [])


def _is_false_positive(case) -> bool:
    """Check if a test case path matches a known false-positive endpoint."""
    path = getattr(case, "path", "") or ""
    return any(pattern in path for pattern in _FALSE_POSITIVE_PATTERNS)


@schemathesis.check
def redbox_status_code_conformance(ctx, response, case):
    """Status code conformance with false-positive suppression.

    Wraps the built-in check and suppresses known false positives where the
    server correctly accepts input that Schemathesis flags as schema-violating
    (e.g. boolean query parameter coercion, passthrough body schemas).
    """
    try:
        return status_code_conformance(ctx, response, case)
    except UndefinedStatusCode:
        if _is_false_positive(case):
            return True  # skip - known false positive
        raise


def _is_default_positive_negative_datastream_case(case) -> bool:
    """Detect Schemathesis coverage false positives for seeded datastream OIDs."""
    if not _is_list_datastreams_operation(case):
        return False
    path_parameters = dict(getattr(case, "path_parameters", None) or {})
    oid = path_parameters.get("oid")
    if not isinstance(oid, str) or not OID_PATTERN.fullmatch(oid):
        return False

    meta = getattr(case, "meta", None) or getattr(case, "_meta", None)
    phase = getattr(meta, "phase", None)
    data = getattr(phase, "data", None)
    description = str(getattr(data, "description", "") or "").strip().lower()
    parameter = getattr(data, "parameter", None)
    parameter_location = getattr(getattr(data, "parameter_location", None), "name", None)
    return description in {"default positive test case", "positive test case"} and parameter is None and parameter_location is None


def _is_translation_entry_operation(case) -> bool:
    path = getattr(case, "path", "") or ""
    method = (getattr(case, "method", "") or "").upper()
    return (
        method in {"GET", "DELETE", "POST"}
        and "/api/i18n/entries/{locale}/{namespace}/{key}" in path
        and "{keyExt}" not in path
    )


def _is_default_positive_negative_translation_entry_case(case) -> bool:
    """Detect Schemathesis coverage false positives for seeded i18n entry paths.

    Both positive and negative Coverage tests on this endpoint can produce
    false positives because the ``contentFormat`` enum has only two values
    (``"plain"`` / ``"html"``).  When Schemathesis generates a negative mutation
    for this field it may accidentally land on the other valid value, producing
    a perfectly valid request that is correctly accepted with 200.

    The check for a "valid contentFormat value" in the failure message is
    Schemathesis telling us the body object contains a schema-conforming
    ``contentFormat`` enum value — not an error.
    """
    if not _is_translation_entry_operation(case):
        return False
    path_parameters = dict(getattr(case, "path_parameters", None) or {})
    if path_parameters.get("locale") != "en":
        return False
    if path_parameters.get("namespace") != "translation":
        return False
    if path_parameters.get("key") != "menu-dashboard-config":
        return False

    # Regardless of the test-phase description (positive or negative), if the
    # body explicitly contains a contentFormat that is a valid enum value, the
    # mutation did not actually produce invalid data for this field — treat as
    # false positive.  Only match on explicit valid values ("plain"/"html"),
    # NOT on absent/None, so that mutations on other fields (e.g. value) that
    # the API incorrectly accepts are still surfaced as failures.
    body = getattr(case, "body", None)
    content_format = (body or {}).get("contentFormat") if isinstance(body, dict) else None
    if content_format in {"plain", "html"}:
        return True

    meta = getattr(case, "meta", None) or getattr(case, "_meta", None)
    phase = getattr(meta, "phase", None)
    data = getattr(phase, "data", None)
    description = str(getattr(data, "description", "") or "").strip().lower()
    parameter = getattr(data, "parameter", None)
    parameter_location = getattr(getattr(data, "parameter_location", None), "name", None)
    return description in {"default positive test case", "positive test case"} and parameter is None and parameter_location is None


@schemathesis.check
def redbox_negative_data_rejection(ctx, response, case):
    """Negative data rejection with Redbox seed false-positive suppression."""
    try:
        return negative_data_rejection(ctx, response, case)
    except AcceptedNegativeData:
        if _is_default_positive_negative_datastream_case(case) or _is_default_positive_negative_translation_entry_case(case):
            return True
        raise


def _get_token():
    return os.environ.get("REDBOX_API_TOKEN") or ""


def _auth_mode():
    return os.environ.get("REDBOX_FUZZ_AUTH_MODE", "bearer").strip().lower()


def _case_generation_mode(case):
    """Return the Schemathesis generation mode value without triggering revalidation."""
    meta = getattr(case, "_meta", None)
    generation = getattr(meta, "generation", None)
    mode = getattr(generation, "mode", None)
    value = getattr(mode, "value", mode)
    return str(value).lower() if value is not None else ""


def _is_negative_case(case) -> bool:
    return _case_generation_mode(case) == "negative"


def _is_list_datastreams_operation(case) -> bool:
    path = getattr(case, "path", "") or ""
    method = (getattr(case, "method", "") or "").upper()
    return method == "GET" and "/api/records/datastreams/{oid}" in path and "{datastreamId}" not in path


def _force_invalid_oid_for_negative_datastream_case(case):
    """Keep seeded real OIDs out of negative datastream-list requests."""
    if not _is_list_datastreams_operation(case):
        return
    path_parameters = dict(getattr(case, "path_parameters", None) or {})
    oid = path_parameters.get("oid")
    if isinstance(oid, str) and OID_PATTERN.fullmatch(oid):
        path_parameters["oid"] = INVALID_OID_SENTINEL
        try:
            case.path_parameters = path_parameters
        except Exception:  # pragma: no cover - defensive for Schemathesis API changes
            pass


def _strip_null_bytes(value):
    """Recursively remove NUL (\\u0000) characters from object keys and string values.

    MongoDB cannot persist object keys (or values) containing NUL bytes, so the portal
    correctly rejects such payloads with HTTP 400. That makes NUL bytes an inherently
    unstorable input rather than a meaningful contract test, and Schemathesis'
    positive_data_acceptance check would otherwise flag the (correct) 400 as a failure.
    We sanitise the request body and query values; path parameters are left untouched so
    negative-data tests still exercise the parameter pattern validation. Only NUL bytes are
    removed, so other pattern-violating characters in query values are preserved.
    """
    if isinstance(value, str):
        return value.replace("\x00", "")
    if isinstance(value, dict):
        return {_strip_null_bytes(k): _strip_null_bytes(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_strip_null_bytes(item) for item in value]
    return value


def _needs_body_defaults(case):
    """Check if an endpoint needs a default body dict even when body is None/non-dict."""
    path = getattr(case, "path", "") or ""
    method = (getattr(case, "method", "") or "").upper()
    if path.endswith("/api/users") and method == "PUT":
        return True
    if path.endswith("/api/users") and method == "POST":
        return True
    if "/api/users/link" in path and method == "POST":
        return True
    if "/api/report-config" in path and method in ("POST", "PUT"):
        return True
    if "/sync" in path and method == "POST" and "/api/vocabulary/" in path:
        return True
    if "/reorder" in path and method == "PUT" and "/api/vocabulary/" in path:
        return True
    if "/api/vocabulary/" in path and method == "PUT" and not any(sub in path for sub in ["/sync", "/reorder"]):
        return True
    return False


def _inject_body_defaults(case, body):
    """Inject required body fields for schema-strict endpoints.

    Mutates and returns ``body``; the caller must assign the result back to
    ``case.body`` (case.body may be a copy-returning property, so in-place mutation
    alone is not guaranteed to reach the serialised request).
    """
    path = getattr(case, "path", "") or ""
    method = (getattr(case, "method", "") or "").upper()

    if not isinstance(body, dict):
        return body

    # User link operation. Both ids must reference existing distinct users; force them
    # to admin (primary, only role-merged) and the dedicated fuzz link-secondary
    # (whose token linkAccounts wipes -- must never be the admin or fuzz-user-001).
    if "/api/users/link" in path and method == "POST":
        body["primaryUserId"] = _seed_value("users.json", "admin")
        body["secondaryUserId"] = _seed_value("fuzz-user-2.json", "fuzz-nonexistent-user")
        if "linkType" not in body:
            body["linkType"] = "merge"
        if "mergeRoles" not in body:
            body["mergeRoles"] = True

    # Vocabulary update (PUT /{id}) requires at minimum the existing fields.
    if "/api/vocabulary/" in path and not any(sub in path for sub in ["/sync", "/reorder"]) and method == "PUT":
        if not body.get("name"):
            body["name"] = "Fuzz Vocab"
        if not body.get("slug"):
            body["slug"] = "fuzz-vocab"
        if not body.get("type"):
            body["type"] = "flat"
        if not body.get("source"):
            body["source"] = "local"
        if "entries" not in body or not body["entries"]:
            entry_ids = _seed_list("vocab-entries.json")
            if len(entry_ids) >= 2:
                body["entries"] = [{"id": entry_ids[0], "order": 0}, {"id": entry_ids[1], "order": 1}]
            else:
                body["entries"] = [{"id": "01", "order": 0}, {"id": "02", "order": 1}]

    # Vocabulary sync
    if "/sync" in path and method == "POST" and "/api/vocabulary/" in path:
        if "versionId" not in body or not body["versionId"]:
            body["versionId"] = "1"

    # Vocabulary reorder requires the seeded vocabulary's real entry DB ids (paired
    # with the {id} path param, which resolves to that vocabulary). Generated ids never
    # match an existing entry, so force the captured ids.
    if "/reorder" in path and method == "PUT" and "/api/vocabulary/" in path:
        entry_ids = _seed_list("vocab-entries.json")
        if len(entry_ids) >= 2:
            body["entries"] = [{"id": entry_ids[0], "order": 0}, {"id": entry_ids[1], "order": 1}]
        elif "entries" not in body or not body["entries"]:
            body["entries"] = [{"id": "01", "order": 0}, {"id": "02", "order": 1}]

    # Report config create/update/preview. validateMutableConfig requires a
    # reportSource of 'database' and a databaseQuery.queryName that references an
    # existing named query. The schema now pins reportSource and requires the field,
    # but the named-query reference is runtime data the generator can't know, so force
    # a bootstrapped query name to let positive cases reach the service logic.
    if "/api/report-config" in path and method in ("POST", "PUT"):
        # updateReportConfig (PUT /{name}) rejects a body whose name differs from the
        # path segment ("Report name cannot be changed"); the seeded report the path
        # example targets is "rdmpRecords". Preview must reference an existing report;
        # create just needs any URL-safe name.
        if method == "PUT":
            body["name"] = "rdmpRecords"
        elif "/preview" in path:
            body["name"] = "rdmpRecords"
        elif not body.get("name"):
            body["name"] = "fuzzReport"
        if not body.get("title"):
            body["title"] = "Fuzz Test Report"
        body["reportSource"] = "database"
        body["databaseQuery"] = {"queryName": "listRDMPRecords"}

    # Users create (PUT = createUser). Schema requires username, name, email,
    # password, roles with additionalProperties: false. Generated bodies often
    # omit required string fields, causing validation-failure 400s that trigger
    # MISSING_TEST_DATA or VALIDATION_MISMATCH. Only inject missing required
    # fields; do NOT add fields outside the schema (e.g. branding) since the
    # API enforces additionalProperties: false.
    if path.endswith("/api/users") and method == "PUT":
        if not body.get("username"):
            body["username"] = "fuzz-gen-user"
        if not body.get("name"):
            body["name"] = "Fuzz Generated User"
        if not body.get("email"):
            body["email"] = "fuzzgen@test.local"
        if not body.get("password"):
            body["password"] = "FuzzP@ss123!"
        if "roles" not in body or not body["roles"]:
            body["roles"] = ["guest"]

    # Users update (POST = updateUser) locates the user by body.id. Force it to the
    # disposable fuzz user so the fuzzer can never modify the admin account whose
    # token authenticates the run (e.g. changing its roles/credentials).
    if path.endswith("/api/users") and method == "POST":
        body["id"] = _seed_value("fuzz-user.json", "fuzz-nonexistent-user")

    return body


def _path_param_examples(case):
    path = getattr(case, "path", "") or ""
    if "/api/records/metadata/{recordType}" in path:
        return {"recordType": "rdmp"}
    if "/api/records/metadata/{oid}" in path:
        return {"oid": _seed_value("records.json", "fuzz-rdmp-001")}
    if "/api/records/objectmetadata/{oid}" in path:
        return {"oid": _seed_value("records.json", "fuzz-rdmp-001")}

    dynamic_examples = {
        # All permissions sub-routes need the storage OID (MongoDB _id), not the
        # redboxOid. The seed extraction in run-fuzz-stack.sh captures _id values
        # into storage-oids.json; if it stays empty, we intentionally do not
        # substitute redboxOid values because that causes spurious 404s.
        "/api/records/permissions/edit/": {"oid": _seed_value("storage-oids.json", "fuzz-rdmp-001")},
        "/api/records/permissions/editRole/": {"oid": _seed_value("storage-oids.json", "fuzz-rdmp-001")},
        "/api/records/permissions/view/": {"oid": _seed_value("storage-oids.json", "fuzz-rdmp-001")},
        "/api/records/permissions/viewRole/": {"oid": _seed_value("storage-oids.json", "fuzz-rdmp-001")},
        # Bare GET /api/records/permissions/{oid} requires the real storage OID
        # (the redboxOid 404s).
        "/api/records/permissions/": {"oid": _seed_value("storage-oids.json", "fuzz-rdmp-001")},
        # GET /api/records/audit/{oid} likewise needs a real record OID.
        "/api/records/audit/": {"oid": _seed_value("records.json", "fuzz-rdmp-001")},
        "/api/records/datastreams/": {"oid": _seed_value("records.json", "fuzz-rdmp-001"), "datastreamId": "metadata.json"},
        "/api/deletedrecords/": {"oid": _seed_value("records.json", "fuzz-rdmp-001")},
        "/api/harvest-runs/": {"id": _seed_value("harvest-runs.json", "fuzz-harvest-run")},
        "/api/vocabulary/": {"id": _seed_value("vocabularies.json", "anzsrc-for")},
        # Report config {name} lookups use the seed file (populated during seed
        # extraction after creating rdmpRecords) with rdmpRecords fallback.
        "/api/report-config/": {"name": _seed_value("report-configs.json", "rdmpRecords")},
        # /api/users/{id}/{disable,enable,audit,links} -> disposable fuzz user, so
        # account disable never targets the admin account that authenticates the run.
        "/api/users/": {"id": _seed_value("fuzz-user.json", "fuzz-nonexistent-user")},
    }
    examples_by_pattern = {**_DEFAULT_PATH_PARAMETER_EXAMPLES, **dynamic_examples}
    for pattern, examples in examples_by_pattern.items():
        if pattern in path:
            return examples
    return {}


def _query_param_examples(case):
    path = getattr(case, "path", "") or ""
    examples = {}

    # API token generate/revoke target the disposable fuzz user, NOT the admin
    # account that authenticates the run -- revoking/rotating the admin token mid-run
    # would 401 every subsequent request.
    if "/api/users/token/" in path:
        examples["id"] = _seed_value("fuzz-user.json", "fuzz-nonexistent-user")
        return examples

    for pattern, values in _QUERY_PARAMETER_EXAMPLES.items():
        if pattern in path:
            examples.update(values)
    return examples


def _apply_example_parameters(case, kwargs):
    """Prefer known fixture-backed values for path/query parameters.

    Schemathesis is still free to fuzz request bodies and non-critical
    parameters, but these stable identifiers stop valid operations from
    spending most examples on application-level 404 responses.
    """
    # Apply path parameter examples
    path_examples = _path_param_examples(case)
    if path_examples:
        current_path_params = dict(getattr(case, "path_parameters", None) or {})
        current_path_params.update(path_examples)
        try:
            case.path_parameters = current_path_params
        except Exception:  # pragma: no cover - defensive for Schemathesis API changes
            pass

    # Apply query parameter examples
    query_examples = _query_param_examples(case)
    if query_examples:
        current_query = dict(getattr(case, "query", None) or {})
        current_query.update(query_examples)
        try:
            case.query = current_query
        except Exception:  # pragma: no cover - defensive for Schemathesis API changes
            pass


def _replace_empty_object_keys(value):
    if isinstance(value, dict):
        return {
            (key if key != "" else "fuzzKey"): _replace_empty_object_keys(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_replace_empty_object_keys(item) for item in value]
    return value


def _transform_positive_request(case):
    """Sanitise and complete a positive case's body/query during generation.

    Must run in map_case (generation time), not before_call: Schemathesis serialises
    case.body into the request only after before_call, so body mutations made there
    never reach the wire. Here the mutated case is what gets serialised.
    """
    body = getattr(case, "body", None)
    try:
        if _needs_body_defaults(case) and not isinstance(body, dict):
            body = {}
        if isinstance(body, (dict, list, str)):
            body = _strip_null_bytes(body)
            if "/api/records/objectmetadata/" in (getattr(case, "path", "") or ""):
                body = _replace_empty_object_keys(body)
            if isinstance(body, dict):
                body = _inject_body_defaults(case, body)
            case.body = body
    except Exception:  # pragma: no cover - defensive; never block a request
        pass
    query = getattr(case, "query", None)
    if isinstance(query, (dict, list, str)):
        try:
            case.query = _strip_null_bytes(query)
        except Exception:  # pragma: no cover - defensive; never block a request
            pass


@schemathesis.hook
def map_case(ctx, case):
    if _is_negative_case(case):
        _force_invalid_oid_for_negative_datastream_case(case)
    else:
        _apply_example_parameters(case, {})
        _transform_positive_request(case)
    return case


@schemathesis.hook
def before_call(ctx, case, kwargs):
    is_negative_case = _is_negative_case(case)

    # Do not rewrite negative cases: Schemathesis still evaluates them as
    # schema-violating, so replacing invalid generated values with fixture IDs
    # makes a valid HTTP request fail negative_data_rejection.
    if not is_negative_case:
        _apply_example_parameters(case, kwargs)

    # Body/query transforms (null-byte stripping, default injection) are applied in
    # map_case, not here: Schemathesis serialises case.body into the transport payload
    # only AFTER before_call returns, and mutations made here do not survive to the wire.
    # We still defensively strip any body/query already present in kwargs for transports
    # that pre-populate them.
    if not is_negative_case:
        for payload_key in ("json", "data", "params"):
            if isinstance(kwargs.get(payload_key), (dict, list, str)):
                kwargs[payload_key] = _strip_null_bytes(kwargs[payload_key])

    case.headers = case.headers or {}
    case.headers.pop("Cookie", None)
    case.headers.pop("cookie", None)

    if _auth_mode() == "none":
        case.headers.pop("Authorization", None)
        case.headers.pop("authorization", None)
        return

    token = _get_token()
    if token and "Authorization" not in case.headers:
        case.headers["Authorization"] = f"Bearer {token}"
