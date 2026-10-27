import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { ConfigurationError } from '../../src/configuration/resolution';
import { ExtensionError } from '../../src/extensions/loading';

describe('executable startup diagnostics', () => {
  for (const error of [
    new ConfigurationError('application', 'extensions', 'invalid declaration'),
    new ExtensionError('redbox-hook-fixture', 'declared dependency is not installed'),
    new Error('mongodb://admin:disposable-secret@database/portal'),
  ]) {
    it(`reports safe ${error.name} diagnostics without exposing provider credentials`, async () => {
      const completed = Promise.withResolvers<void>();
      const entries: unknown[] = [];
      let exitCode: number | undefined;
      const logger = { error: (...args: unknown[]) => entries.push(args) };
      runInNewContext(readFileSync(path.resolve(__dirname, '../../../../app.express.cjs'), 'utf8'), {
        __dirname: path.resolve(__dirname, '../../../..'),
        require: (name: string) => {
          if (name === 'node:path') return path;
          if (name === 'pino') return Object.assign(() => logger, { destination: () => ({}) });
          if (name.endsWith('/configuration')) return { ConfigurationError };
          if (name.endsWith('/extensions')) return { ExtensionError };
          if (name.endsWith('/portal'))
            return {
              createPortalApplication: async () => {
                throw error;
              },
            };
          throw new Error('Unexpected executable dependency: ' + name);
        },
        process: {
          env: {},
          argv: ['node', 'app.express.cjs', '--maintenance=indexes:ensure'],
          chdir() {},
          exit(code: number) {
            exitCode = code;
            completed.resolve();
          },
        },
      });
      await completed.promise;
      assert.equal(exitCode, 1);
      const [diagnostic, summary] = entries[0] as [Record<string, unknown>, string];
      assert.equal(summary, 'Express startup or maintenance failed.');
      assert.equal(diagnostic.name, error.name);
      assert.equal(
        diagnostic.message,
        error instanceof ConfigurationError || error instanceof ExtensionError ? error.message : undefined
      );
      assert(!JSON.stringify(entries).includes('disposable-secret'));
    });
  }
});
