import type supertest from 'supertest';

/** Obtain a token bound to this agent's real server-side session. */
export async function csrf(agent: supertest.Agent): Promise<string> {
  const response = await agent.get('/csrfToken').expect(200);
  return response.body._csrf;
}
