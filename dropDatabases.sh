#! /bin/sh
# Author: <a href='https://github.com/moisbo' target='_blank'>Moises Sacal Bonequi</a>

confirm() {
  # call with a prompt string or use a default
  read -r -p "${1:-Are you sure? This will delete all redbox data [y/N]} " response
  case "$response" in
    [yY][eE][sS]|[yY])
    true
    ;;
    *)
    false
    ;;
  esac
}

deleteDBs() {
  MONGO_PS=$(docker ps -f name=redbox-portal_mongodb_1 -q)
  RBP_PS=$(docker ps -f name=redbox-portal_redboxportal_1 -q)
  RB_PS=$(docker ps -f name=redbox-portal_redbox_1 -q)
  docker stop  $RBP_PS
  docker stop  $RB_PS

  docker exec -it $MONGO_PS /bin/sh -c "mongo 'redbox' --eval 'db.dropDatabase();'"
  docker exec -it $MONGO_PS /bin/sh -c "mongo 'redbox-portal' --eval 'db.dropDatabase();'"

  docker start  $RB_PS
  docker start  $RBP_PS
}

if confirm; then
  deleteDBs
fi
