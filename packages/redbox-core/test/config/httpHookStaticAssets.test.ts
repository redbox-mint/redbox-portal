import { expect } from 'chai';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import supertest from 'supertest';
import { PageArtifacts, mountStaticPageArtifacts } from '../../src/http/express';

describe('declared hook static artifacts', () => {
  let directory: string;
  let hookRoot: string;
  let coreRoot: string;
  async function write(file: string, content: string) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  }
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'redbox-hook-assets-'));
    hookRoot = path.join(directory, 'installed-hook/assets');
    coreRoot = path.join(directory, 'public');
    await fs.mkdir(coreRoot);
    await write(path.join(hookRoot, 'styles/client-branding.css'), 'body{}');
    await write(path.join(hookRoot, 'default/rdmp/styles/theme.css'), 'theme');
  });
  afterEach(async () => fs.rm(directory, { recursive: true, force: true }));
  function request(cookies = false) {
    const app = express();
    const artifacts = new PageArtifacts([directory], [hookRoot, coreRoot]);
    if (cookies)
      app.use((_req, res, next) => {
        res.cookie('early', 'private');
        const end = res.end;
        res.end = function (...args: any[]) {
          res.cookie('late', 'private');
          return Reflect.apply(end, this, args);
        } as typeof res.end;
        next();
      });
    // Owned routes have precedence over static fallback.
    app.get('/api/owned', (_req, res) => res.send('owned'));
    mountStaticPageArtifacts(app, artifacts);
    app.use((_req, res) => res.status(404).send('missing'));
    return supertest(app);
  }
  it('resolves direct hook assets', async () => {
    expect((await request().get('/styles/client-branding.css').expect(200)).text).to.equal('body{}');
  });
  it('resolves branded hook fallback paths', async () => {
    expect((await request().get('/brand/rdmp/styles/theme.css').expect(200)).text).to.equal('theme');
  });
  it('does not let less-specific hook resources override more-specific core resources', async () => {
    await write(path.join(hookRoot, 'default/default/styles/theme.css'), 'hook default');
    await write(path.join(coreRoot, 'brand/rdmp/styles/theme.css'), 'core brand');
    expect((await request().get('/brand/rdmp/styles/theme.css').expect(200)).text).to.equal('core brand');
  });
  it('rejects traversal, malformed encoding and outside-root symlinks', async () => {
    await write(path.join(directory, 'secret.txt'), 'private');
    await fs.symlink(path.join(directory, 'secret.txt'), path.join(hookRoot, 'escape.txt'));
    for (const resource of [
      '/styles/%2e%2e/client-branding.css',
      '/%2e%2e/rdmp/styles/theme.css',
      '/brand/%2e%2e/styles/theme.css',
      '/escape.txt',
    ])
      await request().get(resource).expect(404);
    await request().get('/%ZZ').expect(400);
  });
  it('falls through when no hook resource exists', async () => {
    expect((await request().get('/styles/missing.css').expect(404)).text).to.equal('missing');
  });
  it('serves bytes with content type and nosniff, including HEAD', async () => {
    const response = await request().get('/styles/client-branding.css').expect(200);
    expect(response.text).to.equal('body{}');
    expect(response.headers['content-type']).to.include('text/css');
    expect(response.headers['x-content-type-options']).to.equal('nosniff');
    const head = await request().head('/styles/client-branding.css').expect(200);
    expect(head.text).to.equal(undefined);
    expect(head.headers['content-length']).to.equal('6');
  });
  it('keeps session cookies out of public immutable artifact responses', async () => {
    await write(path.join(hookRoot, 'angular/form/browser/main-ABC123DEF.js'), '/* bundle */');
    const response = await request(true).get('/angular/form/browser/main-ABC123DEF.js').expect(200);
    expect(response.headers['cache-control']).to.equal('public, max-age=31536000, immutable');
    expect(response.headers['set-cookie']).to.equal(undefined);
    expect(response.headers['cross-origin-opener-policy']).to.equal('same-origin-allow-popups');
  });
  it('serves owned routes before static fallback and refuses static writes', async () => {
    await write(path.join(hookRoot, 'api/owned'), 'must not shadow');
    expect((await request().get('/api/owned').expect(200)).text).to.equal('owned');
    await request().post('/styles/client-branding.css').expect(404);
  });
});
