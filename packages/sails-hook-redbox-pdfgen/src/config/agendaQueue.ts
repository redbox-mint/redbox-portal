import type { AgendaJobConfig, AgendaJobsConfig, AgendaQueueConfig } from '@researchdatabox/redbox-core';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function mergeConfigObjects(
  existing: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = isPlainObject(merged[key]) && isPlainObject(value)
      ? mergeConfigObjects(merged[key], value)
      : value;
  }
  return merged;
}

function mergeJobConfig(existing: AgendaJobConfig, override: AgendaJobConfig): AgendaJobConfig {
  return mergeConfigObjects(
    existing as unknown as Record<string, unknown>,
    override as unknown as Record<string, unknown>
  ) as unknown as AgendaJobConfig;
}

export function mergeAgendaQueueJobs(
  existingJobs: AgendaJobsConfig = {},
  hookJobs: AgendaJobsConfig = {}
): AgendaJobsConfig {
  const mergedJobs: AgendaJobsConfig = { ...existingJobs };
  for (const [jobName, hookJob] of Object.entries(hookJobs)) {
    const existingJob = existingJobs[jobName];
    mergedJobs[jobName] = existingJob == null
      ? hookJob
      : mergeJobConfig(existingJob, hookJob);
  }
  return mergedJobs;
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
