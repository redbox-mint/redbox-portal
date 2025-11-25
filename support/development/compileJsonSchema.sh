#! /bin/bash

set -euxo pipefail

cd packages/sails-ng-common
npm install --ignore-scripts --strict-peer-deps
./node_modules/.bin/ts-json-schema-generator \
  --path 'src/**/*.ts' \
  --type 'FormConfig' \
  --out '../../angular/dist/form-config-schema.json'
cd -

cd ../portal-ng-form-custom/projects/researchdatabox/portal-ng-form-custom
npm install --ignore-scripts --strict-peer-deps
../../../../redbox-portal/packages/sails-ng-common/node_modules/.bin/ts-json-schema-generator \
  --path 'src/**/*.ts' \
  --type 'CustomFormConfig' \
  --tsconfig 'tsconfig.lib.prod.json' \
  --out '../../../../redbox-portal/angular/dist/custom-form-config-schema.json'
cd -

find . -type f -name '*-config-schema.json'
