#! /bin/sh
#Attach a shell to nginx 
NGINX_PS=$(docker ps -f name=redbox-portal_nginx_1 -q)
docker exec -it $NGINX_PS /bin/bash -c 'exec "${SHELL:-sh}"'
