module.exports = function(grunt) {

  grunt.config.set('shell', {
    restart: {
      command: 'pkill -SIGINT node'
    }
  });

  grunt.loadNpmTasks('grunt-shell');
};
