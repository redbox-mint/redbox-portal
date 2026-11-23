FROM builder AS wsu_compiler
COPY --from=wsu_source / /opt/redbox-hook-wsu
WORKDIR /opt/redbox-hook-wsu
RUN cp package.json /tmp/wsu-original-package.json \
 && node -e 'const fs=require("fs"),p=require("./package.json");p.devDependencies["@researchdatabox/redbox-core"]="file:/opt/redbox-portal/packages/redbox-core";p.devDependencies["@researchdatabox/redbox-dev-tools"]="file:/opt/redbox-portal/packages/redbox-dev-tools";fs.writeFileSync("package.json",JSON.stringify(p));' \
 && npm install --include=dev --ignore-scripts --strict-peer-deps --no-audit \
 && npm run compile \
 && cp package-lock.json /tmp/wsu-effective-package-lock.json \
 && cp /tmp/wsu-original-package.json package.json \
 && npm pack --ignore-scripts --pack-destination /tmp

FROM scratch AS wsu_pack
COPY --from=wsu_compiler /tmp/redbox-hook-wsu-2.0.0-v6.0.tgz /
COPY --from=wsu_compiler /tmp/wsu-effective-package-lock.json /
