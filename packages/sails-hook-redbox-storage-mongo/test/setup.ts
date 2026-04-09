import * as lodash from 'lodash';

const mockLogger = {
  verbose: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  trace: () => {},
};

(global as any).sails = {
  config: {
    storage: {
      mongodb: {
        indices: [],
      },
    },
    record: {
      export: {
        maxRecords: 10,
      },
    },
    log: {
      createNamespaceLogger: () => mockLogger,
      customLogger: mockLogger,
    },
  },
  log: mockLogger,
  services: {},
  on: () => {},
  emit: () => {},
};

(global as any)._ = lodash;
