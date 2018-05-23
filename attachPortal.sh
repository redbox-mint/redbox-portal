#! /bin/sh
#Attach a shell to redbox-portal
RBP_PS=$(docker ps -f name=redbox-portal_redboxportal_1 -q)
docker exec -it $RBP_PS /bin/bash -c 'cd /opt/redbox-portal; exec "${SHELL:-sh}"'
