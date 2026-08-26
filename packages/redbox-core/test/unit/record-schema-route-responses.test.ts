import assert from 'node:assert/strict';

import {
  getImmutableRecordSchemaRoute,
  recordSchemaApiRoutes,
  resolveCreateRecordSchemaRoute,
  resolveUpdateRecordSchemaRoute,
} from '../../src/api-routes/groups/record-schemas';
import {
  recordSchemaCanonicalLink,
  recordSchemaCreateResolverUrl,
  recordSchemaDescribedByLink,
  recordSchemaImmutableUrl,
  recordSchemaUpdateResolverUrl,
  RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
  RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
  RECORD_SCHEMA_RESPONSE_MEDIA_TYPE,
  RECORD_SCHEMA_RESPONSE_VARY,
} from '../../src/api-routes/record-schema-response';

describe('record-schema route response contracts', function () {
  const digest = 'a'.repeat(64);
  const etag = `"sha256:${digest}"`;
  const canonicalUrl = `/default/rdmp/api/records/schemas/${digest}`;
  const canonicalLink = recordSchemaCanonicalLink(canonicalUrl);

  it('formats an exact described-by Link value for save response discovery', function () {
    assert.equal(
      recordSchemaDescribedByLink(canonicalUrl),
      `<${canonicalUrl}>; rel="describedby"; type="application/schema+json"`
    );
  });

  it('builds public resolver URLs with canonical encoded route segments', function () {
    assert.equal(
      recordSchemaImmutableUrl('public brand', 'portal/subpath', digest),
      `/public%20brand/portal%2Fsubpath/api/records/schemas/${digest}`
    );
    assert.equal(
      recordSchemaCreateResolverUrl('public brand', 'portal/subpath', 'data set'),
      '/public%20brand/portal%2Fsubpath/api/records/schemas/create/data%20set'
    );
    assert.equal(
      recordSchemaUpdateResolverUrl('public brand', 'portal/subpath', 'record/1'),
      '/public%20brand/portal%2Fsubpath/api/records/schemas/update/record%2F1'
    );
  });

  it('accepts the optional strong conditional header on every schema GET route', function () {
    for (const route of recordSchemaApiRoutes) {
      assert.equal(route.request?.headers?.safeParse({}).success, true);
      assert.equal(route.request?.headers?.safeParse({ 'If-None-Match': etag }).success, true);
      assert.equal(route.request?.headers?.safeParse({ 'If-None-Match': [etag, etag] }).success, false);
    }
  });

  it('specifies the exact raw media type and representation headers for 200 and 304', function () {
    for (const route of recordSchemaApiRoutes) {
      const success = route.responses?.[200];
      assert.deepEqual(Object.keys(success?.content ?? {}), [RECORD_SCHEMA_RESPONSE_MEDIA_TYPE]);

      for (const status of [200, 304] as const) {
        const response = route.responses?.[status];
        const headers = response?.headers;
        assert.ok(headers);
        assert.equal(headers.ETag?.safeParse(etag).success, true);
        assert.equal(headers.ETag?.safeParse('W/' + etag).success, false);
        assert.equal(headers['Cache-Control']?.safeParse(RECORD_SCHEMA_RESPONSE_CACHE_CONTROL).success, true);
        assert.equal(headers['Cache-Control']?.safeParse('no-store').success, false);
        assert.equal(headers.Vary?.safeParse(RECORD_SCHEMA_RESPONSE_VARY).success, true);
        assert.equal(headers.Vary?.safeParse('Cookie').success, false);

        const isResolver = route === resolveCreateRecordSchemaRoute || route === resolveUpdateRecordSchemaRoute;
        if (isResolver) {
          assert.equal(headers.Link?.safeParse(canonicalLink).success, true);
          assert.equal(headers.Link?.safeParse(`<${canonicalUrl}>; rel="describedby"`).success, false);
        } else {
          assert.equal(route, getImmutableRecordSchemaRoute);
          assert.equal(headers.Link, undefined);
        }
      }

      assert.equal(route.responses?.[304]?.content, undefined);
    }
  });

  it('specifies status-matched Problem Details schemas for every mapped and documented failure', function () {
    const problemStatuses = [400, 401, 403, 404, 409, 413, 422, 503] as const;

    for (const route of recordSchemaApiRoutes) {
      assert.deepEqual(
        Object.keys(route.responses ?? {})
          .map(Number)
          .sort((left, right) => left - right),
        [200, 304, ...problemStatuses].sort((left, right) => left - right)
      );
      for (const status of problemStatuses) {
        const response = route.responses?.[status];
        assert.deepEqual(Object.keys(response?.content ?? {}), [RECORD_SCHEMA_PROBLEM_MEDIA_TYPE]);
        const schema = response?.content?.[RECORD_SCHEMA_PROBLEM_MEDIA_TYPE]?.schema;
        assert.ok(schema);
        const problem = {
          type: 'https://redboxresearchdata.com/problems/record-schema-test',
          title: 'Stable title',
          status,
          detail: 'Safe detail.',
          instance: '/default/rdmp/api/records/schemas/test',
          code: 'record-schema.test',
        };
        assert.equal(schema.safeParse(problem).success, true);
        assert.equal(schema.safeParse({ ...problem, status: status === 400 ? 503 : 400 }).success, false);
        assert.equal(schema.safeParse({ ...problem, detail: undefined }).success, false);
      }
    }
  });
});
