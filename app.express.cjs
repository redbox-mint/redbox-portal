/** Internal v6 default: one production application, HTTP server and signal owner. */
'use strict';
const path = require('node:path');
const pino = require('pino');
const { ConfigurationError } = require('@researchdatabox/redbox-core/configuration');
const { ExtensionError } = require('@researchdatabox/redbox-core/extensions');
const {
  createPortalHost,
  createPortalApplication,
  prepareSelectedPersistenceIndexes,
  selectedAgendaMongoOptions,
  cleanupPersistence,
  persistenceStatus,
} = require('@researchdatabox/redbox-core/portal');

process.chdir(__dirname);
const destination = pino.destination({ dest: 1, sync: true });
const logger = pino({ level: 'info' }, destination);
const log = {
  info: (...args) => logger.info(...args),
  warn: (...args) => logger.warn(...args),
  error: (...args) => logger.error(...args),
  fatal: (...args) => logger.fatal(...args),
  debug: (...args) => logger.debug(...args),
  trace: (...args) => logger.trace(...args),
  verbose: (...args) => logger.debug(...args),
  silly: (...args) => logger.trace(...args),
  crit: (...args) => logger.fatal(...args),
  log: (...args) => logger.info(...args),
  blank: () => {},
  silent: () => {},
};
const args = process.argv.slice(2);
const modes = args.filter(arg => arg.startsWith('--maintenance=') || arg === '--initialize-only');
if (modes.length > 1) throw new Error('Select one maintenance operation.');
const mode = modes[0];
if (mode && !['--maintenance=indexes:inspect', '--maintenance=indexes:ensure', '--initialize-only'].includes(mode))
  throw new Error('Use --maintenance=indexes:inspect, --maintenance=indexes:ensure or --initialize-only.');
const { REDBOX_APPLICATION_CONFIG, REDBOX_ENVIRONMENT_CONFIG, REDBOX_LOCAL_CONFIG, ...domainEnvironment } = process.env;
const options = {
  env: domainEnvironment,
  appPath: __dirname,
  log,
  environment: process.env.NODE_ENV || 'development',
  includeDevDependencies: process.env.NODE_ENV !== 'production',
  files: {
    application: process.env.REDBOX_APPLICATION_CONFIG,
    environment: process.env.REDBOX_ENVIRONMENT_CONFIG,
    local: process.env.REDBOX_LOCAL_CONFIG,
  },
  localesDirectory: path.resolve(__dirname, 'language-defaults'),
  argv: args.filter(arg => arg !== mode),
};
let portal;
(async () => {
  portal = await (mode ? createPortalApplication(options) : createPortalHost(options));
  logger.level = portal.config.logging.level;
  if (mode?.startsWith('--maintenance=')) {
    try {
      const report = await prepareSelectedPersistenceIndexes(
        portal.owner,
        mode.endsWith(':ensure') ? 'ensure' : 'inspect',
        {
          storage: portal.preflight,
          agenda: selectedAgendaMongoOptions(portal.config.agendaQueue),
          session: portal.config.redboxSession,
        }
      );
      process.stdout.write(JSON.stringify(report) + '\n');
      process.exitCode = report.ready ? 0 : 2;
    } finally {
      await cleanupPersistence(portal.owner);
      process.stdout.write(JSON.stringify({ persistence: persistenceStatus(portal.owner) }) + '\n');
    }
  } else if (mode === '--initialize-only') {
    try {
      await portal.application.initialize();
    } finally {
      await portal.application.stop();
    }
  } else {
    portal.host.installSignalHandlers({
      onStopped: () => {
        log.info('Express host stopped.');
        process.exit(0);
      },
      onError: () => {
        log.error('Express shutdown failed; resources remain owned. Retry the stop signal.');
        process.exitCode = 1;
      },
    });
    await portal.host.initialize();
    await portal.host.activate();
    log.info({ startupMs: Math.round(process.uptime() * 1000), address: portal.host.address() }, 'Express host ready.');
  }
})().catch(async error => {
  // Configuration and extension errors expose controlled identifiers and diagnostics.
  // Arbitrary database/provider errors can contain credentials; retain lifecycle status only.
  log.error(
    {
      name: error?.name,
      ...(error instanceof ConfigurationError || error instanceof ExtensionError ? { message: error.message } : {}),
      status: portal?.application.status(),
    },
    'Express startup or maintenance failed.'
  );
  try {
    await (portal?.host?.stop() ?? portal?.application.stop());
  } catch {
    log.error('Cleanup failed; resources remain owned until process exit.');
  }
  process.exit(1);
});
