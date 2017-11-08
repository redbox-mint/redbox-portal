#!/bin/bash
export buildTarget="PROD"
source dev_build/buildFns.sh
cleanUpAllJs
npm install -g yarn
yarn
linkNodeLib "lodash-es" "lodash-lib"
echo "declare module 'lodash-lib';" > "node_modules/lodash-es/index.d.ts"
compileAoT
