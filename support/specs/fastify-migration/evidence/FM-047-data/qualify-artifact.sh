#!/usr/bin/env bash
set -euo pipefail

build=${1:?supply the FM-047 build directory}
previous=/home/ubuntu/work/fastify-orchestration/artifacts/FM-044-r4
registration=/proc/sys/fs/binfmt_misc/fm047-qemu-x86_64
reference=$(jq -er .digestReference "$build/index-identity.json")
tools="$build/source/support/tooling/fastify-retirement"
test ! -e "$registration"
test -z "$(timeout 20 docker ps -aq)"

remove_emulator() {
  if [[ -e "$registration" ]]; then
    timeout 20 sudo -n sh -c 'echo -1 > "$1"' sh "$registration"
  fi
}
trap remove_emulator EXIT
timeout 20 sudo -n tee /proc/sys/fs/binfmt_misc/register < "$build/qemu/binfmt.conf" > /dev/null

# Reuse the HTTP checks in the FM-044 smoke on a dedicated Tailscale port.
sed -e 's/fm044-r4-/fm047-r5-/g' -e 's/^port = 49444$/port = 49447/' \
  -e 's/^    browser_result = browser_smoke(.*$/    browser_result = None/' \
  -e '/"--memory=1g", mongo_ref/i\              "--ulimit", "nofile=64000:64000",' \
  "$previous/smoke.py" > "$build/smoke.py"
for arch in arm64 amd64; do
  manifest=$(jq -er --arg platform "linux/$arch" '.platforms[] | select(.platform == $platform) | .manifestDigest' "$build/index-identity.json")
  timeout --kill-after=25s 1500s python3 "$build/smoke.py" "$arch" "$reference" "$manifest" > "$build/$arch-smoke.log" 2>&1
  timeout --kill-after=15s 180s docker run --rm --pull=never --platform "linux/$arch" --network none \
    --read-only "$reference" sh -ec 'node --version && npm --version && id -u && dpkg-query -W -f="\${Package}\t\${Version}\n"' \
    > "$build/$arch-runtime-toolchain.txt"
done
remove_emulator

DOCKER_DEFAULT_PLATFORM=linux/arm64 timeout --kill-after=15s 900s node "$tools/runtime-image-audit.cjs" "$reference" \
  > "$build/arm64-filesystem-closure.json"

# FM-044 ran this same filesystem scan with a native ARM64 auditor inside
# the AMD64 filesystem. Use the pinned host Node and its shared libraries.
mkdir -p "$build/native-audit" "$build/native-auditor/lib"
node_binary=$(readlink -f "$(command -v node)")
cp "$node_binary" "$build/native-auditor/node"
ldd "$node_binary" | awk '{for (i = 1; i <= NF; i++) if ($i ~ /^\//) print $i}' |
  while IFS= read -r library; do cp -L "$library" "$build/native-auditor/lib/"; done
cp "$tools/express-closure.cjs" "$tools/runtime-dependencies.cjs" "$build/native-audit/"
python3 - "$tools/runtime-image-audit.cjs" "$build/native-audit/runtime-image-audit.cjs" <<'PY'
from pathlib import Path
import sys

source, target = map(Path, sys.argv[1:])
original = source.read_text()
modified = original.replace("      '--entrypoint',\n      'node',\n      image,", """      '--mount',
      'type=bind,src=' + process.env.FM044_NATIVE_AUDITOR + ',dst=/dev/fm044-auditor,readonly',
      '--entrypoint',
      '/dev/fm044-auditor/lib/ld-linux-aarch64.so.1',
      image,
      '--library-path',
      '/dev/fm044-auditor/lib',
      '/dev/fm044-auditor/node',""")
assert modified != original
target.write_text(modified)
PY
DOCKER_DEFAULT_PLATFORM=linux/amd64 FM044_NATIVE_AUDITOR="$build/native-auditor" \
  timeout --kill-after=15s 900s node "$build/native-audit/runtime-image-audit.cjs" "$reference" \
  > "$build/amd64-filesystem-closure.json"
