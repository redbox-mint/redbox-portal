const { expect } = require('chai');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const packageRoot = path.resolve(__dirname, '..');
const cliPath = path.join(packageRoot, 'src', 'cli.ts');
const tsNodeRegister = require.resolve('ts-node/register');
const tsNodeProject = path.join(packageRoot, 'tsconfig.json');

// Runs the real CLI entry in a subprocess so the commander dependency is
// exercised through the same CommonJS require path the published bin uses.
// dist/ is not built during tests, so the TS source is run via ts-node.
function runCli(args: string[], cwd = packageRoot) {
  return spawnSync(process.execPath, ['--require', tsNodeRegister, cliPath, ...args], {
    cwd,
    encoding: 'utf8' as const,
    env: {
      ...process.env,
      TS_NODE_PROJECT: tsNodeProject,
      TS_NODE_TRANSPILE_ONLY: 'true',
    },
  });
}

describe('cli smoke test', function () {
  this.timeout(60000);
  let tempRoot: string | undefined;

  afterEach(() => {
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

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

  it('should allow the generated hook dependency contract', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-dev-tools-cli-'));
    fs.writeFileSync(
      path.join(tempRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'redbox-hook-demo',
          peerDependencies: {
            '@researchdatabox/redbox-core': '4.5.1',
          },
          devDependencies: {
            '@researchdatabox/redbox-core': '4.5.1',
            '@researchdatabox/redbox-dev-tools': '4.5.1',
          },
          dependencies: {},
        },
        null,
        2
      )
    );

    const result = runCli(['check'], tempRoot);
    expect(result.status).to.equal(0, result.stderr);
    expect(result.stdout).to.contain('Hook dependency contract looks good');
  });
});
