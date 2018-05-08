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
  ng2dir="angular"
  echo "Bundling ${ng2dir}/${ng2app}...using build target: ${buildTarget}"
  cd "${ng2dir}"
  ng build --app=${ng2app}
  cd -
}

function compileAoT() {
  echo "Running AoT compile..."
  node_modules/.bin/tsc --project tsconfig.json
  # Insert commands here for creating
}

function convertApiSpec() {
  echo "Running AoT compile..."
  npm install -g api-spec-converter
  api-spec-converter views/default/default/apidocsapib.ejs --from=api_blueprint --to=swagger_2 --syntax=yaml > views/default/default/apidocsswaggeryaml.ejs
  api-spec-converter views/default/default/apidocsapib.ejs --from=api_blueprint --to=swagger_2 --syntax=json > views/default/default/apidocsswaggerjson.ejs
}
