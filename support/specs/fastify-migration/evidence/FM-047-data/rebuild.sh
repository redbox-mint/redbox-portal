#!/usr/bin/env bash
set -euo pipefail

build=${1:?supply the disposable build directory containing git-identities.txt and tag.txt}
previous=/home/ubuntu/work/fastify-orchestration/artifacts/FM-044-r4
mapfile -t identity < "$build/git-identities.txt"
base=${identity[0]}
tree=${identity[1]}
tag=$(< "$build/tag.txt")
source_dir="$build/source"
qemu="$build/qemu"
registration=fm047-qemu-x86_64
test -z "$(timeout 20 docker ps -aq)"
test ! -e "/proc/sys/fs/binfmt_misc/$registration"

record() {
  printf '%s ' "$(date -u +%FT%TZ)" >> "$build/commands.log"
  printf '%q ' "$@" >> "$build/commands.log"
  printf '\n' >> "$build/commands.log"
  local result=0
  "$@" || result=$?
  printf '%s exit=%s\n' "$(date -u +%FT%TZ)" "$result" >> "$build/commands.log"
  return "$result"
}

cleanup() {
  if [[ -e "/proc/sys/fs/binfmt_misc/$registration" ]]; then
    timeout 20 sudo -n sh -c 'echo -1 > "$1"' sh "/proc/sys/fs/binfmt_misc/$registration"
  fi
}
trap cleanup EXIT
mkdir "$source_dir" "$qemu"
record timeout --kill-after=10s 180s git archive --output "$build/source.tar" "$tree"
record timeout --kill-after=10s 180s tar -xf "$build/source.tar" -C "$source_dir"
rm "$build/source.tar"
(cd "$source_dir" && timeout 60 sha256sum -c "$previous/lockfiles.sha256") > "$build/lockfile-check.log"

for arch in arm64 amd64; do
  if [[ "$arch" == amd64 ]]; then
    record timeout --kill-after=10s 180s curl -fLSs --retry 2 --output "$qemu/release.tar.gz" "$(< "$previous/qemu-download-url.txt")"
    printf '%s  %s\n' ca19f8d202b977904f70fa6464b5ef9439740951d40f89730d2f2981f853bfaa "$qemu/release.tar.gz" | sha256sum -c
    member=$(timeout 20 tar -tzf "$qemu/release.tar.gz" | awk -F/ '$NF == "qemu-x86_64"')
    timeout 20 tar -xOzf "$qemu/release.tar.gz" "$member" > "$qemu/qemu-x86_64"
    printf '%s  %s\n' f04e3597ebf2ba6fe98bfb8f453dcbb1b767695e0283ceb7fa265af94d66fc19 "$qemu/qemu-x86_64" | sha256sum -c
    chmod +x "$qemu/qemu-x86_64"
    sed "s@^:fm044-r4-qemu-x86_64:@:$registration:@;s@:[^:]*qemu-x86_64:OPF\$@:$qemu/qemu-x86_64:OPF@" "$previous/qemu-binfmt.conf" > "$qemu/binfmt.conf"
    timeout 20 sudo -n tee /proc/sys/fs/binfmt_misc/register < "$qemu/binfmt.conf" > /dev/null
    cat "/proc/sys/fs/binfmt_misc/$registration" > "$build/qemu-registration.txt"
    timeout 20 "$qemu/qemu-x86_64" --version > "$build/qemu-version.txt"
  fi
  record timeout --kill-after=30s 5400s docker buildx build --progress plain --platform "linux/$arch" \
    --target runtime --build-arg REDBOX_BUILD_PLATFORM=linux/arm64 \
    --label "io.researchdatabox.source-tree=$tree" --label "io.researchdatabox.base-revision=$base" \
    --label org.opencontainers.image.source=https://github.com/redbox-mint/redbox-portal \
    --tag "$tag-$arch" --provenance=false --metadata-file "$build/$arch-build-metadata.json" --load \
    "$source_dir" > "$build/$arch-build.log" 2>&1
done

cp "$previous/assemble-index.py" "$previous/inspect-index.py" "$build/"
record timeout 60 python3 "$build/assemble-index.py" "$build/index"
record timeout --kill-after=20s 120s sudo -n ctr -n moby images import --local --all-platforms --no-unpack \
  --index-name "docker.io/library/$tag" "$build/index/index.tar"
record timeout 180 python3 "$build/inspect-index.py"
