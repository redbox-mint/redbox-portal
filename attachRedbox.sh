#! /bin/sh
#Attach a shell to redbox
RBP_PS=$(docker ps -f name=redbox-portal_redbox_1 -q)
docker exec -it $RBP_PS /bin/bash -c 'cd /opt/redbox; exec "${SHELL:-sh}"'
