/**
 * `syncApiFiles`
 *
 *
 */
module.exports = function(grunt) {
  grunt.registerTask('syncApiFiles', [
    'copy:api',
    'shell:restart'
  ]);
};
