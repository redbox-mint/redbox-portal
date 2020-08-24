#! /bin/sh
mkdir bundletmp
cp -Rf api bundletmp
cp -Rf assets bundletmp
cp -Rf config bundletmp
cp -Rf form-config bundletmp 
cp -Rf node_modules bundletmp 
cp -Rf views bundletmp
cp package*.json bundletmp
cp pm2.json bundletmp
cp *.js bundletmp
cd bundletemp
tar cvfz redbox-portal-1.1.1.tgz .
