import { LegacyAgendaQueue } from '../compat/sails/agenda';
export { AgendaQueueUnsupportedFeatureError } from '../queues/AgendaQueue';
export namespace Services {
  export class AgendaQueue extends LegacyAgendaQueue {}
}
declare global {
  let AgendaQueueService: Services.AgendaQueue;
}
