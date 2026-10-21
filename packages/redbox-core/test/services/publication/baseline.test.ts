import { expect } from 'chai';
import * as sinon from 'sinon';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMetadataPayload } from '../../../src/services/figshare-v2/metadata';
import { buildOniRoCrate } from '../../../src/services/oni-v2/crate';
import { baselineRecord, baselineFigshare, baselineOni } from '../../fixtures/publication/baseline';

function golden(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, '../../fixtures/publication', name), 'utf8'));
}
export async function oniBaseline() {
  const config = baselineOni();
  return buildOniRoCrate({
    config,
    site: config.sites.public,
    siteName: 'public',
    oid: 'publication-baseline',
    record: baselineRecord(),
    creator: { username: 'creator', email: 'creator@example.test', text_full_name: 'Ada Lovelace' },
    approver: { username: 'approver', email: 'approver@example.test', text_full_name: 'Institutional Approver' },
  });
}
describe('Publication provider baseline artifacts (PUB-01)', () => {
  afterEach(() => sinon.restore());
  it('preserves the actual Figshare outgoing payload across path, Handlebars and async JSONata bindings', async () => {
    const payload = await buildMetadataPayload(baselineFigshare(), baselineRecord());
    expect(JSON.parse(JSON.stringify(payload))).to.deep.equal(golden('figshare-payload.json'));
  });
  it('preserves the serialized Oni crate, creator/approver history, attachment selection and URL', async () => {
    const clock = sinon.useFakeTimers({ now: new Date('2026-02-03T04:05:06.000Z'), toFake: ['Date'] });
    try {
      expect(JSON.parse(JSON.stringify(await oniBaseline()))).to.deep.equal(golden('oni-crate.json'));
    } finally {
      clock.restore();
    }
  });
});
