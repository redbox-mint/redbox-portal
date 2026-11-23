"""Verify W2 output against the retained portal and request logs."""

from collections import Counter
from datetime import datetime
import gzip
import json
from pathlib import Path
import re
import sys
import tarfile


def read_portal(stream):
    with gzip.open(stream, "rt") as lines:
        return list(map(json.loads, lines))


def only_readiness(rows):
    assert len(rows) == 1 and rows[0]["ready"] is True, rows[:3]


def baseline_logs(archive):
    verified = {}
    with tarfile.open(archive, "r|gz") as tar:
        for member in tar:
            if re.fullmatch(r"express-02-(direct|proxy)-W2-0-c[14]-[1-5]/portal\.log\.gz", member.name):
                only_readiness(read_portal(tar.extractfile(member)))
                verified[member.name.split("/")[0]] = {"ready": 1, "other": 0}
    assert len(verified) == 20
    return verified


def audit_warn_run(result_path):
    directory = result_path.parent
    result = json.loads(result_path.read_text())
    with gzip.open(directory / "requests.jsonl.gz", "rt") as lines:
        attempts = Counter(row["oid"] for row in map(json.loads, lines))
    portal_rows = read_portal(directory / "portal.log.gz")
    only_readiness(portal_rows[:1])
    driver_log = directory.with_suffix(".log").read_text().splitlines()
    phases = {event["event"]: event["utc"] for event in map(json.loads, driver_log[:3])}
    warm_start = datetime.fromisoformat(phases["warmup"]).timestamp() * 1000
    start = datetime.fromisoformat(phases["measurement"]).timestamp() * 1000
    end = start + result["protocol"]["measureMs"]
    measured = Counter()
    timed = 0
    warm = 0
    pre_warm = 0
    for row in portal_rows[1:]:
        assert row["level"] == 40, row
        if row["msg"] == "record_concurrency_event":
            assert row["time"] < warm_start
            pre_warm += 1
            continue
        assert row["msg"] == "Service operation", row
        details = row["info"]
        assert details["rdmpEditorCount"] == details["rdmpViewerCount"] == 0
        oid = details["rdmpPermissionOid"]
        if oid.startswith("fm007-warm-"):
            assert row["time"] < start
            warm += 1
        else:
            measured[oid] += 1
            timed += start <= row["time"] < end
    assert pre_warm == 1 and result["controls"]["missingPreconditionStatus"] == 428
    assert measured == attempts
    assert warm == result["warmup"]["operations"]
    return {
        "permissionWarningsInWallClockWindow": timed,
        "permissionWarningsForMeasuredRequestsIncludingLate": measured.total(),
        "measuredRequestRows": attempts.total(),
        "permissionWarningsForWarmupRequests": warm,
        "preWarmupRecordConcurrencyWarnings": pre_warm,
    }


def audit_silent_run(result_path, image):
    result = json.loads(result_path.read_text())
    assert result["image"] == image and result["valid"]
    config = result["containerConfiguration"]["config"]
    assert config["Image"] == image and config["Cmd"] == ["node", "app.js"]
    assert [line for line in config["Env"] if line.startswith("REDBOX_LOG_LEVEL=")] == ["REDBOX_LOG_LEVEL=silent"]
    only_readiness(read_portal(result_path.parent / "portal.log.gz"))
    return {"ready": 1, "other": 0, "timed": 0}


def main(archive, warn_root, silent_root, image):
    warn = {
        result.parent.name: audit_warn_run(result)
        for result in sorted(warn_root.glob("r5-*-W2-*/result.json"))
    }
    silent = {
        result.parent.name: audit_silent_run(result, image)
        for result in sorted(silent_root.glob("r5-w2-silent-*-W2-*/result.json"))
    }
    assert len(warn) == len(silent) == 20
    totals = {key: sum(run[key] for run in warn.values()) for key in next(iter(warn.values()))}
    print(json.dumps({
        "express02": baseline_logs(archive),
        "r5Warn": warn,
        "r5WarnTotals": totals,
        "r5Silent": silent,
    }, indent=2))


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4])
