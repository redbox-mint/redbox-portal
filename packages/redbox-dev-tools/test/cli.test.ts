const { expect } = require('chai');
const { spawnSync } = require('child_process');
const path = require('path');

const packageRoot = path.resolve(__dirname, '..');
const cliPath = path.join(packageRoot, 'src', 'cli.ts');

// Runs the real CLI entry in a subprocess so the commander dependency is
// exercised through the same CommonJS require path the published bin uses.
// dist/ is not built during tests, so the TS source is run via ts-node.
function runCli(args: string[]) {
  return spawnSync(process.execPath, ['--require', 'ts-node/register', cliPath, ...args], {
    cwd: packageRoot,
    encoding: 'utf8' as const,
    env: {
      ...process.env,
      TS_NODE_PROJECT: 'tsconfig.json',
      TS_NODE_TRANSPILE_ONLY: 'true',
    },
  });
}

describe('cli smoke test', function () {
  this.timeout(60000);

  it('should print help for the full command tree and exit 0', () => {
    const result = runCli(['--help']);
    expect(result.status).to.equal(0, result.stderr);
    expect(result.stdout).to.contain('Usage: redbox-dev-tools');
    expect(result.stdout).to.contain('migrate-form-config');
    expect(result.stdout).to.contain('generate|g');
  });

  it('should dispatch to a subcommand action', () => {
    const result = runCli(['completion', 'bash']);
    expect(result.status).to.equal(0, result.stderr);
    expect(result.stdout).to.contain('complete -F _redbox_dev_tools_completion redbox-dev-tools');
  });

  it('should reject an unknown command with a non-zero exit code', () => {
    const result = runCli(['not-a-real-command']);
    expect(result.status).to.not.equal(0);
    expect(result.stderr).to.contain('unknown command');
  });
});
