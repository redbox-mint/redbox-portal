import supertest from 'supertest';
import { firstValueFrom } from 'rxjs';
import * as sinon from 'sinon';
import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';

describe('Record Management: finalise route form switching', function () {
  this.timeout(60_000);
  const sourceStage = 'finalise-regression-source';
  const aliasStep = 'finalise-regression-review-step';
  const aliasStage = 'finalise-regression-under-review';
  const sourceForm = 'finalise-regression-source-form';
  const destinationStage = 'finalise-regression-finalised';
  const destinationAliasStep = 'finalise-regression-completed-step';
  const destinationAliasStage = 'finalise-regression-completed';
  const destinationForm = 'finalise-regression-finalised-form';
  const oid = `finalise-regression-${Date.now()}`;
  const tabOids = [`${oid}-tab-a`, `${oid}-tab-b`];
  const operationOid = `${oid}-operation`;
  const aliasOid = `${oid}-alias`;
  const contractOid = `${oid}-source-contract`;
  const destinationAliasOid = `${oid}-destination-alias`;
  const conflictOid = `${oid}-conflict`;
  const recordOids = [oid, ...tabOids, operationOid, aliasOid, contractOid, destinationAliasOid, conflictOid];
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
            finaliseTransition: {
              label: 'Finalise transition',
              enabledValidationGroups: [],
              allowedTargetSteps: [destinationStage, destinationAliasStep],
            },
            finaliseSourceOnly: {
              label: 'Source only',
              enabledValidationGroups: [],
              allowedTargetSteps: [destinationStage],
            },
          },
          componentDefinitions: [
            ...finaliseConfiguration.componentDefinitions,
            {
              name: 'finaliseNotes',
              component: { class: 'SimpleInputComponent' },
              model: { class: 'SimpleInputModel' },
            },
            {
              name: 'finaliseRegressionButton',
              component: {
                class: 'SaveButtonComponent',
                config: { operation: 'finaliseTransition', targetStep: destinationStage },
              },
            },
          ],
        },
      }
    );
    await Form.create({
      name: sourceForm,
      branding: brand.id,
      configuration: { name: sourceForm, type: 'rdmp', componentDefinitions: [] },
    });
    await Form.create({
      name: destinationForm,
      branding: brand.id,
      configuration: {
        name: destinationForm,
        type: 'rdmp',
        validationGroups: {
          all: { description: 'All validators', initialMembership: 'all' },
          none: { description: 'No validators', initialMembership: 'none' },
        },
        validationOperations: {
          finaliseTransition: { enabledValidationGroups: ['all'], allowedTargetSteps: [destinationStage] },
        },
        componentDefinitions: [
          {
            name: 'finaliseConfirmation',
            component: { class: 'SimpleInputComponent' },
            model: { class: 'SimpleInputModel', config: { validators: [{ class: 'required' }] } },
          },
        ],
      },
    });
    await WorkflowStep.create({
      name: destinationStage,
      recordType: recordType.id,
      config: {
        form: destinationForm,
        workflow: { stage: destinationStage, stageLabel: 'Finalise regression finalised' },
        authorization: { viewRoles: ['Admin'], editRoles: ['Admin'], transitionRoles: ['Admin'] },
      },
      starting: false,
      hidden: false,
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
    await WorkflowStep.create({
      name: destinationAliasStep,
      recordType: recordType.id,
      config: {
        form: destinationForm,
        workflow: { stage: destinationAliasStage },
        authorization: { viewRoles: ['Admin'], editRoles: ['Admin'], transitionRoles: ['Admin'] },
      },
      starting: false,
      hidden: false,
    });
    await WorkflowStep.create({
      name: aliasStep,
      recordType: recordType.id,
      config: {
        form: sourceForm,
        workflow: { stage: aliasStage, next: ['draft', destinationStage] },
        authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
      },
      starting: false,
      hidden: true,
    });
    for (const recordOid of recordOids) {
      const created = await sails.services.mongostorageservice.create(
        brand,
        {
          redboxOid: recordOid,
          metadata: { title: 'Finalise regression' },
          metaMetadata: { type: 'rdmp', brandId: brand.id, form: sourceForm, attachmentFields: [] },
          workflow: { stage: [aliasOid, contractOid].includes(recordOid) ? aliasStage : sourceStage },
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
    await Record.destroy({ redboxOid: recordOids });
    await RecordAudit.destroy({ redboxOid: recordOids });
    await WorkflowStep.destroy({
      name: [sourceStage, aliasStep, destinationStage, destinationAliasStep],
      recordType: recordType.id,
    });
    await Form.destroy({ name: [sourceForm, destinationForm], branding: brand.id });
  });

  it('rejects an ineligible alternate form before rendering the finalise page', async function () {
    const criteria = { name: sourceStage, recordType: recordType.id };
    const step = await WorkflowStep.findOne(criteria);
    try {
      await WorkflowStep.update(criteria, {
        config: { ...step.config, workflow: { ...step.config.workflow, next: [] } },
      });

      const rejected = await agent
        .get(`/default/rdmp/record/finalise/rdmp/edit/${operationOid}`)
        .set('X-ReDBox-Api-Version', '2.0')
        .expect(409);
      expect(JSON.stringify(rejected.body)).to.include('form-definition-changed');
      expect(rejected.text).not.to.include('<dmp-form');
    } finally {
      await WorkflowStep.update(criteria, { config: step.config });
    }
  });

  it('loads and saves from a persisted stage differing from its workflow step name', async function () {
    const validationConfig = sails.config.recordValidation;
    sails.config.recordValidation = { ...validationConfig, mode: 'enforce' };
    try {
      await agent.get(`/default/rdmp/record/finalise/rdmp/edit/${aliasOid}`).expect(200);
      const delivered = await agent
        .get(`/default/rdmp/record/form/rdmp/${aliasOid}`)
        .set('X-ReDBox-Api-Version', '2.0')
        .query({ edit: 'true', formName: 'default-1.0-draft', targetStep: destinationStage })
        .expect(200);
      expect(delivered.body.meta.validationOperations).to.deep.equal([
        { name: 'finaliseTransition', allowedTargetSteps: [destinationStage] },
      ]);
      const original = await sails.services.recordsservice.getMeta(aliasOid);
      expect(original.workflow.stage).to.equal(aliasStage);
      expect(original.metaMetadata.form).to.equal(sourceForm);
      const save = (metadata: object) =>
        agent
          .put(`/default/rdmp/recordmeta/${aliasOid}`)
          .query({ targetStep: destinationStage, operation: 'finaliseTransition' })
          .set('X-Source', 'jsclient')
          .set('X-ReDBox-Api-Version', '2.0')
          .set('If-Match', delivered.headers.etag)
          .set('X-ReDBox-Form-Fingerprint', delivered.body.meta.formFingerprint)
          .send(metadata);
      const missing = await save({ title: 'Missing confirmation from an alias stage' }).expect(400);
      expect(JSON.stringify(missing.body)).to.include('record-validation-failed');
      expect(JSON.stringify(missing.body)).to.include('finaliseConfirmation');
      expect((await sails.services.recordsservice.getMeta(aliasOid)).revision).to.equal(original.revision);
      await save({ title: 'Finalised from a persisted stage alias', finaliseConfirmation: 'Confirmed' }).expect(200);
      const saved = await sails.services.recordsservice.getMeta(aliasOid);
      expect(saved.workflow.stage).to.equal(destinationStage);
      expect(saved.metaMetadata.form).to.equal(destinationForm);
      expect(saved.revision).to.equal(original.revision + 1);
    } finally {
      sails.config.recordValidation = validationConfig;
    }
  });

  it('uses the route source contract for enforced no-target operations and declared-field schemas', async function () {
    const validationConfig = sails.config.recordValidation;
    const schemaConfig = sails.config.recordSchema;
    const criteria = { name: 'default-1.0-draft', branding: brand.id };
    const configured = await Form.findOne(criteria);
    sails.config.recordValidation = { ...validationConfig, mode: 'enforce' };
    sails.config.recordSchema = { ...schemaConfig, enabled: true, unknownProperties: 'declared' };
    try {
      await Form.update(criteria, {
        configuration: {
          name: 'default-1.0-draft',
          type: 'rdmp',
          validationOperations: { finaliseDraftSave: { enabledValidationGroups: ['all'] } },
          componentDefinitions: [
            {
              name: 'finaliseNotes',
              component: { class: 'SimpleInputComponent' },
              model: { class: 'SimpleInputModel', config: { validators: [{ class: 'required' }] } },
            },
          ],
        },
      });
      await agent.get(`/default/rdmp/record/finalise/rdmp/edit/${contractOid}`).expect(200);
      const delivered = await agent
        .get(`/default/rdmp/record/form/rdmp/${contractOid}`)
        .set('X-ReDBox-Api-Version', '2.0')
        .query({ edit: 'true', formName: 'default-1.0-draft' })
        .expect(200);
      expect(
        delivered.body.meta.validationOperations.some(operation => operation.name === 'finaliseDraftSave')
      ).to.equal(true);
      const original = await sails.services.recordsservice.getMeta(contractOid);
      const save = (metadata: object, fingerprint = delivered.body.meta.formFingerprint) =>
        agent
          .put(`/default/rdmp/recordmeta/${contractOid}`)
          .query({ operation: 'finaliseDraftSave' })
          .set('X-Source', 'jsclient')
          .set('X-ReDBox-Api-Version', '2.0')
          .set('If-Match', delivered.headers.etag)
          .set('X-ReDBox-Form-Fingerprint', fingerprint)
          .send(metadata);
      await save({ finaliseNotes: 'No grant may be manufactured' }, `route:sha256:${'0'.repeat(64)}`).expect(409);
      const rejected = await save({ undeclaredFinaliseField: 'Still prohibited' }).expect(400);
      expect(JSON.stringify(rejected.body)).to.include('record-schema');
      const missing = await save({}).expect(400);
      expect(JSON.stringify(missing.body)).to.include('record-validation-failed');
      expect((await sails.services.recordsservice.getMeta(contractOid)).revision).to.equal(original.revision);
      await save({ finaliseNotes: 'Saved using the authorized source contract' }).expect(200);
      const saved = await sails.services.recordsservice.getMeta(contractOid);
      expect(saved.metadata.finaliseNotes).to.equal('Saved using the authorized source contract');
      expect(saved.workflow.stage).to.equal(aliasStage);
      expect(saved.metaMetadata.form).to.equal(sourceForm);
      expect(saved.revision).to.equal(original.revision + 1);
    } finally {
      sails.config.recordValidation = validationConfig;
      sails.config.recordSchema = schemaConfig;
      await Form.update(criteria, { configuration: configured.configuration });
    }
  });

  it('persists a destination stage distinct from the canonical target name', async function () {
    const validationConfig = sails.config.recordValidation;
    sails.config.recordValidation = { ...validationConfig, mode: 'enforce' };
    try {
      await agent.get(`/default/rdmp/record/finalise/rdmp/edit/${destinationAliasOid}`).expect(200);
      const delivered = await agent
        .get(`/default/rdmp/record/form/rdmp/${destinationAliasOid}`)
        .set('X-ReDBox-Api-Version', '2.0')
        .query({ edit: 'true', formName: 'default-1.0-draft' })
        .expect(200);
      await agent
        .put(`/default/rdmp/recordmeta/${destinationAliasOid}`)
        .query({ targetStep: destinationAliasStep })
        .set('X-Source', 'jsclient')
        .set('X-ReDBox-Api-Version', '2.0')
        .set('If-Match', delivered.headers.etag)
        .set('X-ReDBox-Form-Fingerprint', delivered.body.meta.formFingerprint)
        .send({ finaliseConfirmation: 'Confirmed' })
        .expect(200);
      const saved = await sails.services.recordsservice.getMeta(destinationAliasOid);
      expect(saved.workflow.stage).to.equal(destinationAliasStage);
      expect(saved.metaMetadata.form).to.equal(destinationForm);
    } finally {
      sails.config.recordValidation = validationConfig;
    }
  });

  it('disables rebase after a storage race involving alternate-form-only metadata', async function () {
    await agent.get(`/default/rdmp/record/finalise/rdmp/edit/${conflictOid}`).expect(200);
    const formUrl = `/default/rdmp/record/form/rdmp/${conflictOid}`;
    const query = { edit: 'true', formName: 'default-1.0-draft' };
    const delivered = await agent.get(formUrl).set('X-ReDBox-Api-Version', '2.0').query(query).expect(200);
    const storage = sails.services.mongostorageservice;
    const originalUpdate = storage.updateMeta;
    const update = sinon.stub(storage, 'updateMeta').callsFake(async (...args) => {
      const current = await sails.services.recordsservice.getMeta(conflictOid);
      const winner = await originalUpdate.call(
        storage,
        brand,
        conflictOid,
        {
          ...current,
          metadata: { ...current.metadata, finaliseNotes: 'Concurrent winner' },
        },
        { username: 'admin' }
      );
      expect(winner.success).to.equal(true);
      return originalUpdate.apply(storage, args);
    });
    try {
      const stale = await agent
        .put(`/default/rdmp/recordmeta/${conflictOid}`)
        .query({ targetStep: 'draft' })
        .set('X-Source', 'jsclient')
        .set('X-ReDBox-Api-Version', '2.0')
        .set('If-Match', delivered.headers.etag)
        .set('X-ReDBox-Form-Fingerprint', delivered.body.meta.formFingerprint)
        .send({ finaliseNotes: 'Stale browser control' })
        .expect(412);
      expect(JSON.stringify(stale.body)).to.include('record-revision-stale');
      expect(stale.body.meta.concurrency.formFingerprint).to.equal(undefined);
      expect((await sails.services.recordsservice.getMeta(conflictOid)).metadata.finaliseNotes).to.equal(
        'Concurrent winner'
      );
    } finally {
      update.restore();
    }
    const reloaded = await agent.get(formUrl).set('X-ReDBox-Api-Version', '2.0').query(query).expect(200);
    expect(reloaded.body).to.have.property('data');
    expect(JSON.stringify(reloaded.body)).to.include('Concurrent winner');
  });

  it('discovers and enforces named transition operations on a distinct destination form', async function () {
    const validationConfig = sails.config.recordValidation;
    sails.config.recordValidation = { ...validationConfig, mode: 'enforce' };
    try {
      await agent.get(`/default/rdmp/record/finalise/rdmp/edit/${operationOid}`).expect(200);
      const requestForm = (targetStep?: string) =>
        agent
          .get(`/default/rdmp/record/form/rdmp/${operationOid}`)
          .set('X-ReDBox-Api-Version', '2.0')
          .query({ edit: 'true', formName: 'default-1.0-draft', ...(targetStep ? { targetStep } : {}) });
      const delivered = await requestForm().expect(200);
      expect(delivered.body.meta.validationOperations).to.deep.include({
        name: 'finaliseTransition',
        label: 'Finalise transition',
        allowedTargetSteps: [destinationStage],
      });
      const sourceOnly = delivered.body.meta.validationOperations.find(item => item.name === 'finaliseSourceOnly');
      expect(sourceOnly).to.deep.equal({ name: 'finaliseSourceOnly', label: 'Source only' });
      const targeted = await requestForm(destinationStage).expect(200);
      expect(targeted.body.meta.validationOperations).to.deep.equal([
        { name: 'finaliseTransition', allowedTargetSteps: [destinationStage] },
      ]);
      const before = await sails.services.recordsservice.getMeta(operationOid);
      const save = (operation: string, metadata: object) =>
        agent
          .put(`/default/rdmp/recordmeta/${operationOid}`)
          .query({ targetStep: destinationStage, operation })
          .set('X-Source', 'jsclient')
          .set('X-ReDBox-Api-Version', '2.0')
          .set('If-Match', delivered.headers.etag)
          .set('X-ReDBox-Form-Fingerprint', delivered.body.meta.formFingerprint)
          .send(metadata);

      const unknown = await save('finaliseSourceOnly', {
        title: 'Source operation cannot authorise destination',
      }).expect(400);
      expect(JSON.stringify(unknown.body)).to.include('record-validation-operation-invalid');
      // The source operation enables no groups; the destination still requires confirmation.
      const invalid = await save('finaliseTransition', { title: 'Missing destination requirement' }).expect(400);
      expect(JSON.stringify(invalid.body)).to.include('record-validation-failed');
      expect(JSON.stringify(invalid.body)).to.include('finaliseConfirmation');
      const rejected = await sails.services.recordsservice.getMeta(operationOid);
      expect(rejected.revision).to.equal(before.revision);
      expect(rejected.workflow.stage).to.equal(sourceStage);
      expect(rejected.metaMetadata.form).to.equal(sourceForm);

      await save('finaliseTransition', { title: 'Named transition saved', finaliseConfirmation: 'Confirmed' }).expect(
        200
      );
      const saved = await sails.services.recordsservice.getMeta(operationOid);
      expect(saved.revision).to.equal(before.revision + 1);
      expect(saved.workflow.stage).to.equal(destinationStage);
      expect(saved.metaMetadata.form).to.equal(destinationForm);
      expect(saved.metadata.finaliseConfirmation).to.equal('Confirmed');
    } finally {
      sails.config.recordValidation = validationConfig;
    }
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
    expect(stale.body.meta.concurrency.formFingerprint).to.equal(undefined);
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
    const normal = await agent.get(formUrl).set('X-ReDBox-Api-Version', '2.0').query({ edit: 'true' }).expect(200);
    expect(normal.body.meta.formFingerprint).to.match(/^sha256:[0-9a-f]{64}$/);
    await agent
      .put(`/default/rdmp/recordmeta/${oid}`)
      .set('X-Source', 'jsclient')
      .set('X-ReDBox-Api-Version', '2.0')
      .set('If-Match', normal.headers.etag)
      .set('X-ReDBox-Form-Fingerprint', normal.body.meta.formFingerprint)
      .send({ title: 'Ordinary edit after finalisation' })
      .expect(200);
  });
});
