#!/usr/bin/env bash
set -euo pipefail
# settings.py protects the run directory. Build contexts need readable package files.
umask 022

script_dir=$(cd "$(dirname "$0")" && pwd)
repo=$(git -C "$script_dir" rev-parse --show-toplevel)
run=$(cd "${FM049_RUN:?Set FM049_RUN to the directory created by settings.py}" && pwd)
express_hook=$(cd "${1:?Supply the read-only API1 clone path}" && pwd)
api2_pack=$(realpath "${2:?Supply the qualified WSU API2 tarball}")
namespace=$(jq -er '.namespace | select(test("^fm049-[a-z][a-z0-9-]{0,19}$"))' "$run/settings.json")

express_commit=f7ebc45fb5b7c837b66dd309e879f89b87065f7e
api1_commit=764851e98cd2ae2d6938c41b18b8abcc081e0656
api2_sha=${3:?Supply the qualified WSU API2 tarball SHA-256}
[[ $api2_sha =~ ^[0-9a-f]{64}$ ]]
fastify_base=redbox-fm044:r5-980c2f3a1e
fastify_index=sha256:28898f254d52fcbcfc71ed1bebb0c39726ee089e992b643f7303ed1ca581080a
fastify_manifest=sha256:6ea446bc51e6aaab6bad0676934146c6b4fb77932b1448f7120130c1547d3d5b
express_base=redbox-$namespace-express:f7ebc45fb

test "$(docker image inspect "$fastify_base" --format '{{.Id}}')" = "$fastify_index"
test "$(docker image inspect --platform linux/arm64 "$fastify_base" --format '{{.Id}}')" = "$fastify_manifest"
printf '%s  %s\n' "$api2_sha" "$api2_pack" | sha256sum -c
git -C "$express_hook" cat-file -e "$api1_commit^{commit}"
cd "$run"
mkdir express-source express-hook-source express-hook-pack
git -C "$repo" archive "$express_commit" | tar -xf - -C express-source
git -C "$express_hook" archive "$api1_commit" | tar -xf - -C express-hook-source
cat express-source/Dockerfile "$script_dir/express-hook.Dockerfile" > express-hook.Dockerfile

timeout --kill-after=30s 3600s docker build --platform linux/arm64 --progress plain --target runtime \
    --iidfile "$run/components/express-base.iid" --label "org.opencontainers.image.revision=$express_commit" \
    --tag "$express_base" express-source > express-build.log 2>&1
timeout --kill-after=30s 1500s docker buildx build --platform linux/arm64 --progress plain --target wsu_pack \
    --build-context "wsu_source=$run/express-hook-source" --output "type=local,dest=$run/express-hook-pack" \
    -f express-hook.Dockerfile express-source > express-hook-build.log 2>&1

cp "$api2_pack" components/api2.tgz
cp express-hook-pack/redbox-hook-wsu-2.0.0-v6.0.tgz components/api1.tgz
xml_url=$(jq -er '.packages["node_modules/xmlbuilder"].resolved' express-hook-source/package-lock.json)
xml_integrity=$(jq -er '.packages["node_modules/xmlbuilder"].integrity' express-hook-source/package-lock.json)
timeout 60s curl -fLsS "$xml_url" -o components/xmlbuilder.tgz
test "sha512-$(openssl dgst -sha512 -binary components/xmlbuilder.tgz | openssl base64 -A)" = "$xml_integrity"

for variant in express fastify; do
    if [[ $variant == express ]]; then
        base=$express_base
        api=1
    else
        base=$fastify_base
        api=2
    fi
    deployment="redbox-$namespace-$variant:wsu"
    context="components/$variant"
    mkdir "$context"
    cp "components/api$api.tgz" "$context/wsu.tgz"
    cp components/xmlbuilder.tgz "$context/xmlbuilder.tgz"
    cat > "$context/Dockerfile" <<DOCKER
FROM $base
USER root
COPY wsu.tgz xmlbuilder.tgz /tmp/fm049/
RUN mkdir node_modules/redbox-hook-wsu node_modules/xmlbuilder \\
 && tar -xzf /tmp/fm049/wsu.tgz -C node_modules/redbox-hook-wsu --strip-components=1 \\
 && tar -xzf /tmp/fm049/xmlbuilder.tgz -C node_modules/xmlbuilder --strip-components=1 \\
 && npm pkg set 'dependencies.redbox-hook-wsu=2.0.0-v6.0' \\
 && node -e 'const assert=require("node:assert/strict");assert.equal(require("redbox-hook-wsu").registerRedboxExtension().apiVersion,$api);assert.equal(typeof require("redbox-hook-wsu/deployment").createWsuPortal,"function");'
USER node
CMD ["node", "node_modules/redbox-hook-wsu/support/v6/app.cjs"]
DOCKER
    timeout --kill-after=20s 180s docker build --platform linux/arm64 --progress plain \
        --iidfile "$run/components/$variant.iid" --tag "$deployment" "$context" > "components/$variant.log" 2>&1
    timeout --kill-after=5s 60s docker run --pull=never --rm --network none --no-healthcheck \
        --name "$namespace-$variant-package-check" --user "$(id -u):$(id -g)" "$(cat "components/$variant.iid")" \
        node -e 'const fs=require("node:fs"); fs.accessSync("node_modules/redbox-hook-wsu/support/v6/app.cjs",fs.constants.R_OK); require("redbox-hook-wsu/deployment");'
    docker image inspect --platform linux/arm64 "$base" > "components/$variant-base.json"
    docker image inspect --platform linux/arm64 "$deployment" > "components/$variant.json"
    python3 - "components/$variant-base.json" "components/$variant.json" <<'PY'
import json
import sys
base, installed = [json.load(open(path))[0] for path in sys.argv[1:]]
base_layers = base['RootFS']['Layers']
assert installed['RootFS']['Layers'][:len(base_layers)] == base_layers
assert installed['Config']['Healthcheck'] == base['Config']['Healthcheck']
PY
done
sha256sum components/*.tgz express-hook-pack/wsu-effective-package-lock.json express.cjs fastify.cjs > components/SHA256SUMS
