#!/bin/bash
ng2app=$1
source dev_build/buildFns.sh
removeJs "assets/angular/${ng2app}"
node_modules/.bin/ngc -p tsconfig-aot.json
node_modules/.bin/grunt --gruntfile Gruntfile-ts-compile-ng2.js
bundleNg2App $ng2app
