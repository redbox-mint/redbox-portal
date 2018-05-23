#! /bin/sh

RB_APP=redbox-portal_redbox_1

RBP_PS=$(docker ps -f name=$RB_APP -q)
docker stop $RBP_PS
docker start $RBP_PS
