// [your-sails-app]/config/autoreload.js
module.exports.autoreload = {
  active: false,
  usePolling: false,
  dirs: [
    "api/models",
    "api/controllers",
    "api/services",
    "config/locales"
  ],
  ignored: [
    // Ignore all files with .ts extension
    "**.ts"
  ]
};
