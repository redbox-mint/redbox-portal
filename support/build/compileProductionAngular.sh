#! /bin/bash
set -e
function buildAngularApp() {
    (cd angular && node_modules/.bin/ng b @researchdatabox/${1} --configuration production)
}

if [ $# -ne 0 ]
  then
    echo "Bundling ${1}"
    buildAngularApp "$1"
else 
  ng2apps=( redbox-portal-core localAuth )
  for ng2app in "${ng2apps[@]}"
  do
    if [ "$ng2app" != "shared" ]; then
      if [ "$ng2app" != "e2e" ]; then
        if [ "$ng2app" != "node_modules" ]; then
          echo "Bundling ${ng2app}"
          buildAngularApp "${ng2app}"
        fi
      fi
    fi
  done
fi



