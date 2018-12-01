#! /bin/bash
docker-compose -f docker-compose.travis.yml up --abort-on-container-exit;

if [ -f failedTests ]; then
  echo "Detected failed tests"
  exit 1;
fi
