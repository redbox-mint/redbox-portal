import assert from 'node:assert/strict';
import sinon from 'sinon';


import path from 'node:path';
import { executeNamedQueryRoute } from '../../src/api-routes/groups/reports';
import { sendNotificationRoute } from '../../src/api-routes/groups/notifications';
import { validateApiRouteRequest } from '../../src/api-routes/validation';
import { buildOpenApiDocument } from '../../src/api-routes/openapi';
let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));

describe('Named query and notification parameters through owned HTTP', function () {

it('documents pagination and configured query parameters in OpenAPI', () => {
    const document = buildOpenApiDocument([executeNamedQueryRoute], { title: 'Reports', version: '1.0.0' });
    const operation = document.paths['/{branding}/{portal}/api/report/namedQuery'].get;
    assert.match(operation.description, /queryParams/);
    assert(Array.isArray(operation.parameters));
  });
it('rejects non-string replyTo before delivery', () => {
    assert.equal(
      validateApiRouteRequest(
        { body: { to: 'to@example.com', template: 'test', otherSendOptions: { replyTo: { path: '/etc/passwd' } } } },
        sendNotificationRoute
      ).valid,
      false
    );
  });
afterEach(() => sinon.restore());
});
