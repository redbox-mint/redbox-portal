#! /bin/sh
MONGO_PS=$(docker ps -f name=redbox-portal_mongodb_1 -q)
docker exec -it $MONGO_PS /bin/sh -c "mongo 'redbox-portal' --eval 'db.recordtype.drop(); db.workflowstep.drop(); db.form.drop();'"

RBP_PS=$(docker ps -f name=redbox-portal_redboxportal_1 -q)
docker stop  $RBP_PS
docker start  $RBP_PS
