"""Render the explicitly selected baseline; never pool supplementary batches.

Run report.cjs first, then this script from any directory (Python stdlib only).
"""

import csv
import datetime
import json
import pathlib
import statistics

ROOT = pathlib.Path(__file__).resolve().parent
summary = json.loads((ROOT / "summary.json").read_text())
selection = json.loads((ROOT / "baseline-selection.json").read_text())
artifact = json.loads((ROOT / "artifact.json").read_text())
batch = selection["baselineBatch"]
attempts = {
    item["directory"]: item for item in summary["attempts"]
    if item["directory"].startswith(batch + "-")
}
assert len(attempts) == 100
assert all(item["valid"] and item["completed"] and not item["smoke"] for item in attempts.values())


def band(values):
    assert len(values) == 5
    median = statistics.median(values)
    return {
        "values": values, "median": median, "min": min(values), "max": max(values),
        "variabilityPct": (max(values) - min(values)) / median * 100 if median else None,
    }


def span(value, divisor=1):
    return f"{value['median'] / divisor:.2f} [{value['min'] / divisor:.2f}, {value['max'] / divisor:.2f}]"


def table(headers, rows):
    return "\n".join([
        "<!-- prettier-ignore -->", "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
        *["| " + " | ".join(map(str, row)) + " |" for row in rows],
    ])


cells = {}
run_rows = []
request_rows, resource_rows, variation_rows = [], [], []
for cell in artifact["cells"]:
    identity = cell["id"]
    group = summary["batches"][identity][batch]
    assert group["complete"] and len(group["attempts"]) == 5
    runs = [attempts[name] for name in group["attempts"]]
    assert all(run["metrics"]["completed"] >= 100 for run in runs)
    assert all(run["metrics"]["errors"] == run["metrics"]["timeouts"] == 0 for run in runs)
    for key, expected in group["metrics"].items():
        assert band([run["metrics"][key] for run in runs]) == expected
    providers = {
        name: {
            metric: band([run["resource"]["providers"][name][metric] for run in runs])
            for metric in ["cpuPctOneCore", "rssHighWaterMiB"]
        }
        for name in runs[0]["resource"]["providers"]
    }
    cells[identity] = {**group, "providers": providers}
    for run in runs:
        row = {"attempt": run["directory"], "cell": identity}
        row.update({key: value for key, value in run["metrics"].items() if key != "reasons"})
        row.update({key: value for key, value in run["resource"].items() if isinstance(value, (int, float))})
        for name, metrics in run["resource"]["providers"].items():
            row.update({name + "." + key: value for key, value in metrics.items()})
        run_rows.append(row)
    metrics, resources = group["metrics"], group["resources"]
    link = f"[{identity}]({batch}-{identity}-aggregate.json)"
    request_rows.append([
        link, span(metrics["p95Ms"]), span(metrics["completedPerSecond"]),
        span(metrics["bytesPerSecond"], 1048576), span(metrics["ttfbP95Ms"]),
        f"{min(run['metrics']['completed'] for run in runs)}–{max(run['metrics']['completed'] for run in runs)}",
    ])
    resource_rows.append([
        identity, span(resources["nodeCpuPct"]), span(resources["nodeRssHighWaterMiB"]),
        span(resources["nodeHeapHighWaterMiB"]), span(resources["retainedRssMiB"]),
        span(resources["retainedHeapMiB"]), span(resources["completionAndDrainMs"]),
    ])
    noisy_resources = {
        key: value["variabilityPct"] for key, value in resources.items()
        if value["variabilityPct"] is not None and value["variabilityPct"] > 10
    }
    noisy_providers = {
        name + "." + key: value["variabilityPct"]
        for name, values in providers.items() for key, value in values.items()
        if value["variabilityPct"] is not None and value["variabilityPct"] > 10
    }
    cells[identity]["providerVariabilityAbove10Pct"] = noisy_providers
    variation_rows.append([
        identity, *[f"{metrics[key]['variabilityPct']:.2f}%" for key in
                    ["p95Ms", "ttfbP95Ms", "completedPerSecond", "bytesPerSecond"]],
        "; ".join(f"{key} {value:.2f}%" for key, value in noisy_resources.items()) or "None",
        "; ".join(f"{key} {value:.2f}%" for key, value in noisy_providers.items()) or "None",
    ])

record = {
    "generatedUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "selection": selection, "image": artifact["image"], "sourceHead": artifact["sourceHead"],
    "protocol": artifact["protocol"], "cells": cells,
    "totals": {
        key: sum(run["metrics"][key] for run in attempts.values())
        for key in ["offered", "completed", "late", "errors", "timeouts"]
    },
}
(ROOT / "baseline.json").write_text(json.dumps(record, indent=2) + "\n")
with (ROOT / "baseline-runs.csv").open("w", newline="") as output:
    writer = csv.DictWriter(output, fieldnames=list(run_rows[0]))
    writer.writeheader()
    writer.writerows(run_rows)
(ROOT / "baseline-tables.md").write_text("\n\n".join([
    table(["Cell / all five values", "Full completion p95 ms", "Completed operations/s", "MiB/s", "TTFB p95 ms", "Timed completions/run"], request_rows),
    table(["Cell", "Node CPU % of one core", "Node RSS high-water MiB", "Node heap high-water MiB", "RSS after drain MiB", "Heap after drain MiB", "Completion + drain ms"], resource_rows),
    table(["Cell", "Full p95 variation", "TTFB p95 variation", "Operations/s variation", "Bytes/s variation", "Other Node/drain metrics above 10%", "Provider/generator metrics above 10%"], variation_rows),
]) + "\n")
print(json.dumps({"baselineSamples": len(attempts), "cells": len(cells), "totals": record["totals"]}))
