import { strict as assert } from 'node:assert';
import jsonata from 'jsonata';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { reusableFormDefinitions } from '../../redbox-core/src/config/reusableFormDefinitions.config';
import { FormConfigExports } from '../src/form-config';
import { recordtype } from '../src/config/recordtype';
import { workflow } from '../src/config/workflow';
import {
  relatedPlanEmail,
  relatedPlanDoi,
  relatedPlanDoiProfile,
  relatedPlanPdf,
  namedQuery,
} from '../src/config/related-record-examples';
import { compileRelatedDisplayContract } from '../../redbox-core/src/related-records/display-descriptors';
import {
  generateRecordSchemaRolloutEvidence,
  runRecordSchemaRolloutEvidence,
} from '../../redbox-core/scripts/verify-record-schema-rollout';

const plan = FormConfigExports['related-plan-1.0-draft'];
const fields = plan.componentDefinitions!;
const targets = fields.filter(field => field.relatedDisplay);

describe('generic related plan/activity examples', () => {
  it('registers separate forms, starting workflows, references and compatible view declarations', () => {
    for (const type of ['related-plan', 'related-activity']) {
      assert.equal(workflow[type].draft.config.form, `${type}-1.0-draft`);
      assert.equal(FormConfigExports[`${type}-1.0-draft`].type, type);
      assert.equal(recordtype[type].packageType, type);
    }
    const contract = compileRelatedDisplayContract(plan, {}, recordtype['related-plan'].relatedTo)!;
    assert.deepEqual(contract.displayTargets, [
      { metadataPointer: '/activityTitle', relationId: 'primaryActivity' },
      { metadataPointer: '/activityDates', relationId: 'primaryActivity' },
      { metadataPointer: '/activitySummaries', relationId: 'activities' },
    ]);
    assert.equal(contract.sources.length, 3);
    assert(!fields.find(field => field.name === 'notes')!.relatedDisplay);
  });

  it('populates current scalar/group/repeatables and clears old data during refresh and unlink', async () => {
    for (const field of targets) {
      const config = field.expressions![0].config;
      assert.equal(config.runOnFormReady, false);
      const evaluate = async (value: object) =>
        JSON.parse(JSON.stringify(await jsonata(config.template!).evaluate({ event: { value } })));
      const ready = await evaluate({
        status: 'resolved',
        records: [
          { metadata: { title: 'Activity A', startDate: '2026-02-01', endDate: '2026-03-01' } },
          { metadata: { title: 'Activity B', startDate: '2027-02-01', endDate: '2027-03-01' } },
        ],
      });
      if (field.name === 'activityTitle') assert.equal(ready, 'Activity A');
      if (field.name === 'activityDates') assert.deepEqual(ready, { startDate: '2026-02-01', endDate: '2026-03-01' });
      if (field.name === 'activitySummaries')
        assert.deepEqual(
          ready.map((row: any) => row.title),
          ['Activity A', 'Activity B']
        );
      for (const status of ['empty', 'unavailable', 'failed']) {
        const empty = await evaluate({ status, records: [] });
        const loading = await evaluate({
          status: 'resolved',
          loading: true,
          records: [{ metadata: { title: 'Old' } }],
        });
        const expected =
          field.name === 'activityTitle' ? '' : field.name === 'activityDates' ? { startDate: '', endDate: '' } : [];
        assert.deepEqual(empty, expected);
        assert.deepEqual(loading, expected);
      }
    }
  });

  it('matches separate new-form read/write evidence reports', async () => {
    for (const type of ['related-plan', 'related-activity']) {
      const name = `${type}-1.0-draft`;
      const report = await runRecordSchemaRolloutEvidence({
        forms: [{ id: `dev-hook/${name}`, form: FormConfigExports[name] }],
        approvedReportPath: path.join(__dirname, 'snapshots', `${name}.json`),
      });
      assert.equal(report.summary.formsChecked, 1);
      assert.equal(report.summary.schemasChecked, 2);
      assert.equal(report.summary.unsupportedComponents, 0);
    }
  });

  it('keeps all eight pre-existing forms matching their aggregate evidence entries', async () => {
    const forms = Object.entries(FormConfigExports)
      .filter(([name]) => !name.startsWith('related-'))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, form]) => ({ id: `dev-hook/${name}`, form, reusableFormDefinitions }));
    const report = await generateRecordSchemaRolloutEvidence({ forms });
    const aggregate = JSON.parse(
      readFileSync(path.join(__dirname, '../../redbox-core/test/snapshots/record-schema-shadow-rollout.json'), 'utf8')
    );
    const existingIds = new Set(forms.map(item => item.id));
    assert.equal(report.summary.formsChecked, 8);
    assert.deepEqual(
      report.schemas,
      aggregate.schemas.filter((entry: { form: string }) => existingIds.has(entry.form))
    );
    assert.deepEqual(
      report.schemaDiagnostics,
      aggregate.schemaDiagnostics.filter((entry: { form: string }) => existingIds.has(entry.form))
    );
  });

  it('keeps outbound operations off and PDF readiness scoped to the example operation', () => {
    assert.equal(relatedPlanEmail.options!.triggerCondition, '<%= false %>');
    assert.equal(relatedPlanDoi.options!.triggerCondition, '<%= false %>');
    assert.equal(relatedPlanDoiProfile.enabled, false);
    assert.equal(relatedPlanPdf.waitForRelatedData, true);
    const query = namedQuery.queries!.relatedPlansByActivityDate;
    assert.equal(query.relatedRecordFilters![0].relationId, 'activities');
    assert.equal(query.relatedRecordFilters![0].rootRecordType, 'related-plan');
    assert.equal(query.relatedRecordFilters![0].mongoQuery['metadata.startDate'], null);
  });
});
