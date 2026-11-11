// Each real production portal owns the pinned provider's process singleton.
// No uncaughtException/unhandledRejection handlers; public provider cron needs exit.
require('ts-node/register/transpile-only');
require('../companionPortalProcess').run();
