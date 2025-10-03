#! /bin/sh
npm ci --ignore-scripts --no-audit --no-fund

node_modules/.bin/ejs-cli ../../../views/default/default/apidocsapib.ejs -O '{"portal":"rdmp","branding":"default", "baseUrl": "https://demo.redboxresearchdata.com.au"}' > apidocs.apib 
node_modules/.bin/apib2swagger -i apidocs.apib --yaml --open-api-3 --bearer-apikey > ../../../views/default/default/apidocsswaggeryaml.ejs
node_modules/.bin/apib2swagger -i apidocs.apib --open-api-3 --bearer-apikey > ../../../views/default/default/apidocsswaggerjson.ejs
sed -i 's#/default/rdmp#/\<%= branding %>/\<%= portal %>#g' ../../../views/default/default/apidocsswaggeryaml.ejs
sed -i 's#https://demo.redboxresearchdata.com.au#<%= baseUrl %>#g' ../../../views/default/default/apidocsswaggeryaml.ejs
sed -i 's#/default/rdmp#/\<%= branding %>/\<%= portal %>#g' ../../../views/default/default/apidocsswaggerjson.ejs
sed -i 's#https://demo.redboxresearchdata.com.au#<%= baseUrl %>#g' ../../../views/default/default/apidocsswaggerjson.ejs
rm apidocs.apib
rm -Rf node_modules