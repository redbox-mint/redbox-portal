#! /bin/bash
docker login -u $DOCKER_USER -p $DOCKER_PASS
export REPO=qcifengineering/redbox-portal
export TAG=`if [ "$CIRCLE_BRANCH" == "master" ]; then echo "latest"; else echo $CIRCLE_BRANCH; fi`
docker build -f Dockerfile -t $REPO:$CIRCLE_SHA1 .
docker tag $REPO:$CIRCLE_SHA1 $REPO:$TAG
docker tag $REPO:$CIRCLE_SHA1 $REPO:circleci-$CIRCLE_BUILD_NUM
docker push $REPO
