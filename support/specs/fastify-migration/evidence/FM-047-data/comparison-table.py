"""Display the FM-005 gate metrics and supporting resource and workload counts."""
import json
import sys
from pathlib import Path


def medians(express, fastify, key, digits=2):
    return f"{express[key]['median']:.{digits}f} → {fastify[key]['median']:.{digits}f}"


def variability(express, fastify, key):
    return f"{express[key]['variabilityPct']:.1f} / {fastify[key]['variabilityPct']:.1f}"


def emit(data):
    print("| Cell | p95 ms | p95 deterioration | Successful ops/s | Throughput deterioration | p95 variability % | Ops/s variability % |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    for cell, row in data["comparison"].items():
        if not row["candidate"].get("complete"):
            print(f"| {cell} | Pending ({row['candidate']['validAttempts']}/5 valid) | — | — | — | — | — |")
            continue
        express, fastify = (row[host]["metrics"] for host in ("baseline", "candidate"))
        p95, throughput = (row["deterioration"][key] for key in ("p95Pct", "throughputPct"))
        print("| " + " | ".join([
            cell, medians(express, fastify, "p95Ms"), f"{p95:+.1f}%",
            medians(express, fastify, "completedPerSecond"), f"{throughput:+.1f}%",
            variability(express, fastify, "p95Ms"), variability(express, fastify, "completedPerSecond"),
        ]) + " |")

    print("\n| Cell | TTFB p95 ms | MiB/s | Peak Node RSS MiB | Post-drain RSS MiB | Timed successes | Late successes | Errors / timeouts / dropped |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for cell, row in data["comparison"].items():
        if not row["candidate"].get("complete"):
            continue
        express, fastify = (row[host] for host in ("baseline", "candidate"))
        total = lambda host, key: host["counts"][key]
        print("| " + " | ".join([
            cell,
            medians(express["metrics"], fastify["metrics"], "ttfbP95Ms"),
            " → ".join(f"{host['metrics']['bytesPerSecond']['median'] / 1048576:.2f}" for host in (express, fastify)),
            medians(express["resources"], fastify["resources"], "nodeRssHighWaterMiB", 1),
            medians(express["resources"], fastify["resources"], "retainedRssMiB", 1),
            f"{total(express, 'completed'):,} → {total(fastify, 'completed'):,}",
            f"{total(express, 'late')} → {total(fastify, 'late')}",
            " → ".join(" / ".join(str(total(host, key)) for key in ("errors", "timeouts", "unaccounted")) for host in (express, fastify)),
        ]) + " |")


if __name__ == "__main__":
    emit(json.loads(Path(sys.argv[1]).read_text()))
