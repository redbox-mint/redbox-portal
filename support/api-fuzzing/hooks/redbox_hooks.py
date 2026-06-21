import os
import logging

import schemathesis

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("redbox-hooks")


def _get_token():
    return os.environ.get("REDBOX_API_TOKEN") or ""


def _auth_mode():
    return os.environ.get("REDBOX_FUZZ_AUTH_MODE", "bearer").strip().lower()


@schemathesis.hook
def before_call(ctx, case, kwargs):
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
