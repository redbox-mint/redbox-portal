#!/bin/bash

function removeJs() {
  echo "Cleaning up JS files in... ${1}"
  for tsFile in $(find $1 -name '*.ts' -print0 | xargs -0)
  do
    basename=${tsFile%.*}
    dirname=$(dirname "$tsFile")
    jsfile="${dirname}/${basename}.js"
    echo "Removing $jsfile"
    rm -rf "$jsfile"
  done
}

function cleanUpAllJs() {
  jsDirs=( "assets/angular" "typescript" "api" )
  for dir in "${jsDirs[@]}"
  do
    removeJs $dir
  done
}

# Expects a source and target
function linkNodeLib() {
  source=$1
  target=$2
  current_user=`whoami`

  sudo chown -R $current_user:$current_user "node_modules"
  cd "node_modules"
  sourcedir="${source}"
  targetdir="${target}"
  if [ -e "$targetdir" ]; then
    rm -rf $targetdir
  fi
  echo "Linked $sourcedir <-- $targetdir"
  ln -s $sourcedir $targetdir
  cd -
}

function bundleNg2App() {
  ng2dir="assets/angular"
  echo "Bundling ${ng2dir}/${ng2app}...using build target: ${buildTarget}"
  cd "${ng2dir}/${ng2app}"
  if [ -e "rollup-config.js" ]; then
    ../../../node_modules/.bin/rollup -c rollup-config.js
    if [ "${buildTarget}" == "PROD" ]; then
      ../../../node_modules/.bin/uglifyjs -c -o dist-bundle-min.js -- dist-bundle.js
      mv dist-bundle-min.js dist-bundle.js
    fi
  else
    echo "Missing Rollup config for app: ${ng2app}?"
  fi
  cd -
}

function compileAoT() {
  echo "Running AoT compile..."
  node_modules/.bin/ngc -p tsconfig-aot.json
  node_modules/.bin/grunt --gruntfile Gruntfile-ts-compile-sails.js
  node_modules/.bin/grunt --gruntfile Gruntfile-ts-compile-ng2.js
  ng2apps=( `find assets/angular -maxdepth 1 -mindepth 1 -type d -printf '%f '` )
  for ng2app in "${ng2apps[@]}"
  do
    if [ "$ng2app" != "shared" ]; then
      bundleNg2App $ng2app
    fi
  done
}

function convertApiSpec() {
  echo "Running AoT compile..."
  node_modules/.bin/api-spec-converter views/default/default/apidocsapib.ejs --from=api_blueprint --to=swagger_2 --syntax=yaml > views/default/default/apidocsswaggeryaml.ejs
  node_modules/.bin/api-spec-converter views/default/default/apidocsapib.ejs --from=api_blueprint --to=swagger_2 --syntax=json > views/default/default/apidocsswaggerjson.ejs
}
