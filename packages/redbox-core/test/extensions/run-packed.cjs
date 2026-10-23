const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '../../../..');
const maintenance = process.argv.includes('--maintenance-mongo');
const output = path.join(
  repo,
  maintenance ? '.tmp/sails-retirement/p3-maintenance-pack' : '.tmp/sails-retirement/p2-pack'
);
fs.mkdirSync(output, { recursive: true });
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), maintenance ? 'redbox-p3-packed-' : 'redbox-p2-packed-'));
const packages = [
  'sails-ng-common',
  'agenda-sqs-backend',
  'raido',
  'rva-registry',
  'redbox-core',
  'sails-hook-redbox-storage-mongo',
  'sails-hook-redbox-pdfgen',
  'redbox-hook-dev',
  'redbox-dev-tools',
];
const artifacts = [];
function pack(directory) {
  const data = JSON.parse(
    execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', output], {
      cwd: directory,
      encoding: 'utf8',
    })
  )[0];
  const file = path.join(output, data.filename);
  artifacts.push({
    name: data.name,
    filename: data.filename,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    files: data.entryCount,
  });
  return { name: data.name, spec: 'file:' + file };
}
const packed = [
  ...packages.map(name => pack(path.join(repo, 'packages', name))),
  ...['esm-only', 'esm-hook', 'commonjs-hook'].map(name => pack(path.join(__dirname, 'fixtures', name))),
  ...(maintenance ? [pack(path.join(__dirname, '../maintenance/fixtures/probe'))] : []),
];
const dependencies = Object.fromEntries(packed.map(item => [item.name, item.spec]));
const overrides = { ...JSON.parse(fs.readFileSync(path.join(repo, 'packages/redbox-core/package.json'))).overrides };
for (const item of packed) overrides[item.name] = '$' + item.name;
fs.writeFileSync(
  path.join(sandbox, 'package.json'),
  JSON.stringify(
    {
      name: 'sr-packed-consumer',
      version: '1.0.0',
      private: true,
      dependencies,
      overrides,
      hookLoadPriority: ['sr-commonjs-hook', 'sr-esm-hook'],
    },
    null,
    2
  )
);
const env = {
  ...process.env,
  NODE_PATH: '',
  NODE_ENV: 'production',
  RBPORTAL_PLAYWRIGHT_SCENARIOS: 'false',
  PUPPETEER_SKIP_DOWNLOAD: 'true',
  npm_config_update_notifier: 'false',
};
function install(args, log) {
  try {
    fs.writeFileSync(
      path.join(output, log),
      execFileSync('npm', args, { cwd: sandbox, env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
    );
  } catch (error) {
    fs.writeFileSync(path.join(output, log), (error.stdout || '') + (error.stderr || ''));
    throw error;
  }
}
install(['install', '--prefer-offline', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], 'install.log');
fs.rmSync(path.join(sandbox, 'node_modules'), { recursive: true, force: true });
install(['ci', '--offline', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], 'offline-ci.log');
fs.copyFileSync(
  path.join(__dirname, maintenance ? '../maintenance/packed-mongo.cjs' : 'packed-consumer.cjs'),
  path.join(sandbox, 'verify.cjs')
);
const result = execFileSync(process.execPath, ['verify.cjs'], { cwd: sandbox, env, encoding: 'utf8' });
const summary = {
  node: process.version,
  npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
  sandbox,
  artifacts,
  result: JSON.parse(result.trim().split('\n').at(-1)),
};
fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
fs.rmSync(sandbox, { recursive: true, force: true });
