import assert from 'node:assert/strict';
import { FigshareClient } from '../src/figshare/FigshareClient';
import { FigshareV2Client } from '../src/figshare/FigshareV2Client';

describe('Figshare live integration', function () {
  const enabled = process.env.RUN_FIGSHARE_INTEGRATION === 'true' && Boolean(process.env.FIGSHARE_TOKEN);
  (enabled ? it : it.skip)('reads the CQU v2 dataset metadata catalogue', async function () {
    this.timeout(120_000);
    const client = new FigshareClient({
      token: process.env.FIGSHARE_TOKEN!,
      baseUrl: process.env.FIGSHARE_API_URL,
    });
    const v2 = new FigshareV2Client(client);
    const groupId = Number(process.env.FIGSHARE_GROUP_ID ?? 32014);
    const [institutionFields, groupFields, licenses, categories] = await Promise.all([
      v2.getInstitutionCustomFields(),
      v2.getGroupItemMetadata(groupId),
      v2.getLicenses(),
      v2.getCategories(),
    ]);
    assert.ok(institutionFields.length > 0);
    assert.ok(groupFields.length > 0);
    assert.ok(licenses.length > 0);
    assert.ok(categories.length > 0);
  });
});
