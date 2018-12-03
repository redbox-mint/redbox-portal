#! /bin/sh
# Runs integration tests and outputs a file if any fail as Travis can't detect exit code status automatically
# due to the tests being executed inside a docker container.
cd /opt/redbox-portal
npm i nyc -g
nyc npm run api-test
if [ $? -eq 0 ]
then
  echo "The API Tests passed"
else
  echo "The API Tests failed" >&2
  echo "failed" > /opt/redbox-portal/failedTests
  exit 1
fi
npm run test
if [ $? -eq 0 ]
then
  echo "Mocha Tests passed"
else
  echo "Mocha Tests failed" >&2
  echo "failed" > /opt/redbox-portal/failedTests
  exit 1
fi
