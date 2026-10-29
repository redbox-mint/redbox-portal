import assert from 'node:assert/strict';
import { FieldDescriptionsService, RoleModel, UserModel, type BrandingModel } from '@researchdatabox/redbox-core';

// Run through the standard lifted Mocha harness: real workflow ACLs and effective form construction.
describe('FieldDescriptionsService with the lifted portal', function () {
  it('describes an authorized stage and rejects cross-brand callers before any form fallback', async function () {
    const brand: BrandingModel = BrandingService.getDefault();
    const user = new UserModel();
    user.id = 'field-description-admin';
    user.username = 'admin';
    user.name = 'Field description admin';
    user.email = 'fields@example.test';
    user.roles = [RolesService.getRole(brand, 'Admin') as RoleModel];
    const caller = { brand, user };
    const service = new FieldDescriptionsService.Services.FieldDescriptions();
    const targets = await service.schemaTargets(brand, caller);
    const type = targets.recordTypes.find(target => target.id === 'rdmp');
    assert.ok(type);
    const stage = type.stages.find(step => step.starting) ?? type.stages[0];
    assert.ok(stage);
    const result = await service.describeFields(brand, 'rdmp', caller, type.id, stage.id);
    assert.ok(result.fields.length);
    assert.ok(result.fields.some(field => field.path === 'title'));
    assert.ok(['record-schema', 'form-config'].includes(result.precision));
    assert.equal(Object.hasOwn(result, 'document'), false);
    await assert.rejects(
      service.describeFields(brand, 'rdmp', { ...caller, brand: { ...brand, id: 'foreign' } }, type.id, stage.id),
      { code: 'FORBIDDEN' }
    );
  });
});
