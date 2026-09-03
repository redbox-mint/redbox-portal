import type { AgendaJobsConfig, AgendaQueueConfig } from '@researchdatabox/redbox-core';

export function mergeAgendaQueueJobs(
  existingJobs: AgendaJobsConfig = {},
  hookJobs: AgendaJobsConfig = {}
): AgendaJobsConfig {
  return {
    ...existingJobs,
    ...hookJobs,
  };
}

export const agendaQueue: AgendaQueueConfig = {
  jobs: {
    'PDFService-CreatePDF': {
      fnName: 'rdmpservice.queuedTriggerSubscriptionHandler',
      options: {
        lockLifetime: 120 * 1000,
        lockLimit: 1,
        concurrency: 1,
      },
    },
  },
};
