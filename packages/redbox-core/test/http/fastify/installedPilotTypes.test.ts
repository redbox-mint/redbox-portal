import assert from 'node:assert/strict';
import { checkConsumerSource } from './installedPilot';
describe('FM-019 installed consumer type erasure guard', () => {
  for (const source of [
    'input as any',
    'input as unknown as Input',
    '<any>input',
    '// @ts-ignore\ninput',
    '// @ts-nocheck\ninput',
  ])
    it('rejects ' + JSON.stringify(source), () => assert.throws(() => checkConsumerSource(source)));
  it('allows concrete factory inference', () => checkConsumerSource('bindControllerFactory(factory, concreteInput);'));
});
