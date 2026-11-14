import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { referenceProductionFixture, referenceOrigin } from './referenceProductionFixture';
import { resumableUploadRoutes } from '../../../src/http/uploadRoutes';

if (!process.env.HTTP_PILOT_TEST_MONGO_URL || !process.env.HTTP_READ_SOLR_PORT)
  throw new Error('Disposable Mongo and Solr required for G5 observations.');

describe('FM-036 raw HTTP response observations', function () {
  this.timeout(60000);
  it('observes each hijacked TUS response once, including protocol refusals', async () => {
    let observationsFile = '';
    const f = await referenceProductionFixture(true, undefined, undefined, {
      declarations: resumableUploadRoutes,
      artifacts: async (_directory, provider) => {
        observationsFile = provider + '/raw-observations.cjs';
        await writeFile(
          observationsFile,
          `exports.responses=[];exports.errors=[];exports.hooks=[
          {name:'raw-response-metric',stage:'onResponse',scope:{kind:'application'},observe:async(request)=>{exports.responses.push(request)}},
          {name:'raw-error-metric',stage:'onError',scope:{kind:'application'},observe:async(request)=>{exports.errors.push(request)}}];`
        );
        const entry = provider + '/index.cjs';
        await writeFile(
          entry,
          (await readFile(entry, 'utf8')).replace(
            'apiVersion:',
            "hooks:require('./raw-observations.cjs').hooks,apiVersion:"
          )
        );
      },
    });
    const observations = require(observationsFile) as { responses: { statusCode: number }[]; errors: unknown[] };
    const wire = (target: string, method: string, extra: Record<string, string> = {}, bytes?: string) =>
      new Promise<{ status: number; location?: string }>((resolve, reject) => {
        const req = request(
          new URL(f.url).origin,
          {
            path: target,
            method,
            headers: {
              Authorization: 'Bearer pilot-api-token',
              Origin: referenceOrigin,
              'Tus-Resumable': '1.0.0',
              ...extra,
              ...(bytes ? { 'Content-Length': String(Buffer.byteLength(bytes)) } : {}),
            },
          },
          res => {
            res.resume();
            res.once('end', () => resolve({ status: res.statusCode!, location: res.headers.location }));
          }
        );
        req.once('error', reject);
        req.end(bytes);
      });
    try {
      const created = await wire('/portal/default/rdmp/record/reference-record/attach', 'POST', {
        'Upload-Length': '3',
      });
      assert.equal(created.status, 201);
      assert(created.location);
      assert.equal((await wire(created.location, 'HEAD')).status, 200);
      const patch = { 'Upload-Offset': '1', 'Content-Type': 'application/offset+octet-stream' };
      assert.equal((await wire(created.location, 'PATCH', patch, 'abc')).status, 409);
      assert.equal((await wire(created.location, 'PATCH', { ...patch, 'Upload-Offset': '0' }, 'abc')).status, 204);
      // Observation completion is retained after wire EOF and joined by stop.
      for (let i = 0; i < 100 && observations.responses.length < 4; i++) await delay(10);
      assert.equal(observations.responses.length, 4);
      assert.equal(observations.errors.length, 0, 'A protocol refusal is not a second framework exception');
    } finally {
      await f.close();
    }
  });
});
