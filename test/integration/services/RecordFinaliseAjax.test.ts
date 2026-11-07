import supertest from 'supertest';
import { firstValueFrom } from 'rxjs';
import * as sinon from 'sinon';
import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';

describe('Record Management: finalise route form switching', function () {
  this.timeout(60_000);
  const sourceStage = 'finalise-regression-source';
  const sourceForm = 'finalise-regression-source-form';
  const oid = `finalise-regression-${Date.now()}`;
  const tabOids = [`${oid}-tab-a`, `${oid}-tab-b`];
  let agent: supertest.Agent;
  let brand;
  let recordType;
  let finaliseConfiguration: FormConfigFrame | undefined;

  before(async function () {
    brand = BrandingService.getDefault();
    recordType = await firstValueFrom(RecordTypesService.get(brand, 'rdmp'));
    const finaliseForm = await firstValueFrom(FormsService.getFormByName('default-1.0-draft', true, String(brand.id)));
    if (!finaliseForm?.configuration) throw new Error('The default finalise form is missing.');
    finaliseConfiguration = finaliseForm.configuration;
    await Form.update(
      { name: 'default-1.0-draft', branding: brand.id },
      {
        configuration: {
          ...finaliseConfiguration,
          validationOperations: {
            ...finaliseConfiguration.validationOperations,
            finaliseRegression: { label: 'Finalise regression', enabledValidationGroups: ['all'] },
          },
        },
      }
    );
    await Form.create({
      name: sourceForm,
      branding: brand.id,
      configuration: { name: sourceForm, type: 'rdmp', componentDefinitions: [] },
    });
    await WorkflowStep.create({
      name: sourceStage,
      recordType: recordType.id,
      config: {
        form: sourceForm,
        workflow: { stage: sourceStage, stageLabel: 'Finalise regression source' },
        authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
      },
      starting: false,
      hidden: true,
    });
    for (const recordOid of [oid, ...tabOids]) {
      const created = await sails.services.mongostorageservice.create(
        brand,
        {
          redboxOid: recordOid,
          metadata: { title: 'Finalise regression' },
          metaMetadata: { type: 'rdmp', brandId: brand.id, form: sourceForm, attachmentFields: [] },
          workflow: { stage: sourceStage },
          authorization: { edit: ['admin'], view: ['admin'], editRoles: [], viewRoles: [] },
        },
        {},
        { username: 'admin' }
      );
      expect(created.success).to.equal(true);
    }

    agent = supertest.agent(sails.hooks.http.app);
    await agent
      .post('/user/login_local')
      .set('X-Source', 'jsclient')
      .send({
        username: 'admin',
        password: 'rbadmin',
        branding: 'default',
        portal: 'rdmp',
      })
      .expect(200);
  });

  after(async function () {
    if (finaliseConfiguration) {
      await Form.update({ name: 'default-1.0-draft', branding: brand.id }, { configuration: finaliseConfiguration });
    }
    await Record.destroy({ redboxOid: [oid, ...tabOids] });
    await RecordAudit.destroy({ redboxOid: [oid, ...tabOids] });
    await WorkflowStep.destroy({ name: sourceStage, recordType: recordType.id });
    await Form.destroy({ name: sourceForm, branding: brand.id });
  });

  it('keeps grants for overlapping tabs and a reopened route through the configured session store', async function () {
    const records = sails.services.recordsservice;
    const originalGetMeta = records.getMeta;
    let arrived = 0;
    let release!: () => void;
    const bothRequests = new Promise<void>(resolve => {
      release = resolve;
    });
    const getMeta = sinon.stub(records, 'getMeta').callsFake(async (...args) => {
      if (typeof args[0] === 'string' && tabOids.includes(args[0])) {
        if (++arrived === 2) release();
        // Hold both edit requests after they have loaded their session snapshots.
        await bothRequests;
      }
      return originalGetMeta.apply(records, args);
    });
    try {
      await Promise.all(tabOids.map(id => agent.get(`/default/rdmp/record/finalise/rdmp/edit/${id}`).expect(200)));
      expect(arrived).to.equal(2);
    } finally {
      release();
      getMeta.restore();
    }
    const delivered = await Promise.all(
      tabOids.map(id =>
        agent
          .get(`/default/rdmp/record/form/rdmp/${id}`)
          .set('X-ReDBox-Api-Version', '2.0')
          .query({ edit: 'true', formName: 'default-1.0-draft' })
          .expect(200)
      )
    );
    // Tab A saves before the newly opened tab requests its form.
    await agent.get(`/default/rdmp/record/finalise/rdmp/edit/${tabOids[0]}`).expect(200);
    await Promise.all(
      tabOids.map((id, index) =>
        agent
          .put(`/default/rdmp/recordmeta/${id}?targetStep=draft`)
          .set('X-Source', 'jsclient')
          .set('X-ReDBox-Api-Version', '2.0')
          .set('If-Match', delivered[index].headers.etag)
          .set('X-ReDBox-Form-Fingerprint', delivered[index].body.meta.formFingerprint)
          .send({ title: 'Saved from overlapping tabs' })
          .expect(200)
      )
    );
    for (const id of tabOids) {
      const saved = await records.getMeta(id);
      expect(saved.metaMetadata.form).to.equal('default-1.0-draft');
      expect(saved.workflow.stage).to.equal('draft');
    }
  });

  it('requires the route grant and retains form and revision checks across a persisted transition', async function () {
    const formUrl = `/default/rdmp/record/form/rdmp/${oid}`;
    const formQuery = { edit: 'true', formName: 'default-1.0-draft' };
    const requestForm = () => agent.get(formUrl).set('X-ReDBox-Api-Version', '2.0').query(formQuery);
    const denied = await requestForm().expect(409);
    expect(JSON.stringify(denied.body)).to.include('form-definition-changed');

    await agent.get(`/default/rdmp/record/finalise/rdmp/edit/${oid}`).expect(200);
    const delivered = await requestForm().expect(200);
    expect(delivered.body.meta.formName).to.equal('default-1.0-draft');
    expect(delivered.body.meta.validationOperations).to.deep.include({
      name: 'finaliseRegression',
      label: 'Finalise regression',
      allowedTargetSteps: ['draft'],
    });
    const fingerprint = delivered.body.meta.formFingerprint;
    const current = await sails.services.recordsservice.getMeta(oid);
    expect(current.metaMetadata.form).to.equal(sourceForm);
    expect(current.workflow.stage).to.equal(sourceStage);
    const concurrent = await sails.services.mongostorageservice.updateMeta(
      brand,
      oid,
      {
        ...current,
        metadata: { ...current.metadata, title: 'Concurrent edit' },
      },
      { username: 'admin' }
    );
    expect(concurrent.success).to.equal(true);
    const save = (tag: string, formFingerprint: string) =>
      agent
        .put(`/default/rdmp/recordmeta/${oid}?targetStep=draft`)
        .set('X-Source', 'jsclient')
        .set('X-ReDBox-Api-Version', '2.0')
        .set('If-Match', tag)
        .set('X-ReDBox-Form-Fingerprint', formFingerprint)
        .send({ title: 'Finalise regression saved' });

    const stale = await save(delivered.headers.etag, fingerprint).expect(412);
    expect(JSON.stringify(stale.body)).to.include('record-revision-stale');
    const refreshed = await requestForm().expect(200);
    const etag = refreshed.headers.etag;
    const tampered = await save(etag, `sha256:${'0'.repeat(64)}`).expect(409);
    expect(JSON.stringify(tampered.body)).to.include('form-definition-changed');
    await save(etag, fingerprint).expect(200);

    const saved = await sails.services.recordsservice.getMeta(oid);
    expect(saved.workflow.stage).to.equal('draft');
    expect(saved.metaMetadata.form).to.equal('default-1.0-draft');
    expect(saved.metadata.title).to.equal('Finalise regression saved');
    expect(saved.revision).to.equal(current.revision + 2);
    await agent.get(formUrl).set('X-ReDBox-Api-Version', '2.0').query({ edit: 'true' }).expect(200);
  });
});
