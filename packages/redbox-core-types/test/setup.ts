import '../src/sails';

/**
 * Test setup file that runs before all tests.
 * Sets up minimal global mocks required for service module loading.
 */

// Create logger that will be used by services
const mockLogger = {
  verbose: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  trace: () => {}
};

// Set up minimal sails global required for service module loading
(global as any).sails = {
  config: {
    appPath: '/app',
    custom_cache: { cacheExpiry: 3600, checkPeriod: 600 },
    auth: {
      defaultBrand: 'default',
      defaultPortal: 'portal',
      roles: [
        { name: 'Admin' },
        { name: 'Maintainer' },
        { name: 'Researcher' },
        { name: 'Guest' }
      ]
    },
    http: { rootContext: '' },
    appUrl: 'http://localhost:1500',
    log: {
      createNamespaceLogger: () => mockLogger,
      customLogger: mockLogger
    },
    brandingAware: () => ({}),
    brandingConfigurationDefaults: {}
  },
  log: mockLogger,
  services: {},
  on: () => {} // Mock sails.on for event handlers
};

// Set up lodash as global
(global as any)._ = require('lodash');

// Set up minimal model mocks that might be accessed during module loading
(global as any).CacheEntry = { findOne: () => ({ exec: () => {} }) };
(global as any).AsynchProgress = { find: () => ({ exec: () => {} }) };
(global as any).Role = { find: () => ({ exec: () => {} }) };
(global as any).BrandingConfig = { findOne: () => ({ exec: () => {} }) };
