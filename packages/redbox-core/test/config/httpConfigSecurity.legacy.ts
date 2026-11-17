import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import express from 'express';
import supertest from 'supertest';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { ApplicationRuntime } from '../../src/application';
import { escapeHtmlText } from '@researchdatabox/sails-ng-common';
import {
  buildCompanionSendTokenConfig,
  buildCompanionSendTokenHtml,
  isImmutableAssetPath,
  PageArtifacts,
  mountStaticPageArtifacts,
  applyPageHeaders,
  ExpressHost,
  HttpIdentity,
  prepareHttpMiddleware,
  httpErrorHandler,
} from '../../src/http/express';

let expect!: Chai.ExpectStatic;
describe('HTTP config security helpers', function () {
  before(async () => { ({expect} = await import('chai')); });
  describe('explicit raw parser mounts', () => {
    let host: ExpressHost;
    let url: string;
    afterEach(async () => host?.stop());
    async function fixture(exclusions: string[]) {
      const owner = { config: {}, log: nothingLogger };
      host = new ExpressHost(new ApplicationRuntime(owner), {
        owner,
        hostname: '127.0.0.1',
        port: 0,
        prepare: async router => {
          await prepareHttpMiddleware(router, {
            owner,
            identity: new HttpIdentity({
              one: async () => null,
              verifyPassword: async () => false,
              findByApiTokenHash: async () => null,
            }),
            session: { secret: 'parser-fixture-at-least-32-characters', cookie: { secure: false } },
            log: nothingLogger,
            parserExclusions: exclusions,
          });
          router.use(express.raw({ type: 'application/json' }));
          router.use((req, res) =>
            res.json({
              raw: Buffer.isBuffer(req.body),
              value: Buffer.isBuffer(req.body) ? req.body.toString() : req.body,
            })
          );
          router.use(httpErrorHandler(nothingLogger));
        },
      });
      await host.initialize();
      await host.activate();
      url = `http://127.0.0.1:${host.address()!.port}`;
    }
    async function post(pathname: string) {
      const response = await fetch(url + pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"value":"kept"}',
      });
      expect(response.status).to.equal(200);
      return response.json() as Promise<{ raw: boolean; value: unknown }>;
    }
    it('matches explicit raw mount boundaries, case and query/trailing slash handling', async () => {
      await fixture(['/default/rdmp/raw']);
      for (const pathname of [
        '/default/rdmp/raw',
        '/default/rdmp/raw/oid-1',
        '/DEFAULT/RDMP/raw?foo=bar',
        '/default/rdmp/raw/',
      ])
        expect((await post(pathname)).raw).to.equal(true);
      expect((await post('/default/rdmp/raw-other')).raw).to.equal(false);
      expect((await post('/raw')).raw).to.equal(false);
    });
    it('supports additional authored raw mounts beside upload mounts', async () => {
      await fixture(['/default/rdmp/raw', '/default/rdmp/hook/callback']);
      expect((await post('/default/rdmp/hook/callback')).raw).to.equal(true);
      expect((await post('/default/rdmp/raw')).raw).to.equal(true);
      expect((await post('/hook/callback')).raw).to.equal(false);
      expect((await post('/default/rdmp/hook/other')).raw).to.equal(false);
    });
    it('reads exclusions from application inputs without global configuration', async () => {
      await fixture(['/default/rdmp/hook/callback']);
      expect(await post('/default/rdmp/hook/callback')).to.deep.equal({ raw: true, value: '{"value":"kept"}' });
    });
    it('delegates non-matching requests to the owned Express parser', async () => {
      await fixture(['/default/rdmp/hook/callback']);
      expect(await post('/default/rdmp/hook/other')).to.deep.equal({ raw: false, value: { value: 'kept' } });
    });
  });
});
