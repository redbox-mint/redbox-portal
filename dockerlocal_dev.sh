#!/bin/bash
# Simple docker build for local development
REPO=qcifengineering/redbox-portal
TAG=latest

docker build -f Dockerfile -t $REPO:$TAG .