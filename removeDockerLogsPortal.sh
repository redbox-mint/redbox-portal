#! /bin/bash

INSTANCE_ID=redbox-portal_redboxportal_1
LOGPATH=$(docker inspect --format='{{.LogPath}}' $INSTANCE_ID)
RBP_PS=$(docker ps -f name=$INSTANCE_ID -q)

docker stop $RBP_PS
sudo sh -c "cat /dev/null > $LOGPATH"
docker start $RBP_PS
