import '../src/sails';
import * as lodash from 'lodash';
import {
  createNoopMeter,
  metrics,
  type Attributes,
  type Counter,
  type Histogram,
  type Meter,
  type MeterProvider,
} from '@opentelemetry/api';

// Ensure TypeScript includes Sails global service declarations during tests.
// These are type-only imports and do not execute the modules at runtime.
import type { Services as _BrandingServiceTypes } from '../src/services/BrandingService';
import type { Services as _FormVocabularyServiceTypes } from '../src/services/FormVocabularyService';
import type { Services as _VocabularyServiceTypes } from '../src/services/VocabularyService';
import type { Services as _RvaImportServiceTypes } from '../src/services/RvaImportService';
import type { Services as _AppConfigServiceTypes } from '../src/services/AppConfigService';
import type { Services as _NamedQueryServiceTypes } from '../src/services/NamedQueryService';
import type { Services as _RecordsServiceTypes } from '../src/services/RecordsService';
import type { Services as _RecordTypesServiceTypes } from '../src/services/RecordTypesService';
import type { Services as _UsersServiceTypes } from '../src/services/UsersService';
import type { Services as _WorkflowStepsServiceTypes } from '../src/services/WorkflowStepsService';
import type { Services as _DashboardConfigServiceTypes } from '../src/services/DashboardConfigService';
import type { Services as _DashboardTypesServiceTypes } from '../src/services/DashboardTypesService';
import type { Services as _RolesServiceTypes } from '../src/services/RolesService';
import type { Services as _CacheServiceTypes } from '../src/services/CacheService';
import type { Services as _EmailServiceTypes } from '../src/services/EmailService';
import type { Services as _AgendaQueueServiceTypes } from '../src/services/AgendaQueueService';
import type { Services as _IntegrationAuditServiceTypes } from '../src/services/IntegrationAuditService';
import type { Services as _DomSanitizerServiceTypes } from '../src/services/DomSanitizerService';
import type { Services as _FormsServiceTypes } from '../src/services/FormsService';
import type { Services as _FormRecordConsistencyServiceTypes } from '../src/services/FormRecordConsistencyService';
import type { Services as _TranslationServiceTypes } from '../src/services/TranslationService';
import type { Services as _NavigationServiceTypes } from '../src/services/NavigationService';
import type { Services as _SolrSearchServiceTypes } from '../src/services/SolrSearchService';
import type {} from '../src/waterline-models/types';

export interface CapturedOpenTelemetryMeasurement {
  readonly name: string;
  readonly value: number;
  readonly attributes: Attributes;
}

const capturedOpenTelemetryMeasurements: CapturedOpenTelemetryMeasurement[] = [];
const noopMeter = createNoopMeter();
const capturingMeter: Meter = new Proxy(noopMeter, {
  get(target, property, receiver) {
    if (property === 'createCounter') {
      return (name: string): Counter => ({
        add: (value, attributes = {}) => {
          capturedOpenTelemetryMeasurements.push({ name, value, attributes: { ...attributes } });
        },
      });
    }
    if (property === 'createHistogram') {
      return (name: string): Histogram => ({
        record: (value, attributes = {}) => {
          capturedOpenTelemetryMeasurements.push({ name, value, attributes: { ...attributes } });
        },
      });
    }
    return Reflect.get(target, property, receiver);
  },
});
const capturingMeterProvider: MeterProvider = {
  getMeter: name =>
    name === 'redbox.record-validation' || name === 'redbox.record-schema' || name === 'redbox.authorization'
      ? capturingMeter
      : noopMeter,
};
if (!metrics.setGlobalMeterProvider(capturingMeterProvider)) {
  throw new Error('The core test suite could not install its OpenTelemetry meter provider.');
}

export function clearCapturedOpenTelemetryMeasurements(): void {
  capturedOpenTelemetryMeasurements.length = 0;
}

export function getCapturedOpenTelemetryMeasurements(): readonly CapturedOpenTelemetryMeasurement[] {
  return capturedOpenTelemetryMeasurements.map(measurement => ({
    ...measurement,
    attributes: { ...measurement.attributes },
  }));
}

/**
 * Test setup file that runs before all tests.
 * Sets up minimal global mocks required for service module loading.
 */

// Explicit test-only opt-in for the authorization migration checkpoint
// memory mirror (see AuthorizationMigrationService.memoryCheckpointFallbackAllowed).
// Staging/dev/production require durable storage; only the unit-test suite
// may use process memory, and only via this explicit variable.
if (process.env.AUTHORIZATION_MIGRATION_CHECKPOINT_MEMORY === undefined) {
  process.env.AUTHORIZATION_MIGRATION_CHECKPOINT_MEMORY = 'test-allowed';
}

// Create logger that will be used by services
const mockLogger = {
  verbose: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  trace: () => {},
};

// Set up minimal sails global required for service module loading.
// Complete descriptor: every Sails.Application surface the core suite touches
// (config, log, services, models, events, sockets, actions, datastore) is
// present so the full suite does not depend on file load order or per-file
// stubs for baseline shape. Individual suites override globals per test and
// restore them in scoped hooks.
(global as any).sails = {
  config: {
    appPath: '/app',
    custom_cache: { cacheExpiry: 3600, checkPeriod: 600 },
    auth: {
      defaultBrand: 'default',
      defaultPortal: 'portal',
      roles: [{ name: 'Admin' }, { name: 'Maintainer' }, { name: 'Researcher' }, { name: 'Guest' }],
    },
    http: { rootContext: '' },
    appUrl: 'http://localhost:1500',
    log: {
      createNamespaceLogger: () => mockLogger,
      customLogger: mockLogger,
    },
    brandingAware: () => ({}),
    brandingConfigurationDefaults: {},
    authorization: { mode: 'legacy' },
    // Contract-only tests must not present an empty object as the runtime
    // route table: `route-registry` treats any object (including `{}`) as
    // authoritative and `validate:api-routes` then fails on zero configured
    // routes. Leave runtime routes undefined so the merged contract registry
    // is authoritative unless a suite explicitly populates it (and restores
    // it afterwards to isolate setup state).
  },
  log: mockLogger,
  services: {},
  models: {},
  after: (_events: string | string[], cb: () => void) => {
    void _events;
    void cb;
  },
  sockets: {
    join: () => {},
    leave: () => {},
    broadcast: () => {},
    blast: () => {},
    getId: () => '',
  },
  getActions: () => ({}),
  on: () => {}, // Mock sails.on for event handlers
  emit: () => {}, // Mock sails.emit for event handlers
  getDatastore: () => undefined,
};

// Set up lodash as global
(global as any)._ = lodash;

// Set up minimal model mocks that might be accessed during module loading
(global as any).CacheEntry = { findOne: () => ({ exec: () => {} }) };
(global as any).AsynchProgress = { find: () => ({ exec: () => {} }) };
(global as any).Role = { find: () => ({ exec: () => {} }) };
(global as any).BrandingConfig = { findOne: () => ({ exec: () => {} }) };
