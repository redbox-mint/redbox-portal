import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MetadataDiscoveryResult } from '../src/discovery/types';
import { FigshareMetadataModel } from '../src/normalisation/types';
import { CsvReporter } from '../src/output/CsvReporter';
import { HtmlReporter } from '../src/output/HtmlReporter';
import { JsonReporter } from '../src/output/JsonReporter';

const model: FigshareMetadataModel = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  source: {
    baseUrl: 'https://example.test',
    apiVersions: ['v2'],
    discoveryMode: 'cqu-v2-dataset',
    groupId: 32014,
  },
  referencedEntities: { licenses: [], categories: [] },
  itemTypes: [
    {
      id: 'dataset',
      name: 'Dataset <test>',
      groupId: 32014,
      raw: {},
      fields: [
        {
          id: 101,
          name: 'Open Access',
          displayName: 'Data, sensitivity',
          type: 'dropdown',
          required: true,
          order: 0,
          source: 'institution-custom',
          values: [{ id: 'restricted', value: 'Restricted', label: 'Restricted "access"' }],
          valueSource: 'inline',
          rawConfiguration: { is_mandatory: true },
        },
      ],
    },
  ],
};

describe('report generation', () => {
  it('writes untouched API objects to the v2 raw catalogue layout', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'figshare-raw-'));
    const institutionField = { id: 101, name: 'Open Access', future: 'kept' };
    const groupField = { name: 'Open Access', value: '', future: 'kept' };
    const discovery = {
      target: { itemType: 'dataset', groupId: 32014 },
      fields: [],
      licenses: [],
      categories: [],
      raw: {
        coreFields: [],
        institutionCustomFields: [{ ...institutionField, raw: institutionField }],
        groupItemMetadata: [{ ...groupField, raw: groupField }],
        licenses: [],
        categories: [],
      },
    } as unknown as MetadataDiscoveryResult;
    await new JsonReporter().writeRaw(directory, discovery);
    const raw = JSON.parse(await readFile(path.join(directory, 'raw/group-32014-item-metadata.json'), 'utf8'));
    assert.deepEqual(raw, [groupField]);
  });

  it('writes machine-readable JSON and crosswalk templates', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'figshare-reporter-'));
    const reporter = new JsonReporter();
    await reporter.write(directory, model);
    await reporter.writeCrosswalk(directory, model);
    const schema = JSON.parse(await readFile(path.join(directory, 'figshare-schema.json'), 'utf8'));
    const crosswalk = JSON.parse(await readFile(path.join(directory, 'crosswalk-template.json'), 'utf8'));
    assert.equal(schema.itemTypes[0].fields[0].id, 101);
    assert.equal(schema.itemTypes[0].groupId, 32014);
    assert.deepEqual(crosswalk.itemTypes[0].mappings[0].figshare.values[0], {
      id: 'restricted',
      value: 'Restricted',
      label: 'Restricted "access"',
    });
    assert.equal(crosswalk.itemTypes[0].mappings[0].redbox.field, null);
    assert.deepEqual(crosswalk.itemTypes[0].mappings[0].redbox.valueMapping, {});
  });

  it('writes deliberately flat, escaped CSV rows', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'figshare-csv-'));
    await new CsvReporter().write(directory, model);
    const csv = await readFile(path.join(directory, 'figshare-schema.csv'), 'utf8');
    assert.match(csv, /group_id/);
    assert.match(csv, /32014/);
    assert.match(csv, /value_id,value,value_label/);
    assert.match(csv, /"Data, sensitivity"/);
    assert.match(csv, /restricted,Restricted,"Restricted ""access"""/);
  });

  it('neutralizes formula-like CSV cells, including after leading whitespace', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'figshare-csv-formula-'));
    const formulaModel: FigshareMetadataModel = {
      ...model,
      itemTypes: [{
        ...model.itemTypes[0],
        name: '=HYPERLINK("https://example.test")',
        fields: [{
          ...model.itemTypes[0].fields[0],
          name: '  +SUM(1,1)',
          displayName: '\t-10',
          values: [{ id: 'formula', value: 'Formula', label: '@user' }],
        }],
      }],
    };

    await new CsvReporter().write(directory, formulaModel);
    const csv = await readFile(path.join(directory, 'figshare-schema.csv'), 'utf8');

    assert.ok(csv.includes(`"'=HYPERLINK(""https://example.test"")"`));
    assert.ok(csv.includes(`"'  +SUM(1,1)"`));
    assert.ok(csv.includes(`'\t-10`));
    assert.ok(csv.includes(`'@user`));
  });

  it('writes escaped human-readable HTML with technical configuration', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'figshare-html-'));
    await new HtmlReporter().write(directory, model);
    const html = await readFile(path.join(directory, 'figshare-schema.html'), 'utf8');
    assert.match(html, /Dataset &lt;test&gt;/);
    assert.match(html, /group 32014/);
    assert.match(html, /Figshare field ID/);
    assert.match(html, /is_mandatory/);
    assert.doesNotMatch(html, /Dataset <test>/);
  });
});
