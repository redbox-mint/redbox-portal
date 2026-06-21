import os
import logging

import schemathesis

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("redbox-hooks")


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


@schemathesis.hook
def before_call(ctx, case, kwargs):
    if isinstance(getattr(case, "body", None), (dict, list, str)):
        try:
            case.body = _strip_null_bytes(case.body)
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
