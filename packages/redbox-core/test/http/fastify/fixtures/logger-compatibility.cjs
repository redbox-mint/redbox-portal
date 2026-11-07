// Compare real shared logger output with the pre-FM-016 creation implementation.
const { execFileSync } = require('node:child_process');
const Module = require('node:module');
const path = require('node:path');
const [revision, shape] = process.argv.slice(2);
let log;
if (revision === 'baseline') {
  require('ts-node').register({ transpileOnly: true, project: 'test/tsconfig.json' });
  const filename = path.resolve('src/config/log.config.ts');
  const source = execFileSync('git', ['show', '00511d68b:packages/redbox-core/src/config/log.config.ts'], {
    encoding: 'utf8',
  });
  const compiled = require('typescript').transpileModule(source, {
    compilerOptions: { module: 1, target: 11, esModuleInterop: true },
  }).outputText;
  const baseline = new Module(filename, module);
  baseline.filename = filename;
  baseline.paths = Module._nodeModulePaths(path.dirname(filename));
  baseline._compile(compiled, filename);
  log = baseline.exports.log;
} else log = require('../../../../dist/config/log.config').log;

const lines = [];
const destination =
  shape === 'default'
    ? undefined
    : Object.assign(shape === 'null-prototype' ? Object.create(null) : {}, { write: line => lines.push(line) });
const parent = log.createPinoLogger('trace', destination);
parent.level = 'error';
const namespace = log.createNamespaceLogger('compatibility', parent, 'prefix: ', 'debug');
namespace.debug({ nested: { count: 2 } }, 'debug event');
parent.info('filtered event');
parent.level = 'warn';
parent.warn('message', { detail: 'value' });
namespace.level = 'trace';
namespace.trace('trace event');
namespace.blank('filtered blank');
const knownError = new Error('known comparison error');
knownError.stack = 'Error: known comparison error\n    at stable-comparison-fixture';
parent.error(knownError, 'error event');
parent.flush(() => {
  process.send(
    {
      lines,
      levels: [parent.level, namespace.level],
      enabled: [parent.isLevelEnabled('info'), namespace.isLevelEnabled('trace')],
    },
    () => process.disconnect()
  );
});
