module.exports = function (config) {
  const isCI = process.env.CI === 'true';

  config.set({
    basePath: './',
    files: [
      {
        pattern: require('path').resolve(__dirname, '../../../../test/resources/fonts/*.woff2'),
        included: false,
        served: true,
        watched: false,
      },
    ],
    proxies: {
      '/branding-font-fixtures/':
        '/absolute' + require('path').resolve(__dirname, '../../../../test/resources/fonts') + '/',
    },
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-junit-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: { __REDBOX_CI_MODE__: process.env.CI === 'true', jasmine: {}, clearContext: false },
    jasmineHtmlReporter: { suppressAll: true },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage/'),
      subdir: '.',
      reporters: [{ type: 'html' }, { type: 'text-summary' }, { type: 'json' }],
    },
    junitReporter: { outputDir: require('path').join(__dirname, '../../../../.tmp/junit/frontend-branding') },
    reporters: ['progress', 'kjhtml', 'junit'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    browserNoActivityTimeout: 120000,
    browserDisconnectTimeout: 10000,
    browserDisconnectTolerance: 2,
    captureTimeout: 120000,
    autoWatch: true,
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: [
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
        ],
      },
    },
    browsers: isCI ? ['ChromeHeadlessNoSandbox'] : ['Chrome'],
    singleRun: isCI,
    restartOnFileChange: !isCI,
  });
};
