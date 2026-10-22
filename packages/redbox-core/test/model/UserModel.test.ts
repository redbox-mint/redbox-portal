import { UserWLDef } from '../../src/waterline-models/User';

let expect: Chai.ExpectStatic;

describe('User Waterline model', function () {
  before(async function () {
    const chai = await import('chai');
    expect = chai.expect;
  });

  it('allows a null token in the generated model so API keys can be revoked', function () {
    expect(UserWLDef.attributes.token).to.include({ type: 'string', allowNull: true });
  });
});
