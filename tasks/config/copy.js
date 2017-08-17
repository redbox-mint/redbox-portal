/**
 * `copy`
 *
 * ---------------------------------------------------------------
 *
 * Copy files and/or folders from your `assets/` directory into
 * the web root (`.tmp/public`) so they can be served via HTTP,
 * and also for further pre-processing by other Grunt tasks.
 *
 * #### Normal usage (`sails lift`)
 * Copies all directories and files (except CoffeeScript and LESS)
 * from the `assets/` folder into the web root -- conventionally a
 * hidden directory located `.tmp/public`.
 *
 * #### Via the `build` tasklist (`sails www`)
 * Copies all directories and files from the .tmp/public directory into a www directory.
 *
 * For usage docs see:
 *   https://github.com/gruntjs/grunt-contrib-copy
 *
 */
module.exports = function(grunt) {

  // Retrieve dynamic asset configuration for node_modules
  var dynAssetConfig = require('../../config/dynamicasset');
  var copyFilesConfig = [
    {
      expand: true,
      cwd: './assets',
      src: ['**/*.!(coffee|less)'],
      dest: '.tmp/public'
    }
  ];
  dynAssetConfig.dynamicasset.node_modules.copy.forEach(function(moduleName){
    copyFilesConfig.push({
        expand: true,
        cwd: './node_modules/' + moduleName,
        src: '**/*',
        dest: '.tmp/public/node_modules/' + moduleName
      });
  });
  grunt.config.set('copy', {
    dev: {
      files: copyFilesConfig
    },
    build: {
      files: [{
        expand: true,
        cwd: '.tmp/public',
        src: ['**/*'],
        dest: 'www'
      }]
    }
  });

  grunt.loadNpmTasks('grunt-contrib-copy');
};
