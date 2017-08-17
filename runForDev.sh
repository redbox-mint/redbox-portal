#!/bin/bash
# Uncomment below if you need to see the minified version....
# export buildTarget="PROD"
source dev_build/buildFns.sh
sudo chown -R vagrant:vagrant *
# Not really needed but I'm putting this in a for loop in case we want to add more arguments later
for var in "$@"
do
    if [ $var = "install" ]; then
        docker run -it --rm -v $PWD:/opt/rds-rdmp-portal qcifengineering/dlcf-portal:latest /bin/bash -c "cd /opt/rds-rdmp-portal && npm install sails-hook-autoreload && npm install -g typings && npm install"
    fi
    if [ $var = "jit" ]; then
      linkNodeLib "lodash" "lodash-lib"
      # Build targets are different for assets/angular, clearing all .js files from .ts files
      cleanUpAllJs
      export ENV=development
      docker run -it --rm -v $PWD:/opt/rds-rdmp-portal qcifengineering/dlcf-portal:latest /bin/bash -c "cd /opt/rds-rdmp-portal; npm install --only=dev; node_modules/.bin/grunt --gruntfile Gruntfile-ts-compile-all-cjs.js"
    fi
    if [ $var == "aot" ]; then
      docker run -it --rm -v $PWD:/opt/rds-rdmp-portal qcifengineering/dlcf-portal:latest /bin/bash -c "cd /opt/rds-rdmp-portal; export buildTarget=\"${buildTarget}\"; ./runForDev.sh aotCompile"
      export ENV=development
      export FORCE_BUNDLE=1
    fi
    if [ $var == "aotCompile" ]; then
      cleanUpAllJs
      linkNodeLib "lodash-es" "lodash-lib"
      echo "declare module 'lodash-lib';" > "node_modules/lodash-es/index.d.ts"
      compileAoT
      exit 0
    fi
done

docker-compose up
