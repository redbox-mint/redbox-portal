import supertest from 'supertest';

/** Obtain a real token even when only individual routes enable CSRF. */
export async function csrfToken(agent: supertest.Agent): Promise<string> {
  const response = await agent.get('/csrfToken').expect(200);
  const token = response.body._csrf;
  if (typeof token !== 'string' || !token) throw new Error('The integration session did not receive a CSRF token');
  return token;
}

/** Finish token requests before constructing a Supertest mutation request. */
export async function loginSession(username = 'admin', password = 'rbadmin'): Promise<supertest.Agent> {
  const agent = supertest.agent(sails.hooks.http.app);
  const token = await csrfToken(agent);
  const response = await agent.post('/user/login_local')
    .set('X-Source', 'jsclient')
    .set('X-CSRF-Token', token)
    .send({ username, password, branding: 'default', portal: 'rdmp' })
    .expect(200);
  if (response.body.user?.username !== username) throw new Error(`Could not establish the ${username} integration session`);
  return agent;
}
