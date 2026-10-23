"""Validate the sanitized logical fixture without connecting to a database."""
import json
import re
from pathlib import Path

base = Path(__file__).resolve().parent
fixture = json.loads((base / "released-v5-upgrade-fixture.json").read_text())
collections = {item["collection"]: item["documents"] for item in fixture["collections"]}


def identity(value):
    return value.get("$oid") if isinstance(value, dict) else value


def identities(name):
    return {identity(document["_id"]) for document in collections[name]}


for link in collections["role_users__user_roles"]:
    assert identity(link["user_roles"]) in identities("user")
    assert identity(link["role_users"]) in identities("role")
for name in ["role", "recordtype", "form", "pathrule", "dashboardtype", "workspacetype"]:
    for document in collections[name]:
        assert identity(document["branding"]) in identities("brandingconfig")
for step in collections["workflowstep"]:
    assert identity(step["recordType"]) in identities("recordtype")
    assert identity(step["form"]) in identities("form")

sanitized_emails = 0


def check(value):
    global sanitized_emails
    if isinstance(value, dict):
        for key, child in value.items():
            assert not re.search("password|secret|token|apikey|cookie", key, re.I), key
            check(child)
    elif isinstance(value, list):
        for child in value:
            check(child)
    elif isinstance(value, str) and re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", value):
        assert value == "synthetic@example.invalid"
        sanitized_emails += 1


for item in fixture["collections"]:
    assert item["count"] == len(item["documents"])
    check(item["documents"])
result = {
    "collections": len(fixture["collections"]),
    "documents": sum(item["count"] for item in fixture["collections"]),
    "roleLinks": len(collections["role_users__user_roles"]),
    "workflowFormLinks": len(collections["workflowstep"]),
    "credentialKeysRemaining": 0,
    "sanitizedEmailValues": sanitized_emails,
    "status": "pass",
    "limitations": "Logical fixture only; credential re-seeding and a complete consistent institution backup/recovery rehearsal are still required.",
}
(base / "released-v5-fixture-validation.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result))
