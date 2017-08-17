#!/bin/bash
export buildTarget="PROD"
source dev_build/buildFns.sh
cleanUpAllJs
npm install
linkNodeLib "lodash-es" "lodash-lib"
compileAoT
