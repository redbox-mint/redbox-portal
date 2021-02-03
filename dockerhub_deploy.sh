#! /bin/bash
docker login -u $DOCKER_USER -p $DOCKER_PASS
export REPO=qcifengineering/redbox-portal
export TAG=`if [ "$CIRCLE_BRANCH" == "master" ] && [ -z "$1" ]; then echo "latest"; else echo $CIRCLE_BRANCH; fi`
if [ -z $TAG ];
  export TAG=`echo $CIRCLE_TAG`
fi
#if parameter is passed to script, add parameter to tag. Used to produce bcryptjs versions of the app
export TAG=`if [ "$1" != "" ]; then echo "$TAG-$1"; else echo $TAG; fi`
docker build -f Dockerfile -t $REPO:$CIRCLE_SHA1 .
docker tag $REPO:$CIRCLE_SHA1 $REPO:$TAG
docker tag $REPO:$CIRCLE_SHA1 $REPO:circleci-$CIRCLE_BUILD_NUM
docker push $REPO
