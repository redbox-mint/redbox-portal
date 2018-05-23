#!/bin/sh

setup_git() {
  git config --global user.email "travis@travis-ci.org"
  git config --global user.name "Travis CI"
}

commit_website_files() {
  git checkout -b dev_build
  git add .
  git commit --message "Travis build: $TRAVIS_BUILD_NUMBER"
}

upload_files() {
  git remote add origin-pages https://${GH_TOKEN}@github.com/redbox-mint/redbox-portal.git > /dev/null 2>&1
  git push --quiet -u origin dev_build
}

setup_git
commit_website_files
upload_files
