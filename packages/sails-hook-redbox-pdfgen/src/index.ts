import '@researchdatabox/redbox-core';
import { defineRedboxHook, type HookRegistrationMap } from '@researchdatabox/redbox-core';
import * as path from 'path';
import { PDFGEN_CONFIG_MODEL } from './api/configmodels/PDFGenConfig';
import { ServiceExports } from './api/services';
import { agendaQueue, mergeAgendaQueueJobs } from './config/agendaQueue.js';
import { pdfgen } from './config/pdfgen.js';

type ConfigService = {
  mergeHookConfig?: (hookName: string, config: Sails.ConfigObject) => unknown;
};

type AppConfigService = {
  registerConfigModel?: (info: {
    key: string;
    modelName: string;
    class: new (...args: never[]) => object;
    schema?: unknown;
    tsGlob?: string | string[];
    secretFields?: string[];
  }) => void;
};

const hook = defineRedboxHook({
  initialize(sails, cb) {
    const services = sails.services as Record<string, unknown>;
    const configService = services.configservice as ConfigService | undefined;
    const existingAgendaQueueConfig = sails.config.agendaQueue;
    if (configService?.mergeHookConfig) {
      configService.mergeHookConfig('@researchdatabox/sails-hook-redbox-pdfgen', sails.config);
    } else {
      sails.log.warn('sails-hook-redbox-pdfgen: ConfigService not available, skipping service loading');
    }

    sails.config.agendaQueue = {
      ...sails.config.agendaQueue,
      jobs: mergeAgendaQueueJobs(existingAgendaQueueConfig?.jobs, agendaQueue.jobs),
    };

    sails.after('hook:moduleloader:loaded', () => {
      try {
        const appConfigService = services.appconfigservice as AppConfigService | undefined;
        if (appConfigService?.registerConfigModel) {
          appConfigService.registerConfigModel({
            ...PDFGEN_CONFIG_MODEL,
            tsGlob: path.join(__dirname, '../src/api/configmodels/*.ts'),
          });
        } else {
          sails.log.warn(
            'sails-hook-redbox-pdfgen: AppConfigService not available, skipping config model registration'
          );
        }
      } catch (e) {
        sails.log.error('sails-hook-redbox-pdfgen: Failed to register config model:', e);
      }
    });

    cb();
  },
  routes: {
    before: {},
    after: {},
  },
  defaults: {
    __configKey__: {
      _hookTimeout: 120000,
    },
  },
  registerRedboxConfig(): HookRegistrationMap {
    return {
      pdfgen,
    };
  },
  registerRedboxServices(): HookRegistrationMap {
    return ServiceExports;
  },
  additionalExports: {
    ServiceExports,
  },
});

module.exports = hook;
