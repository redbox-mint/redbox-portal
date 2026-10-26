import type { AgendaQueueOptions } from './agendaQueue.config';

/** Pure shared defaults. Environment translation belongs to the owning host. */
export const agendaQueueDefaultOptions: Readonly<AgendaQueueOptions> = {
  backend: 'mongodb',
  db: '',
  collection: 'agendaJobs',
  processEvery: '5 seconds',
  historyRetentionHours: 25,
};
