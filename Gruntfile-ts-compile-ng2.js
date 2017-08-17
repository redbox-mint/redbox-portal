module.exports = function(grunt) {
  grunt.initConfig({
    ts: {
      options: {
        failOnTypeErrors: false
      },
      default : {
        tsconfig: {
          tsconfig: 'tsconfig-ng2.json'
        }
      }
    }
  });
  grunt.loadNpmTasks("grunt-ts");
  grunt.registerTask("default", ["ts"]);
};
