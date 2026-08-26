import assert from 'node:assert/strict';
import { Config } from '../src/config/Config';

describe('Config', () => {
  it('uses documented CLI > environment > default precedence', () => {
    const parsed = Config.parse(
      ['--token', 'cli-token', '--api-url', 'https://cli.example/v2/', '--output', 'reports', '--group-id', '30527'],
      { FIGSHARE_TOKEN: 'env-token', FIGSHARE_API_URL: 'https://env.example', FIGSHARE_GROUP_ID: '999' },
      '/work'
    );
    assert.equal(parsed.config?.token, 'cli-token');
    assert.equal(parsed.config?.baseUrl, 'https://cli.example');
    assert.equal(parsed.config?.outputDirectory, '/work/reports');
    assert.equal(parsed.config?.groupId, 30527);
    assert.equal(parsed.config?.raw, true);
  });

  it('does not require a token to display help', () => {
    assert.equal(Config.parse(['--help'], {}).help, true);
    assert.match(Config.helpText(), /command-line option, environment variable, default/);
    assert.match(Config.helpText(), /--group-id/);
  });

  it('rejects missing tokens and unknown arguments', () => {
    assert.throws(() => Config.parse([], {}), /FIGSHARE_TOKEN/);
    assert.throws(() => Config.parse(['--surprise'], { FIGSHARE_TOKEN: 'x' }), /Unknown option/);
    assert.throws(() => Config.parse(['--group-id', '0'], { FIGSHARE_TOKEN: 'x' }), /positive integer/);
  });

  it('defaults to the CQU staging group', () => {
    const parsed = Config.parse([], { FIGSHARE_TOKEN: 'x' });
    assert.equal(parsed.config?.groupId, 32014);
    assert.equal(parsed.config?.baseUrl, 'https://api.figsh.com');
  });
});
