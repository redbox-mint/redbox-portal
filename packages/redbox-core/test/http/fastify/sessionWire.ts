import type { Result } from './sessionDifferential';
/** Volatile signed credentials become continuity identities. All other native
 * body fields and non-volatile headers remain in the full wire expectation. */
export function sessionWire(result: Result, identity: (id: string | null) => unknown) {
  const { date, connection, 'keep-alive': keepAlive, ...headers } = result.headers;
  const id = identity(result.body.id);
  const body = { ...result.body };
  if (Object.hasOwn(body, 'id')) Reflect.set(body, 'id', id);
  if (body.credential) body.credential = '<credential:' + id + '>';
  if (body.events) body.events = body.events.map((event: any) => ({ ...event, id: identity(event.id) }));
  if (headers['set-cookie'])
    headers['set-cookie'] = headers['set-cookie'].map(value =>
      value.replace(/^([^=]+)=([^;]+)/, '$1=<credential:' + id + '>')
    );
  return { status: result.status, complete: result.complete, headers, body };
}
