import * as MongoStorageServiceModule from './MongoStorageService';

const serviceCache: Record<string, unknown> = {};

function getOrCreateService(name: string, factory: () => unknown): unknown {
  if (!serviceCache[name]) {
    serviceCache[name] = factory();
  }

  return serviceCache[name];
}

export { MongoStorageServiceModule as MongoStorageService };

export const ServiceExports = {
  get MongoStorageService() {
    return getOrCreateService('MongoStorageService', () =>
      new MongoStorageServiceModule.Services.MongoStorageService().exports()
    );
  },
};
