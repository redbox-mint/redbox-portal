var fs = require('fs')
const crypto = require("crypto");

var path = "/opt/redbox-portal";
var environment = "development";
var apiKey = "/opt/redbox-portal";
var url = "http://localhost";
var redboxLocation = "/opt/redbox";

var asked = [];
process.stdin.resume();
process.stdin.setEncoding('utf8');
console.log("What is the directory path of the application? Default:" + path);
asked.push("path");
process.stdin.on('data', function(text) {
      if (asked.length == 5) {
        redboxLocation = text.trim() == '' ? redboxLocation : text.trim();

        fs.readFile('support/ecosystem.template', 'utf8', function(err, data) {
            console.log("Generating ecosystem.json for PM2 service");
            if (err) {
              return console.log(err);
            }

            var result = data.replace(/#APIKEY#/g, apiKey);
            var result = result.replace(/#ENVIRONMENT#/g, environment);
            var result = result.replace(/#URL#/g, url);
            var result = result.replace(/#PATH#/g, path);

            fs.writeFile('ecoystem.json', result, 'utf8', function(err) {
              if (err) return console.log(err);
              fs.readFile('support/redboxApiKeys.template', 'utf8', function(err, data) {
                var result = data.replace(/#APIKEY#/g, apiKey);

                console.log("Generating apiKeys.json for the ReDBox Storage Service");
                if (err) return console.log(err);

                fs.writeFile(`${redboxLocation}/data/security/apiKeys.json`, result, 'utf8', function(err) {
                  if (err) return console.log(err);
                  console.log("Configuration generation complete");
                  process.exit();
                });
              });
            });


          });
        }
          if (asked.length == 4) {
            url = text.trim() == '' ? url : text.trim();
            console.log("What is the path of the ReDBox Storage service will be access from? Default: " + redboxLocation);
            asked.push("environment");
          }

          if (asked.length == 3) {
            apiKey = text.trim() == '' ? crypto.randomBytes(16).toString("hex") : text.trim();
            console.log("What is the url the application will be access from? Default: " + url);
            asked.push("environment");
          }
          if (asked.length == 2) {
            environment = text.trim() == '' ? environment : text.trim();
            console.log("What is the API KEY you'd like to use? Press enter to auto-generate one");
            asked.push("environment");
          }
          if (asked.length == 1) {
            path = text.trim() == '' ? path : text.trim();
            console.log("What is the environment you'd like to use? Default: " + environment);
            asked.push("environment");
          }








        });
