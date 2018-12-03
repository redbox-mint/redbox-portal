/**
 * `uglify`
 *
 * ---------------------------------------------------------------
 *
 * Minify client-side CSS files using CSSMin.
 *
 * For usage docs see:
 *   https://github.com/gruntjs/grunt-contrib-cssmin
 *
 */
module.exports = function(grunt) {

  // grunt.config.set('cssmin', {
  //   options: {
  //     mergeIntoShorthands: false,
  //     roundingPrecision: -1
  //   },
  //   target: {
  //     files: {
  //       '.tmp/public/default/default/styles/style.min.css': ['.tmp/public/default/default/styles/*.css']
  //     }
  //   }
  // });
  grunt.config.set('cssmin', {
    dev: {
           options: {
               report: "min"
           },
           src: [".tmp/public/default/default/styles/*.css"],
           dest: ".tmp/public/default/default/styles/style.min.css",
       }
  });

  grunt.loadNpmTasks('grunt-contrib-cssmin');
};
