#! /bin/bash


if [ -f failedTests ]; then
  echo "Detected failed tests"
  exit 1;
fi
