var _ = require ('lodash');
var fs = require('fs');

var baseFile = process.argv[2];
var overrideFile = process.argv[3];
var destFile = process.argv[4];
if (_.isUndefined(baseFile) || _.isUndefined(overrideFile) || _.isUndefined(destFile)) {
  console.error("Please specify 3 arguments: 'base JSON file path' 'override JSON file path' 'destination JSON file path'");
  return;
}
console.log("Merging JSON files... ");
console.log("Base file: " + baseFile);
console.log("Override file: " + overrideFile);
console.log("Destination file: " + destFile);
var baseJson =  JSON.parse(fs.readFileSync(baseFile, 'utf-8'));
var overrideJson = JSON.parse(fs.readFileSync(overrideFile, 'utf-8'));
var merged  = {};
_.assign(merged, baseJson, overrideJson);
fs.writeFileSync(destFile, JSON.stringify(merged, null, 2));
console.log("Merge complete.");
