import '../src/sails';
import * as lodash from 'lodash';
import chai from 'chai';

// Ensure TypeScript includes Sails global service declarations during tests.
// These are type-only imports and do not execute the modules at runtime.
import type { Services as _BrandingServiceTypes } from '../src/services/BrandingService';
import type { Services as _VocabServiceTypes } from '../src/services/VocabService';
import type { Services as _VocabularyServiceTypes } from '../src/services/VocabularyService';
import type { Services as _RvaImportServiceTypes } from '../src/services/RvaImportService';

/**
 * Test setup file that runs before all tests.
 * Sets up minimal global mocks required for service module loading.
 */

// Create logger that will be used by services
const mockLogger = {
  verbose: () => { },
  debug: () => { },
  info: () => { },
  warn: () => { },
  error: () => { },
  trace: () => { }
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
  on: () => { } // Mock sails.on for event handlers
};

// Set up lodash as global
(global as any)._ = lodash;

// Set up minimal model mocks that might be accessed during module loading
(global as any).CacheEntry = { findOne: () => ({ exec: () => { } }) };
(global as any).AsynchProgress = { find: () => ({ exec: () => { } }) };
(global as any).Role = { find: () => ({ exec: () => { } }) };
(global as any).BrandingConfig = { findOne: () => ({ exec: () => { } }) };
