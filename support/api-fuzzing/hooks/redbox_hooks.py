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
    "/api/dashboard-config/merged-type/": {"dashboardType": "table"},
    "/api/harvest-runs/": {"id": "fuzz-harvest-run"},
    "/api/i18n/entries/": {"locale": "en", "namespace": "translation", "key": "menu-dashboard-config", "keyExt": "json"},
    "/api/branding/rollback/": {"versionId": "1"},
    "/api/report-config/": {"name": "rdmpRecords"},
    "/api/vocabulary/": {"id": "anzsrc-for"},
    "/api/users/": {"id": "admin"},
    "/api/records/harvest/": {"recordType": "rdmp"},
    "/api/mint/harvest/": {"recordType": "rdmp"},
}

_QUERY_PARAMETER_EXAMPLES = {
    "/api/forms/get": {"recordType": "rdmp"},
    "/api/recordtypes/get": {"recordType": "rdmp"},
    "/api/report/namedQuery": {"queryName": "listRDMPRecords"},
    "/api/users/find": {"username": "admin"},
    "/api/users/get": {"username": "admin"},
    "/api/users/token/generate": {"id": "admin"},
    "/api/users/token/revoke": {"id": "admin"},
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


@schemathesis.check
def redbox_negative_data_rejection(ctx, response, case):
    """Negative data rejection with Redbox seed false-positive suppression."""
    try:
        return negative_data_rejection(ctx, response, case)
    except AcceptedNegativeData:
        if _is_default_positive_negative_datastream_case(case):
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


def _inject_body_defaults(case):
    """Inject required body fields for schema-strict endpoints."""
    path = getattr(case, "path", "") or ""
    method = (getattr(case, "method", "") or "").upper()
    body = getattr(case, "body", None)

    if not isinstance(body, dict):
        return

    # User link operation
    if "/api/users/link" in path and method == "POST":
        if "primaryUserId" not in body or not body["primaryUserId"]:
            body["primaryUserId"] = _seed_value("users.json", "admin")
        if "secondaryUserId" not in body or not body["secondaryUserId"]:
            body["secondaryUserId"] = "fuzz-user-001"

    # Vocabulary sync
    if "/sync" in path and method == "POST" and "/api/vocabulary/" in path:
        if "versionId" not in body or not body["versionId"]:
            body["versionId"] = "1"

    # Vocabulary reorder
    if "/reorder" in path and method == "PUT" and "/api/vocabulary/" in path:
        if "entries" not in body or not body["entries"]:
            body["entries"] = [{"id": "01", "order": 0}, {"id": "02", "order": 1}]

    # Report config create/preview
    if "/api/report-config" in path and method == "POST":
        defaults = {
            "name": "fuzzReport",
            "title": "Fuzz Test Report",
            "reportSource": "database",
            "databaseQuery": {"queryName": "listRDMPRecords"},
        }
        for key, val in defaults.items():
            if key not in body or body[key] is None:
                body[key] = val

    # Users create
    if path.endswith("/api/users") and method == "PUT":
        if "roles" not in body or not body["roles"]:
            body["roles"] = ["guest"]


def _path_param_examples(case):
    path = getattr(case, "path", "") or ""
    if "/api/records/metadata/{recordType}" in path:
        return {"recordType": "rdmp"}
    if "/api/records/metadata/{oid}" in path:
        return {"oid": _seed_value("records.json", "fuzz-rdmp-001")}
    if "/api/records/objectmetadata/{oid}" in path:
        return {"oid": _seed_value("records.json", "fuzz-rdmp-001")}

    dynamic_examples = {
        "/api/records/permissions/edit/": {"oid": _seed_value("records.json", "fuzz-rdmp-001")},
        "/api/records/permissions/editRole/": {"oid": _seed_value("records.json", "fuzz-rdmp-001")},
        "/api/records/permissions/view/": {"oid": _seed_value("records.json", "fuzz-rdmp-001")},
        "/api/records/permissions/viewRole/": {"oid": _seed_value("records.json", "fuzz-rdmp-001")},
        "/api/records/datastreams/": {"oid": _seed_value("records.json", "fuzz-rdmp-001"), "datastreamId": "metadata.json"},
        "/api/deletedrecords/": {"oid": _seed_value("records.json", "fuzz-rdmp-001")},
        "/api/harvest-runs/": {"id": _seed_value("harvest-runs.json", "fuzz-harvest-run")},
        "/api/vocabulary/": {"id": _seed_value("vocabularies.json", "anzsrc-for")},
    }
    examples_by_pattern = {**_DEFAULT_PATH_PARAMETER_EXAMPLES, **dynamic_examples}
    for pattern, examples in examples_by_pattern.items():
        if pattern in path:
            return examples
    return {}


def _query_param_examples(case):
    path = getattr(case, "path", "") or ""
    examples = {}

    # Dynamic user ID injection for token operations
    if "/api/users/token/" in path:
        examples["id"] = _seed_value("users.json", "admin")
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


@schemathesis.hook
def map_case(ctx, case):
    if _is_negative_case(case):
        _force_invalid_oid_for_negative_datastream_case(case)
    else:
        _apply_example_parameters(case, {})
    return case


@schemathesis.hook
def before_call(ctx, case, kwargs):
    is_negative_case = _is_negative_case(case)

    # Do not rewrite negative cases: Schemathesis still evaluates them as
    # schema-violating, so replacing invalid generated values with fixture IDs
    # makes a valid HTTP request fail negative_data_rejection.
    if not is_negative_case:
        _apply_example_parameters(case, kwargs)

    if not is_negative_case and isinstance(getattr(case, "body", None), (dict, list, str)):
        try:
            case.body = _strip_null_bytes(case.body)
            if "/api/records/objectmetadata/" in (getattr(case, "path", "") or ""):
                case.body = _replace_empty_object_keys(case.body)
        except Exception:  # pragma: no cover - defensive; never block a request
            pass
        _inject_body_defaults(case)
    if not is_negative_case and isinstance(getattr(case, "query", None), (dict, list, str)):
        try:
            case.query = _strip_null_bytes(case.query)
        except Exception:  # pragma: no cover - defensive; never block a request
            pass
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
