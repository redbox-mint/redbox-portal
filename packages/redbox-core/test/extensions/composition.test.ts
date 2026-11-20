import assert from 'node:assert/strict';
import { bindExtensionFactory } from '../../src/extensions';
import { extensionDataFixture } from '../helpers/extensionDataFixture';
import { resolveExtensionData, type ExtensionDataProvider } from '../../src/extensions/resolution';

describe('owned extension composition', () => {
  it('never constructs the discarded factory and isolates winner instances across applications', async () => {
    let discarded = 0,
      created = 0;
    const closed: number[] = [];
    const providers: ExtensionDataProvider[] = [
      {
        name: 'core',
        root: '.',
        declaration: {
          modules: [
            {
              name: 'sample',
              create: () => {
                discarded++;
                throw new Error('discarded');
              },
            },
          ],
        },
      },
      {
        name: 'hook',
        root: '.',
        declaration: {
          modules: [
            {
              name: 'sample',
              replaces: true,
              create: (input: { label: number }) => {
                created++;
                return {
                  initialize: async () => {},
                  close: async () => {
                    closed.push(input.label);
                  },
                };
              },
            },
          ],
        },
      },
    ];
    const resolved = resolveExtensionData(providers);
    const compositions = [1, 2].map(label =>
      extensionDataFixture({ config: {}, log: console }, resolved, {
        module: item => bindExtensionFactory(item.declaration, { label }),
      })
    );
    assert.equal(created, 0);
    await Promise.all(
      compositions.map(async item => {
        await Promise.all([item.application.initialize(), item.application.initialize()]);
        await item.application.activate();
      })
    );
    assert.equal(discarded, 0);
    assert.equal(created, 2);
    await compositions[0].application.stop();
    assert.equal(compositions[1].application.status().ready, true);
    await compositions[1].application.stop();
    assert.deepEqual(closed, [1, 2]);
  });
});
