import type { SailsHook } from 'sails';
import { storage } from './config/storage';
import { record } from './config/record';
import { MongoModels } from './models';
import { ServiceExports } from './services';
import { registerRedboxMigrations } from './migrations';

type RedboxStorageMongoHook = ((_sails: unknown) => SailsHook) & {
  registerRedboxModels: () => typeof MongoModels;
  registerRedboxServices: () => typeof ServiceExports;
  registerRedboxConfig: () => { storage: typeof storage; record: typeof record };
  registerRedboxMigrations: typeof registerRedboxMigrations;
  ServiceExports: typeof ServiceExports;
};

const hook = ((_sails: unknown) => ({
  initialize(cb: (err?: Error) => void) {
    cb();
  },
  routes: {
    before: {},
    after: {},
  },
  configure() {},
  defaults: {},
})) as RedboxStorageMongoHook;

hook.registerRedboxModels = function registerRedboxModels() {
  return MongoModels;
};

hook.registerRedboxServices = function registerRedboxServices() {
  return ServiceExports;
};

hook.registerRedboxConfig = function registerRedboxConfig() {
  return {
    storage,
    record,
  };
};

hook.ServiceExports = ServiceExports;
hook.registerRedboxMigrations = registerRedboxMigrations;

export = hook;
