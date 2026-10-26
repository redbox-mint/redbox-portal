module.exports = function (config) {
  const isCI = process.env.CI === 'true';
  const traceCompletion = process.env.REDBOX_FORM_COMPLETION_TRACE === 'true';

  config.set({
    basePath: './',
    files: traceCompletion
      ? [{ pattern: require('path').resolve(__dirname, '../../../../support/unit-testing/angular/form-completion-probe.js'), watched: false }]
      : [],
    frameworks: ['jasmine', '@angular-devkit/build-angular', ...(traceCompletion ? ['form-completion-server-trace'] : [])],
    plugins: [
      ...(traceCompletion ? [require('../../../../support/unit-testing/angular/form-completion-server-trace.cjs')] : []),
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-junit-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma')
    ],
    client: {
      // Set CI mode for reduced logging verbosity
      __REDBOX_CI_MODE__: process.env.CI === 'true',
      jasmine: {
        // you can add configuration options for Jasmine here
        // the possible options are listed at https://jasmine.github.io/api/edge/Configuration.html
        // for example, you can disable the random execution with `random: false`
        // or set a specific seed with `seed: 4321`
        // Keep CI ordering deterministic so leaked browser activity cannot make the suite
        // intermittently stall after all specs have reported success.
        random: !isCI,
      },
      clearContext: false // leave Jasmine Spec Runner output visible in browser
    },
    jasmineHtmlReporter: {
      suppressAll: true // removes the duplicated traces
    },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage/'),
      subdir: '.',
      reporters: [
        { type: 'html' },
        { type: 'text-summary' },
        { type: 'json' }
      ]
    },
    junitReporter: {
      outputDir: require('path').join(__dirname, '../../../../.tmp/junit/frontend-form')
    },
    // The interactive HTML reporter runs before Karma sends completion and coverage.
    // Headless CI only needs terminal and JUnit results alongside code coverage.
    reporters: isCI ? ['progress', 'junit'] : ['progress', 'kjhtml', 'junit'],
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
        flags: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
      }
    },
    browsers: isCI ? ['ChromeHeadlessNoSandbox'] : ['Chrome'],
    singleRun: isCI,
    restartOnFileChange: !isCI
  });
};
