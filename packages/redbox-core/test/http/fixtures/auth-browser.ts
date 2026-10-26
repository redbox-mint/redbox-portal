import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import ejs from 'ejs';
import { authenticationFixture } from '../authenticationFixture';

async function main() {
  const template = await readFile(path.resolve('../../views/default/default/layout.ejs'), 'utf8');
  const form = template.match(/<form class="redbox-logout"[\s\S]*?<\/form>/)?.[0];
  if (!form) throw new Error('Missing production logout form');
  const f = await authenticationFixture({
    protectCsrf: true,
    port: 18639,
    prepare: (router, csrf) =>
      router.get('/__test/browser', (req, res) => {
        const html = ejs.render(form, {
          req,
          _csrf: csrf!.generateToken(req),
          BrandingService: { getBrandAndPortalPath: () => '/portal/default/rdmp' },
          TranslationService: { t: () => 'Logout' },
        });
        res
          .type('html')
          .send('<!doctype html><title>CSRF acceptance fixture</title><h1>CSRF acceptance fixture</h1>' + html);
      }),
  });
  const origin = createServer((_req, res) =>
    res.end('<!doctype html><title>Other origin fixture</title><h1>Other origin fixture</h1>')
  );
  await new Promise<void>(resolve => origin.listen(18640, '127.0.0.1', resolve));
  console.log(JSON.stringify({ url: f.url + '/__test/browser', otherOrigin: 'http://127.0.0.1:18640' }));
  const stop = async () => {
    await new Promise<void>(resolve => origin.close(() => resolve()));
    await f.close();
  };
  process.once('SIGTERM', () => {
    void stop();
  });
  process.once('SIGINT', () => {
    void stop();
  });
}
void main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Fixture failed');
  process.exitCode = 1;
});
