#!/usr/bin/env python3
"""Verify a Docker save/load handoff independently of the daemon's image store."""

import hashlib
import json
import re
import sys
import tarfile

TAG = "redbox-portal:test"
DIGEST = re.compile(r"sha256:[a-f0-9]{64}\Z")


class VerificationError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise VerificationError(message)


def archive_config(path):
    # Seek over layers rather than extracting the multi-GB archive to disk.
    with tarfile.open(path, "r:") as archive:
        member = archive.getmember("manifest.json")
        require(member.isfile(), "Archive manifest must be a regular file")
        manifest = json.load(archive.extractfile(member))
        require(isinstance(manifest, list) and all(isinstance(item, dict) for item in manifest),
                "Invalid archive manifest")
        entries = [item for item in manifest if TAG in (item.get("RepoTags") or [])]
        require(len(entries) == 1, "Archive must contain exactly one test tag")
        member = archive.getmember(entries[0]["Config"])
        require(member.isfile(), "Archive test config must be a regular file")
        config = archive.extractfile(member).read()
    parsed = json.loads(config)
    require(isinstance(parsed, dict), "Invalid archive test config")
    return "sha256:" + hashlib.sha256(config).hexdigest(), parsed


def archive_digest(path):
    digest = hashlib.sha256()
    with open(path, "rb") as archive:
        for block in iter(lambda: archive.read(1024 * 1024), b""):
            digest.update(block)
    return "sha256:" + digest.hexdigest()


def normalized(value):
    # Inspect may add empty/default Docker fields absent from the saved config.
    # Nested empty labels, ports, volumes and command arguments are meaningful.
    # Numeric zero also matters, for example an explicit StopTimeout of zero.
    return {key: item for key, item in value.items()
            if not (item is None or item is False or item == "" or item == [] or item == {})}


def verify_image(config):
    inspected = json.load(sys.stdin)
    require(isinstance(inspected, list) and len(inspected) == 1 and isinstance(inspected[0], dict),
            "Expected one inspected test image")
    image = inspected[0]
    require(TAG in (image.get("RepoTags") or []), "Loaded image is missing the test tag")
    require(bool(DIGEST.fullmatch(image.get("Id", ""))), "Invalid inspected test image ID")
    rootfs = config.get("rootfs", {})
    require(isinstance(rootfs, dict), "Invalid archive test rootfs")
    layers = rootfs.get("diff_ids")
    require(rootfs.get("type") == "layers" and isinstance(layers, list) and layers
            and all(isinstance(layer, str) and DIGEST.fullmatch(layer) for layer in layers),
            "Invalid archive test rootfs")
    require(image.get("RootFS") == {"Type": "layers", "Layers": layers},
            "Loaded test image rootfs differs from archive")
    for saved, loaded in [("os", "Os"), ("architecture", "Architecture"),
                          ("variant", "Variant"), ("os.version", "OsVersion")]:
        require(config.get(saved, "") == image.get(loaded, ""),
                "Loaded test image platform differs from archive")
    require(config.get("os") and config.get("architecture"), "Invalid archive test platform")
    require(isinstance(config.get("config"), dict) and isinstance(image.get("Config"), dict),
            "Missing test image execution configuration")
    require(normalized(config["config"]) == normalized(image["Config"]),
            "Loaded test image execution configuration differs from archive")


def main():
    action, path = sys.argv[1:3]
    if action == "publish":
        digest, config = archive_config(path)
        verify_image(config)
        print(json.dumps({"version": 1, "archive_digest": archive_digest(path), "config_digest": digest}))
        print(f"Build test image config digest: {digest}", file=sys.stderr)
        return
    with open(sys.argv[3]) as source:
        metadata = json.load(source)
    require(isinstance(metadata, dict) and metadata.get("version") == 1
            and all(isinstance(metadata.get(key), str) and DIGEST.fullmatch(metadata[key])
                    for key in ["archive_digest", "config_digest"]), "Invalid test image metadata")
    require(action in ["verify-archive", "verify-image"], "Invalid verification action")
    if action == "verify-archive":
        require(archive_digest(path) == metadata["archive_digest"], "Test image archive checksum mismatch")
    digest, config = archive_config(path)
    require(digest == metadata["config_digest"], "Test image archive config digest mismatch")
    if action == "verify-image":
        verify_image(config)
        print(f"Verified test tag, rootfs and execution configuration; config digest: {digest}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError, tarfile.TarError) as error:
        # Configs can contain credentials. Never print their contents on failure.
        print(f"Test image handoff verification failed: {type(error).__name__}", file=sys.stderr)
        if isinstance(error, VerificationError):
            print(str(error), file=sys.stderr)
        sys.exit(1)
