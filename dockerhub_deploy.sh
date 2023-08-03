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
docker run --privileged --rm tonistiigi/binfmt --install arm64
docker buildx create --name multibuilder --driver docker-container --bootstrap --use
docker buildx inspect
docker buildx build -f Dockerfile -t $REPO:$DEPLOY_TAG  --platform linux/amd64,linux/arm64 .
docker tag $REPO:$DEPLOY_TAG $REPO:$CIRCLE_SHA1
docker tag $REPO:$CIRCLE_SHA1 $REPO:circleci-$CIRCLE_BUILD_NUM
docker push $REPO:$DEPLOY_TAG
docker push $REPO:$CIRCLE_SHA1
docker push $REPO:circleci-$CIRCLE_BUILD_NUM

