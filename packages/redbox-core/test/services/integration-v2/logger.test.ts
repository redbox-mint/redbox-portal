import { strict as assert } from 'node:assert';
import * as Effect from 'effect/Effect';
import * as References from 'effect/References';
import { makeOniLoggerLayer } from '../../../src/services/oni-v2/runtime';
import { makeLoggerLayer } from '../../../src/services/raid-v2/logger';

describe('integration Effect logging', function () {
  const levels = ['debug', 'debug', 'info', 'warn', 'error', 'error'];
  const messages = Effect.gen(function* () {
    yield* Effect.logTrace('trace');
    yield* Effect.logDebug('debug');
    yield* Effect.logInfo('info');
    yield* Effect.logWarning('warning');
    yield* Effect.logError('error');
    yield* Effect.logFatal('fatal');
  });

  it('routes RAiD severity and retains correlation fields while redacting credentials', async function () {
    const entries: Array<{ level: string; entry: unknown }> = [];
    const capture = (level: string) => (entry: unknown) => {
      entries.push({ level, entry });
    };
    await Effect.runPromise(
      messages.pipe(
        Effect.annotateLogs({
          recordOid: 'record-1',
          authorization: 'bearer secret',
          nested: { accessToken: 'secret' },
        }),
        Effect.provideService(References.MinimumLogLevel, 'Trace'),
        Effect.provide(
          makeLoggerLayer({
            debug: capture('debug'),
            info: capture('info'),
            warn: capture('warn'),
            error: capture('error'),
          })
        )
      )
    );
    assert.deepEqual(
      entries.map(entry => entry.level),
      levels
    );
    const expectedMessages = ['trace', 'debug', 'info', 'warning', 'error', 'fatal'];
    entries.forEach(({ entry }, index) => {
      assert.deepEqual(entry, {
        message: [expectedMessages[index]],
        recordOid: 'record-1',
        authorization: '[REDACTED]',
        nested: { accessToken: '[REDACTED]' },
      });
    });
    assert.equal(JSON.stringify(entries).includes('bearer secret'), false);
  });

  it('routes Oni severity and includes publishing correlation fields', async function () {
    const entries: Array<{ level: string; args: unknown[] }> = [];
    const capture =
      (level: string) =>
      (...args: unknown[]) => {
        entries.push({ level, args });
      };
    await Effect.runPromise(
      messages.pipe(
        Effect.annotateLogs({ recordOid: 'record-1', correlationId: 'trace-1' }),
        Effect.provideService(References.MinimumLogLevel, 'Trace'),
        Effect.provide(
          makeOniLoggerLayer({
            debug: capture('debug'),
            info: capture('info'),
            warn: capture('warn'),
            error: capture('error'),
          })
        )
      )
    );
    assert.deepEqual(
      entries.map(entry => entry.level),
      levels
    );
    for (const { args } of entries) {
      assert.deepEqual(args[1], { recordOid: 'record-1', correlationId: 'trace-1' });
    }
  });
});
