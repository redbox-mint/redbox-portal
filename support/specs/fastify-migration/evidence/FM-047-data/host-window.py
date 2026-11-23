"""Summarize host CPU time in the same monotonic measurement windows as FM-007."""
import gzip
import json
import statistics
import sys
from pathlib import Path


def host_window(directory, start, duration):
    with gzip.open(directory / "host.jsonl.gz", "rt") as telemetry:
        rows = [row for line in telemetry if start <= (row := json.loads(line))["monotonicMs"] <= start + duration]
    first, last = (list(map(int, row["hostCpu"].split()[1:9])) for row in (rows[0], rows[-1]))
    deltas = [end - begin for begin, end in zip(first, last, strict=True)]
    assert sum(deltas) > 0
    return {
        name: 100 * deltas[index] / sum(deltas)
        for index, name in [(3, "hostIdlePct"), (4, "hostIoWaitPct"), (7, "hostStealPct")]
    }


def main(raw, batch):
    attempts = {}
    for directory in sorted(raw.glob(batch + "-*")):
        result_path = directory / "result.json"
        if not result_path.is_file():
            continue
        result = json.loads(result_path.read_text())
        if result["valid"]:
            attempts[directory.name] = host_window(directory, result["epoch"], result["protocol"]["measureMs"])
    stats = {}
    if attempts:
        for key in next(iter(attempts.values())):
            values = [window[key] for window in attempts.values()]
            stats[key] = {"median": statistics.median(values), "min": min(values), "max": max(values)}
    print(json.dumps({"hostMetrics": stats, "attempts": attempts}, indent=2))


if __name__ == "__main__":
    main(Path(sys.argv[1]), sys.argv[2])
