#!/bin/sh

setup_git() {
  git config --global user.email "travis@travis-ci.org"
  git config --global user.name "Travis CI"
}

commit_website_files() {
  git checkout -b dev_build
  git rm -r --cached .
  rm -f .gitignore
  rm -f .travis.yml
  rm -Rf node_modules/puppeteer
  git add .
  git commit --message "Travis build: $TRAVIS_BUILD_NUMBER"
}

upload_files() {
  git remote add build-origin "https://andrewbrazzatti:$GH_TOKEN@github.com/redbox-mint/redbox-portal"
  git push build-origin dev_build --force
}

setup_git
commit_website_files
upload_files
