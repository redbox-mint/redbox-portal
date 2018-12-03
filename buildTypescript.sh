#!/bin/bash
export buildTarget="PROD"
set -e
source dev_build/buildFns.sh
cleanUpAllJs
npm install -g yarn
yarn cache clean
yarn install
cd angular
yarn install
cd -
compileAoT
convertApiSpec
