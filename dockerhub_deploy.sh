#! /bin/bash
docker login -u $DOCKER_USER -p $DOCKER_PASS
export REPO=qcifengineering/redbox-portal
if [ ! -z "$CIRCLE_BRANCH" ]; then
        export TAG="$CIRCLE_BRANCH";
fi;

if [ -z "$CIRCLE_BRANCH" ]; then
        export TAG="$CIRCLE_TAG";
fi;
export DEPLOY_TAG=${TAG/\//-}
docker build -f Dockerfile -t $REPO:$CIRCLE_SHA1 --platform=linux/386,linux/arm64 .
docker tag $REPO:$CIRCLE_SHA1 $REPO:$DEPLOY_TAG
docker tag $REPO:$CIRCLE_SHA1 $REPO:circleci-$CIRCLE_BUILD_NUM
docker push $REPO:$DEPLOY_TAG
docker push $REPO:$CIRCLE_SHA1
docker push $REPO:circleci-$CIRCLE_BUILD_NUM

