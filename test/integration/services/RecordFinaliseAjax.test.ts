import supertest from 'supertest';
import { firstValueFrom } from 'rxjs';

describe('Record Management: finalise route form switching', function () {
  this.timeout(60_000);
  const sourceStage = 'finalise-regression-source';
  const sourceForm = 'finalise-regression-source-form';
  const oid = `finalise-regression-${Date.now()}`;
  let agent: supertest.Agent;
  let brand;
  let recordType;

  before(async function () {
    brand = BrandingService.getDefault();
    recordType = await firstValueFrom(RecordTypesService.get(brand, 'rdmp'));
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
    const created = await sails.services.mongostorageservice.create(
      brand,
      {
        redboxOid: oid,
        metadata: { title: 'Finalise regression' },
        metaMetadata: { type: 'rdmp', brandId: brand.id, form: sourceForm, attachmentFields: [] },
        workflow: { stage: sourceStage },
        authorization: { edit: ['admin'], view: ['admin'], editRoles: [], viewRoles: [] },
      },
      {},
      { username: 'admin' }
    );
    expect(created.success).to.equal(true);

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
    await Record.destroy({ redboxOid: oid });
    await RecordAudit.destroy({ redboxOid: oid });
    await WorkflowStep.destroy({ name: sourceStage, recordType: recordType.id });
    await Form.destroy({ name: sourceForm, branding: brand.id });
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
    const fingerprint = delivered.body.meta.formFingerprint;
    const current = await sails.services.recordsservice.getMeta(oid);
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
