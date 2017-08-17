#! /bin/sh
MONGO_PS=$(docker ps -f name=rdsrdmpportal_mongodb_1 -q)

gridPrefix=gridfs/
mongoPrefix=mongo/
docker exec -it $MONGO_PS /bin/sh -c "mongo 'rds-dlcf-portal' --eval 'db.dropDatabase()'"

#Process GridFS resources.
for D in $(find gridfs -mindepth 1 -maxdepth 1 -type d) ; do
    echo "Loading data for $D"
    cleanDir=${D#$gridPrefix}
    cd gridfs/$cleanDir;
    for file in *
    do
      docker exec -it $MONGO_PS /bin/sh -c "cd devdata/gridfs/$cleanDir; /usr/bin/mongofiles -d 'rds-dlcf-portal' put -l $file $cleanDir/$file"
    done
    cd -;
done

#Process GridFS resources.
for D in $(find mongo -mindepth 1 -maxdepth 1 -type d) ; do
    echo "Loading data for $D"
    cleanDir=${D#$mongoPrefix}
    cd mongo/$cleanDir;
    for file in *
    do
      docker exec -it $MONGO_PS /bin/sh -c "cd devdata/mongo/$cleanDir; /usr/bin/mongoimport -d 'rds-dlcf-portal' --collection $cleanDir --file $file"
    done
    cd -;
done
