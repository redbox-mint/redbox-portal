#! /bin/bash
docker login -u $DOCKER_USER -p $DOCKER_PASS
export REPO=qcifengineering/redbox-portal
if [ ! -z "$CIRCLE_BRANCH" ]; then
        export TAG="$CIRCLE_BRANCH";
fi;

if [ -z "$CIRCLE_BRANCH" ]; then
        export TAG="$CIRCLE_TAG";
fi;
# Clean up docker tag, replaces '/' with '-'
if [ ! -z "$TAG" ]; then
  export TAG=${TAG//\//-}
fi
docker build -f Dockerfile -t $REPO:$CIRCLE_SHA1 .
docker tag $REPO:$CIRCLE_SHA1 $REPO:$TAG
docker tag $REPO:$CIRCLE_SHA1 $REPO:circleci-$CIRCLE_BUILD_NUM
docker push $REPO:$TAG
docker push $REPO:$CIRCLE_SHA1
docker push $REPO:circleci-$CIRCLE_BUILD_NUM

