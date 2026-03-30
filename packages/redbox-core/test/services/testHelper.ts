/**
 * Test helper utilities for service tests
 */
import * as sinon from 'sinon';
import { from } from 'rxjs';

/**
 * Creates a mock sails object with common configurations
 */
export function createMockSails(overrides: any = {}): any {
  const defaultSails = {
    config: {
      appPath: '/app',
      custom_cache: { cacheExpiry: 3600, checkPeriod: 600 },
      auth: {
        defaultBrand: 'default',
        defaultPortal: 'portal',
        roles: [{ name: 'Admin' }, { name: 'Maintainer' }, { name: 'Researcher' }, { name: 'Guest' }],
      },
      http: {
        rootContext: '',
      },
      appUrl: 'http://localhost:1500',
    },
    log: {
      verbose: sinon.stub(),
      debug: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
      trace: sinon.stub(),
    },
    services: {},
    on: sinon.stub(), // Add sails.on for event handlers
  };

  return { ...defaultSails, ...overrides };
}

/**
 * Creates an observable from a promise for use with getObservable mocks
 */
export function toObservable(value: any) {
  return from(Promise.resolve(value));
}

/**
 * Creates a query object that mimics Waterline's chainable queries.
 * The exec method uses Node-style callback: callback(error, result)
 */
export function createQueryObject(result: any, error: any = null): any {
  const queryObj = {
    exec: function (callback: (err: any, result: any) => void) {
      if (error) {
        callback(error, null);
      } else {
        callback(null, result);
      }
    },
    // Make it Thenable so await works
    then: function (onFulfilled: any, onRejected: any) {
      if (error) {
        if (onRejected) onRejected(error);
        return Promise.reject(error);
      } else {
        if (onFulfilled) onFulfilled(result);
        return Promise.resolve(result);
      }
    },
    // Support chaining methods
    populate: sinon.stub().returnsThis(),
    where: sinon.stub().returnsThis(),
    sort: sinon.stub().returnsThis(),
    limit: sinon.stub().returnsThis(),
    skip: sinon.stub().returnsThis(),
    set: sinon.stub().returnsThis(),
    meta: sinon.stub().returnsThis(),
  };
  return queryObj;
}

/**
 * Creates a mock waterline model with proper query chain support
 * for use with CoreService.getObservable()
 */
export function createMockModel(name: string): any {
  return {
    find: sinon.stub().returns(createQueryObject([])),
    findOne: sinon.stub().returns(createQueryObject(null)),
    create: sinon.stub().returns(createQueryObject({})),
    update: sinon.stub().returns(createQueryObject([])),
    destroy: sinon.stub().returns(createQueryObject([])),
  };
}

/**
 * Helper to configure a model method to return specific data.
 * Use this instead of .resolves() for model methods.
 *
 * Example:
 *   configureModelMethod(mockModel.find, [{ id: 1 }]);
 *   configureModelMethod(mockModel.findOne, { id: 1 });
 *   configureModelMethod(mockModel.create, null, new Error('Failed'));
 */
export function configureModelMethod(stub: sinon.SinonStub, result: any, error: any = null): void {
  stub.returns(createQueryObject(result, error));
}

/**
 * Sets up global mock environment for service tests
 */
export function setupServiceTestGlobals(mockSails?: any): void {
  (global as any).sails = mockSails || createMockSails();
  (global as any)._ = require('lodash');
}

/**
 * Cleans up global mock environment
 */
export function cleanupServiceTestGlobals(): void {
  delete (global as any).sails;
  delete (global as any).StorageManagerService;
}
