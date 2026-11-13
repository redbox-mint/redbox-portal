import { expect } from 'chai';
import { of } from 'rxjs';
import * as sinon from 'sinon';
import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import {
  runtimeReportingRegistry,
  projectReportingMetadata,
  resolveReportingPrincipal,
} from '../../src/reporting/runtime';
import { Services as FormServices } from '../../src/services/FormsService';
import { Services as ProjectionServices } from '../../src/services/FormRecordConsistencyService';
import { configuration, recordTypes, principal, storedRecord, installReportingTestSails } from './fixtures';

const text = (name: string): FormConfigFrame['componentDefinitions'][number] => ({
  name,
  constraints: { allowModes: ['view', 'edit'] },
  component: { class: 'SimpleInputComponent' },
  model: { class: 'SimpleInputModel', config: { defaultValue: '' } },
});
const outline: FormConfigFrame = {
  name: 'rdmp-view',
  type: 'rdmp',
  componentDefinitions: [
    text('faculty'),
    { ...text('sensitiveData'), constraints: { authorization: { allowRoles: ['Admin'] } } },
    { ...text('amount'), constraints: { allowModes: ['edit'] } },
  ],
};
describe('Reporting runtime form and identity boundaries', () => {
  const names = ['FormsService', 'FormRecordConsistencyService', 'User', 'UsersService', 'BrandingService'];
  let originals: Map<string, unknown>;
  let restoreSails: () => void;
  beforeEach(() => {
    originals = new Map(names.map(name => [name, Reflect.get(globalThis, name)]));
    restoreSails = installReportingTestSails();
    sails.config = {
      ...sails.config,
      reporting: configuration,
      recordtype: recordTypes,
      reusableFormDefinitions: {},
      validators: { definitions: [] },
    };
    const forms = new FormServices.Forms();
    sinon.stub(forms, 'getFormByName').callsFake(() =>
      of({
        name: 'rdmp-view',
        configuration: structuredClone(outline),
      } as import('../../src/waterline-models').FormAttributes)
    );
    Reflect.set(globalThis, 'FormsService', forms);
    Reflect.set(globalThis, 'FormRecordConsistencyService', new ProjectionServices.FormRecordConsistency());
  });
  afterEach(() => {
    sinon.restore();
    restoreSails();
    for (const [name, value] of originals) {
      if (value === undefined) Reflect.deleteProperty(globalThis, name);
      else Reflect.set(globalThis, name, value);
    }
  });
  it('derives metadata access from real effective view-form constraints', async () => {
    const fields = await runtimeReportingRegistry(principal, 'rdmp');
    expect([...fields.fields.keys()]).to.deep.equal(['created', 'faculty', 'workflowStage']);
    const metadata = await projectReportingMetadata(principal, storedRecord());
    expect(metadata).to.deep.equal({ faculty: 'A' });
  });
  it('does not expose aggregate metadata from record-dependent question-tree forms', async () => {
    const conditional: FormConfigFrame = {
      ...outline,
      componentDefinitions: [
        ...outline.componentDefinitions,
        { name: 'branch', component: { class: 'QuestionTreeComponent' } },
      ],
    };
    sinon.restore();
    sinon
      .stub(FormsService, 'getFormByName')
      .returns(
        of({ name: 'rdmp-view', configuration: conditional } as import('../../src/waterline-models').FormAttributes)
      );
    const fields = await runtimeReportingRegistry(principal, 'rdmp');
    expect([...fields.fields.keys()]).to.deep.equal(['created', 'workflowStage']);
  });
  it('fails closed when a configured form is missing instead of exposing raw metadata', async () => {
    sinon.restore();
    sinon.stub(FormsService, 'getFormByName').returns(of(null));
    const fields = await runtimeReportingRegistry(principal, 'rdmp');
    expect([...fields.fields.keys()]).to.deep.equal(['created', 'workflowStage']);
    try {
      await projectReportingMetadata(principal, storedRecord());
      throw new Error('Expected unavailable');
    } catch (error) {
      expect(error).to.have.property('code', 'UNAVAILABLE');
    }
  });
  it('loads the exact authenticated user ID, refreshes effective roles and blocks disabled identities', async () => {
    const findOne = sinon.stub().returns({ populate: sinon.stub().resolves(principal.user) });
    const effective = sinon.stub().returns(of(principal.user));
    Reflect.set(globalThis, 'User', { findOne });
    Reflect.set(globalThis, 'UsersService', { getEffectiveUser: effective });
    Reflect.set(globalThis, 'BrandingService', { getBrand: sinon.stub().returns(principal.brand) });
    const resolved = await resolveReportingPrincipal('a', 'alice-id');
    expect(findOne.firstCall.args).to.deep.equal([{ id: 'alice-id' }]);
    expect(resolved.user).to.equal(principal.user);
    findOne.returns({ populate: sinon.stub().resolves({ ...principal.user, loginDisabled: true }) });
    try {
      await resolveReportingPrincipal('a', 'alice-id');
      throw new Error('Expected blocked');
    } catch (error) {
      expect(error).to.have.property('code', 'AUTHENTICATION_REQUIRED');
    }
    expect(effective.calledOnce).to.equal(true);
  });
});
