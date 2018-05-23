#!/bin/bash
export buildTarget="PROD"
source dev_build/buildFns.sh
cleanUpAllJs
npm install -g yarn
yarn cache clean
yarn install
cd angular
yarn install
cd -
#linkNodeLib "lodash-es" "lodash-lib"
#echo "declare module 'lodash-lib';" > "node_modules/lodash-es/index.d.ts"
compileAoT
convertApiSpec
