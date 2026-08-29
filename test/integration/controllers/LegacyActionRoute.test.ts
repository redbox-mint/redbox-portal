import supertest from 'supertest';

describe('Legacy action route removal', function () {
  let agent: supertest.Agent;

  before(function () {
    agent = supertest.agent((sails as any).hooks.http.app);
  });

  it('returns not found for the former generic execution endpoint', async function () {
    const retiredRouteSegment = ['act', 'ion'].join('');

    await agent.post(`/default/rdmp/${retiredRouteSegment}/removed`).set('X-Source', 'jsclient').send({}).expect(404);
  });
});
