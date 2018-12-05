/**
 * `less`
 *
 * ---------------------------------------------------------------
 *
 * Compile your LESS files into a CSS stylesheet.
 *
 * By default, only the `assets/styles/importer.less` is compiled.
 * This allows you to control the ordering yourself, i.e. import your
 * dependencies, mixins, variables, resets, etc. before other stylesheets)
 *
 * For usage docs see:
 *   https://github.com/gruntjs/grunt-contrib-less
 *
 */
 const sass = require('node-sass');
 
module.exports = function(grunt) {

  grunt.config.set('sass', {
    options: {
      implementation: sass,
    },
    dev: {
      files: [{
        expand: true,
        cwd: 'assets/styles/',
        src: ['style.scss',],
        dest: '.tmp/public/default/default/styles',
        ext: '.css'
      }]
    }
  });

  grunt.loadNpmTasks('grunt-sass');
};
