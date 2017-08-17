module.exports = {
  displayValue: function (value, req, defaultValue="") {
    keyArray = value.split('.');
    var returnValue = defaultValue;
    for(var i = 0; i< keyArray.length;i++) {
        returnValue = req.options.locals[keyArray[i]];
        if(returnValue == null) {
          return defaultValue;
        }
    }
    return returnValue;
  },
  resolvePartialPath: function(value,branding,portal,templatePath) {

    var partialLocation = value;
    var viewsDir = sails.config.appPath+"/views";
    masterTemplateLocation = templatePath.substring(viewsDir.length,templatePath.length);
    var splitUrl = masterTemplateLocation.split('/');
    console.log(masterTemplateLocation);
    console.log(viewsDir);
    console.log(templatePath);
    if (splitUrl.length > 2) {


      var pathExists = require("path-exists");
      var locationToTest = sails.config.appPath + "/views/" + branding + "/" + portal + "/" + value;
      console.log("testing :" + locationToTest);
      if (pathExists.sync(locationToTest)) {
        partialLocation = branding + "/" + portal + "/" + value;
      }

      if(partialLocation == value){
        var locationToTest = sails.config.appPath + "/views/default/" + portal + "/" + value;
        console.log("testing :" + locationToTest);
        if (pathExists.sync(locationToTest)) {
          partialLocation = "default/" + portal + "/" + value;
        }
      }

      if(partialLocation == value){
        var locationToTest = sails.config.appPath + "/views/default/default/" + value;
        console.log("testing :" + locationToTest);
        if (pathExists.sync(locationToTest)) {
          partialLocation = "default/default/" + value;
        }
      }

      if(partialLocation != value){
        var numberOfLevels = splitUrl.length - 2;
        for(var i=0; i<numberOfLevels; i++) {
          partialLocation = "../"+partialLocation;
        }
      }
      return partialLocation;
    }
  }
}
