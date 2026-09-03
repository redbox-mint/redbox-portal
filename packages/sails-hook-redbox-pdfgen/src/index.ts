import '@researchdatabox/redbox-core';
import { defineRedboxHook, type HookRegistrationMap } from '@researchdatabox/redbox-core';
import * as path from 'path';
import { agendaQueue, mergeAgendaQueueJobs } from './config/agendaQueue.js';
import { pdfgen } from './config/pdfgen.js';

export { };

const hook = defineRedboxHook({
  initialize(sails, cb) {
    const configService = (sails.services as Record<string, any>)?.configservice;
    const existingAgendaQueueConfig = sails.config.agendaQueue;
    if (configService?.mergeHookConfig) {
      configService.mergeHookConfig('@researchdatabox/sails-hook-redbox-pdfgen', sails.config);
    } else {
      sails.log.warn('sails-hook-redbox-pdfgen: ConfigService not available, skipping service loading');
    }

    sails.config.agendaQueue = {
      ...sails.config.agendaQueue,
      jobs: mergeAgendaQueueJobs(existingAgendaQueueConfig?.jobs, agendaQueue.jobs)
    };

    sails.after('hook:moduleloader:loaded', () => {
      try {
        const { PDFGEN_CONFIG_MODEL } = require('./api/configmodels/PDFGenConfig');
        const appConfigService = (sails.services as Record<string, any>)?.appconfigservice;
        if (appConfigService?.registerConfigModel) {
          appConfigService.registerConfigModel({
            ...PDFGEN_CONFIG_MODEL,
            tsGlob: path.join(__dirname, '../src/api/configmodels/*.ts')
          });
        } else {
          sails.log.warn('sails-hook-redbox-pdfgen: AppConfigService not available, skipping config model registration');
        }
      } catch (e) {
        sails.log.error('sails-hook-redbox-pdfgen: Failed to register config model:', e);
      }
    });

    cb();
  },
  routes: {
    before: {},
    after: {}
  },
  defaults: {
    __configKey__: {
      _hookTimeout: 120000
    }
  },
  registerRedboxConfig(): HookRegistrationMap {
    return {
      pdfgen
    };
  },
  registerRedboxServices(): HookRegistrationMap {
    return require('./api/services').ServiceExports as HookRegistrationMap;
  },
  additionalExports: {
    ServiceExports: require('./api/services').ServiceExports
  }
});

module.exports = hook;
