#!/bin/bash
export buildTarget="PROD"
source dev_build/buildFns.sh
sudo chown -R vagrant:vagrant *
cleanUpAllJs
docker run -it --rm -v $PWD:/opt/rds-rdmp-portal qcifengineering/dlcf-portal:latest /bin/bash -c "cd /opt/rds-rdmp-portal; npm install;"
linkNodeLib "lodash-es" "lodash-lib"
echo "declare module 'lodash-lib';" > "node_modules/lodash-es/index.d.ts"
compileAoT
export ENV=production
docker-compose up
