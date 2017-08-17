module.exports = function(grunt) {
  grunt.initConfig({
    ts: {
      options: {
        failOnTypeErrors: false
      },
      default : {
        tsconfig:'tsconfig-sails.json'
      }
    }
  });
  grunt.loadNpmTasks("grunt-ts");
  grunt.registerTask("default", ["ts"]);
};
