"""Summarize V8 self time and inclusive source time, weighted by sampling interval."""
import collections
import json
import sys
from pathlib import Path


def summarize(profile):
    nodes = {node["id"]: node for node in profile["nodes"]}
    parents = {
        child: node["id"]
        for node in nodes.values()
        for child in node.get("children", ())
    }
    self_time = collections.Counter()
    source_time = collections.Counter()
    paths = collections.Counter()
    route_name_paths = collections.Counter()

    def label(node_id):
        frame = nodes[node_id]["callFrame"]
        name, url = frame["functionName"], frame["url"]
        location = url.removeprefix("file:///opt/redbox-portal/")
        return name or "(anonymous)", location, frame["lineNumber"] + 1

    for elapsed, sample in zip(profile["timeDeltas"], profile["samples"], strict=True):
        self_time[label(sample)] += elapsed
        sources = set()
        path = []
        stack = []
        node_id = sample
        while node_id is not None:
            frame = label(node_id)
            name, source, _ = frame
            stack.append(frame)
            if source:
                sources.add(source)
            if source.startswith("packages/redbox-core/"):
                path.append(f"{name} ({source})")
            node_id = parents.get(node_id)
        for source in sources:
            source_time[source] += elapsed
        paths[tuple(reversed(list(dict.fromkeys(path))[-8:]))] += elapsed
        for index, (name, source, _) in enumerate(stack):
            if name == "coreRouteName" and source.endswith("/http/fastify/routes.js"):
                route_name_paths[tuple(stack[index:index + 4])] += elapsed
                break

    def top(counter, limit):
        total = sum(self_time.values())
        return [
            {"frame": frame, "timeMs": elapsed / 1000, "percent": 100 * elapsed / total}
            for frame, elapsed in counter.most_common(limit)
        ]

    return {
        "samples": len(profile["samples"]),
        "durationSeconds": sum(self_time.values()) / 1e6,
        "self": top(self_time, 40),
        "inclusiveSources": top(source_time, 40),
        "corePaths": top(paths, 15),
        "routeNameCallers": top(route_name_paths, 10),
    }


if __name__ == "__main__":
    print(json.dumps(summarize(json.loads(Path(sys.argv[1]).read_text())), indent=2))
