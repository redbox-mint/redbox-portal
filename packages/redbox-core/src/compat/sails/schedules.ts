import { isObservable, lastValueFrom } from 'rxjs';
import { ScheduledWork } from '../../queues/ScheduledWork';
import { registerPersistenceResource } from '../../persistence/runtime';

/** Legacy config/function lookup stays out of the timer owner. */
export async function prepareSailsSchedules(app: Sails.Application): Promise<void> {
  if (!app.config.crontab.enabled) return;
  const operations = app.config.crontab.crons().map((item, index) => {
    const service = app.services[item.service];
    const handler = service?.[item.method];
    if (typeof handler !== 'function') throw new Error('Configured cron handler is unavailable.');
    return {
      name: `cron-${index}`,
      interval: item.interval,
      run: async () => {
        const result: unknown = handler.call(service);
        if (isObservable(result)) await lastValueFrom(result);
        else await result;
      },
    };
  });
  const schedules = new ScheduledWork(operations, app.log, app);
  registerPersistenceResource(app, 'cron', schedules);
  await schedules.initialize();
  app.on('ready', () => {
    void schedules.activate().catch(() => {
      schedules.quiesce();
      app.log.error('Cron activation failed; timers stopped.');
    });
  });
}
