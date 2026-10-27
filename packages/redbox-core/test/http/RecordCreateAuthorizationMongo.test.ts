import assert from 'node:assert/strict';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { mongoFixture } from './mongoFixture';
import { RecordTypes } from '../../src/recordTypes';
import { Services as Workflow } from '../../src/workflows/WorkflowSteps';
import { RecordCreateAuthorization } from '../../src/records/RecordCreateAuthorization';
import { hasEditAccess, hasTransitionRoleAuthorization } from '../../src/records/access';
import { getReferenceRepositories } from '../../src/persistence/reference/runtime';
import { BrandingModel } from '../../src/model/storage/BrandingModel';

describe('owned create/workflow authorization on Mongo', () => {
  let f: Awaited<ReturnType<typeof mongoFixture>>;
  let authorization: RecordCreateAuthorization;
  let brand: BrandingModel;
  let types: RecordTypes;
  before(async () => {
    f = await mongoFixture();
    brand = Object.assign(new BrandingModel(), f.brand, { roles: [f.role, f.reader] });
    types = new RecordTypes({
      repository: f.recordTypes,
      config: { appmode: {}, recordtype: { dataRecord: { packageType: 'dataRecord' } } },
      log: nothingLogger,
      storageCapability: () => undefined,
    });
    await types.initialize(brand);
    const refs = getReferenceRepositories(f.owner);
    const type = await refs.recordTypes.findByName(brand.id, 'dataRecord');
    for (const [name, transitionRoles] of [
      ['draft', []],
      ['review', ['Admin']],
    ] as const)
      await refs.workflows.createDefinition({
        name,
        recordType: type!.id,
        starting: name === 'draft',
        hidden: false,
        config: {
          form: 'dataRecord',
          authorization: { editRoles: ['Admin', 'Researcher'], transitionRoles: [...transitionRoles] },
        },
      });
    const workflows = new Workflow.WorkflowSteps({
      references: refs,
      config: { appmode: {}, workflow: {} },
      log: nothingLogger,
      initialiseDashboardSettings: async () => {},
    });
    authorization = new RecordCreateAuthorization({
      recordTypes: types,
      workflows,
      hasEditAccess,
      hasTransitionRoleAuthorization,
    });
  });
  after(async () => {
    await types?.close();
    await f?.close();
  });
  async function allowed(step: string, roles = [f.role], scope: unknown = brand) {
    return authorization.hasCreateAccess(scope, { username: f.user.username, roles }, roles, 'dataRecord', step);
  }
  it('loads stored type/workflows and permits the authorized starting step', async () => {
    assert.equal(await allowed('draft'), true);
    assert.equal(await allowed('review'), true);
  });
  it('requires target transition roles in addition to edit permission', async () => {
    assert.equal(await allowed('draft', [f.reader]), true);
    assert.equal(await allowed('review', [f.reader]), false);
  });
  it('rejects missing or malformed targets and another brand', async () => {
    assert.equal(await allowed('missing'), false);
    assert.equal(await allowed('../draft'), false);
    assert.equal(await allowed('draft', [f.role], f.otherBrand), false);
  });
  it('does not let submitted actor metadata grant create permission', async () => {
    assert.equal(
      await authorization.hasCreateAccess(
        brand,
        { username: 'unprivileged', authorization: { edit: ['unprivileged'] } },
        [],
        'dataRecord',
        'draft'
      ),
      false
    );
  });
});
