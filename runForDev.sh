#!/bin/bash
# Uncomment below if you need to see the minified version....
# export buildTarget="PROD"
PORTAL_DIR=/opt/redbox-portal
PORTAL_IMAGE=qcifengineering/redbox-portal:latest
source dev_build/buildFns.sh
sudo chown -R vagrant:vagrant *
watch="false"
# Not really needed but I'm putting this in a for loop in case we want to add more arguments later
for var in "$@"
do
    if [ $var = "install" ]; then
        docker run -it --rm -v $PWD:$PORTAL_DIR $PORTAL_IMAGE /bin/bash -c "cd $PORTAL_DIR; npm install -g yarn; yarn add sails-hook-autoreload && yarn global add typings && yarn install"
    fi
    if [ $var = "jit" ]; then
      linkNodeLib "lodash" "lodash-lib"
      # Build targets are different for assets/angular, clearing all .js files from .ts files
      cleanUpAllJs
      export ENV=development
      docker run -it --rm -v $PWD:$PORTAL_DIR $PORTAL_IMAGE /bin/bash -c "cd $PORTAL_DIR; npm install -g @angular/cli@1.7.1; npm install -g yarn; yarn install --only=dev; node_modules/.bin/tsc --project tsconfig.json; cd angular; yarn; make build-frontend"
    fi
    if [ $var = "jit-skip-frontend" ]; then
      linkNodeLib "lodash" "lodash-lib"
      export ENV=development
      docker run -it --rm -v $PWD:$PORTAL_DIR $PORTAL_IMAGE /bin/bash -c "cd $PORTAL_DIR; npm install -g @angular/cli@1.7.1; npm install -g yarn; yarn install --only=dev; node_modules/.bin/tsc --project tsconfig.json;"
    fi
    if [ $var == "aot" ]; then
      docker run -it --rm -v $PWD:$PORTAL_DIR $PORTAL_IMAGE /bin/bash -c "cd $PORTAL_DIR; export buildTarget=\"${buildTarget}\"; ./runForDev.sh aotCompile"
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
    if [[ $var == watch=* ]]; then
      ng2App=$(cut -d "=" -f 2 <<< "$var")
      watch="true"

    fi
done

if [ $watch == "true" ]; then
    echo "Running watch"
    nohup docker-compose up &
    sleep 15
    RBPORTAL_PS=$(docker ps -f name=redbox-portal_redboxportal_1 -q)
    docker exec -it $RBPORTAL_PS /bin/bash -c "cd /opt/redbox-portal/angular; npm install -g @angular/cli; yarn; ng build --app=${ng2App} --watch"
else
    echo "No watch"
    docker-compose up
fi
