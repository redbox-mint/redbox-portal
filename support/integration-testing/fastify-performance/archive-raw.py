"""Archive FM-007 raw evidence; verify every member before removing source copies.

Reporting does not require this archive. See README.md for optional raw replay.
"""

import argparse
import datetime
import hashlib
import json
from pathlib import Path, PurePosixPath
import tarfile

ROOT = Path(__file__).resolve().parents[2] / "specs/fastify-migration/evidence/FM-007-data"
ARCHIVE = Path("/home/ubuntu/work/evidence-archive/fastify-migration/FM-007/raw-telemetry.tar.gz")


def digest(source):
    value = hashlib.sha256()
    while chunk := source.read(1024 * 1024):
        value.update(chunk)
    return value.hexdigest()


def identity(filename):
    assert filename.is_file() and not filename.is_symlink(), f"not a regular file: {filename}"
    with filename.open("rb") as source:
        return {"size": filename.stat().st_size, "sha256": digest(source)}


def verify(manifest, archive):
    assert identity(archive) == {key: manifest["archive"][key] for key in ("size", "sha256")}, "archive hash/size mismatch"
    expected = {item["path"]: item for item in manifest["files"]}
    assert len(expected) == len(manifest["files"]), "duplicate manifest path"
    seen = set()
    with tarfile.open(archive, "r:gz") as bundle:
        for member in bundle:
            name = PurePosixPath(member.name)
            assert member.isfile() and not name.is_absolute() and ".." not in name.parts, "unsafe archive member"
            assert member.name in expected and member.name not in seen, "unexpected/duplicate archive member"
            item = expected[member.name]
            assert member.size == item["size"], f"member size mismatch: {member.name}"
            with bundle.extractfile(member) as source:
                assert digest(source) == item["sha256"], f"member hash mismatch: {member.name}"
            seen.add(member.name)
    assert seen == set(expected), "missing archive members"
    return {"archive": str(archive), "files": len(seen), "bytes": sum(item["size"] for item in expected.values()), "verified": True}


def create(root, archive, measured_harness):
    manifest_file = root / "raw-manifest.json"
    assert not manifest_file.exists(), "manifest already exists; verify instead"
    assert not archive.is_relative_to(root), "archive must be outside evidence"
    assert not archive.is_relative_to(Path(__file__).resolve().parents[3]), "archive must be outside repository"
    assert root.is_dir() and measured_harness.is_dir()
    sources = {}
    for directory in sorted(root.iterdir()):
        if directory.is_dir() and (directory / "result.json").is_file():
            assert not directory.is_symlink()
            for filename in sorted(directory.iterdir()):
                if filename.name != "result.json":
                    sources[filename.relative_to(root).as_posix()] = filename
        elif directory.is_file() and (
            directory.suffix == ".log"
            or (directory.suffix == ".jsonl" and directory.name != "attempts.jsonl")
            or directory.name.startswith("host-before")
        ):
            sources[directory.name] = directory
    artifact = json.loads((root / "artifact.json").read_text())
    for name, expected in artifact["harness"].items():
        filename = measured_harness / name
        assert identity(filename)["sha256"] == expected, f"measured harness mismatch: {name}"
        sources["measured-harness/" + name] = filename
    entries = [{"path": name, **identity(filename)} for name, filename in sorted(sources.items())]
    archive.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, "x:gz", compresslevel=6) as bundle:
        for name, filename in sorted(sources.items()):
            bundle.add(filename, arcname=name, recursive=False)
    manifest = {
        "schema": 1,
        "createdUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "pathBase": "FM-007-data; measured-harness/ contains the original measured harness",
        "archive": {"path": str(archive), **identity(archive)},
        "files": entries,
    }
    result = verify(manifest, archive)
    # Establish the repository manifest and recheck each source before unlinking it.
    with manifest_file.open("x") as target:
        target.write(json.dumps(manifest, indent=2) + "\n")
    for entry in entries:
        filename = sources[entry["path"]]
        assert identity(filename) == {key: entry[key] for key in ("size", "sha256")}, f"source changed: {filename}"
        if not entry["path"].startswith("measured-harness/"):
            filename.unlink()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("create", "verify"))
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--archive", type=Path, help="override archive path after durable relocation")
    parser.add_argument("--measured-harness", type=Path, help="create only: preserved original measured harness directory")
    args = parser.parse_args()
    root = args.root.resolve()
    if args.action == "create":
        if args.measured_harness is None:
            parser.error("--measured-harness is required for create")
        result = create(root, (args.archive or ARCHIVE).resolve(), args.measured_harness.resolve())
    else:
        manifest = json.loads((root / "raw-manifest.json").read_text())
        result = verify(manifest, args.archive or Path(manifest["archive"]["path"]))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
