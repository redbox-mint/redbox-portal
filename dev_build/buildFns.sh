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
  ng2apps=( "localAuth" "dmp" "manageRoles" "dashboard" "export" )
  for ng2app in "${ng2apps[@]}"
  do
    bundleNg2App $ng2app
  done
}
