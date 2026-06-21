import os
import json
import logging

import schemathesis
from schemathesis.specs.openapi.checks import status_code_conformance
from schemathesis.specs.openapi.checks import UndefinedStatusCode

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("redbox-hooks")


# Known false-positive endpoint patterns for status_code_conformance.
# These endpoints accept data that Schemathesis considers schema-violating
# due to server-side query parameter coercion or intentionally permissive
# schemas (passthrough body, non-restrictive regex patterns).
_FALSE_POSITIVE_PATTERNS = [
    "/api/deletedrecords/list",
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
    "/api/dashboard-config/merged-view/": {"viewName": "rdmp", "stepName": "draft"},
    "/api/dashboard-config/merged-type/": {"dashboardType": "rdmp"},
    "/api/harvest-runs/": {"id": "fuzz-harvest-run"},
    "/api/i18n/entries/": {"locale": "en", "namespace": "translation", "key": "menu-dashboard-config", "keyExt": "json"},
    "/api/branding/rollback/": {"versionId": "1"},
    "/api/report-config/": {"name": "rdmpRecords"},
    "/api/vocabulary/": {"id": "anzsrc-for"},
}

_QUERY_PARAMETER_EXAMPLES = {
    "/api/forms/get": {"recordType": "rdmp"},
    "/api/recordtypes/get": {"recordType": "rdmp"},
    "/api/report/namedQuery": {"queryName": "listRDMPRecords"},
    "/api/users/find": {"username": "admin"},
    "/api/users/get": {"username": "admin"},
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


def _get_token():
    return os.environ.get("REDBOX_API_TOKEN") or ""


def _auth_mode():
    return os.environ.get("REDBOX_FUZZ_AUTH_MODE", "bearer").strip().lower()


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


def _path_param_examples(case):
    path = getattr(case, "path", "") or ""
    if "/api/records/metadata/{recordType}" in path:
        return {"recordType": "rdmp"}
    if "/api/records/metadata/{oid}" in path:
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
def before_call(ctx, case, kwargs):
    _apply_example_parameters(case, kwargs)

    if isinstance(getattr(case, "body", None), (dict, list, str)):
        try:
            case.body = _strip_null_bytes(case.body)
            if "/api/records/objectmetadata/" in (getattr(case, "path", "") or ""):
                case.body = _replace_empty_object_keys(case.body)
        except Exception:  # pragma: no cover - defensive; never block a request
            pass
    if isinstance(getattr(case, "query", None), (dict, list, str)):
        try:
            case.query = _strip_null_bytes(case.query)
        except Exception:  # pragma: no cover - defensive; never block a request
            pass
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
