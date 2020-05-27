#!/bin/bash
export buildTarget="PROD"
set -e
source dev_build/buildFns.sh
cleanUpAllJs

npm install
cd angular
npm install
cd -
compileAoT
convertApiSpec
