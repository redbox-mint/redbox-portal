import { expect } from 'chai';
import { mkdtemp, mkdir, writeFile, symlink, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PageArtifacts } from '../../src/pages/Artifacts';
import { execFileSync } from 'node:child_process';
import { pageCsp } from '../../src/pages/csp';
import { csp } from '../../src/config/csp.config';
import { pageLocals } from '../../src/pages/locals';

describe('Installed page artifacts', () => {
  it('resolves hook precedence, cross-package includes and bundle hashes without exposing private files', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sr-pages-'));
    try {
      const [hook, core, assets] = ['hook', 'core', 'assets'].map(name => path.join(dir, name));
      await Promise.all([hook, core, assets].map(root => mkdir(root)));
      await mkdir(path.join(core, 'default/default'), { recursive: true });
      await mkdir(path.join(hook, 'default/default'), { recursive: true });
      await writeFile(path.join(core, 'default/default/footer.ejs'), '<footer><%= text %></footer>');
      await writeFile(
        path.join(hook, 'default/default/layout.ejs'),
        '<article><%- body %><%- include("footer") %></article>'
      );
      await mkdir(path.join(assets, 'angular/form/browser'), { recursive: true });
      await writeFile(path.join(assets, 'angular/form/browser/main-ABCD.js'), '');
      const files = new PageArtifacts([hook, core], [assets]);
      await files.initialize();
      expect(
        files.render(files.view('layout', 'institution', 'rdmp')!, { body: '<h1>Hello</h1>', text: '<safe>' })
      ).to.equal('<article><h1>Hello</h1><footer>&lt;safe&gt;</footer></article>');
      expect(files.bundleHash('form', 'main', '-')).to.equal('-ABCD');
      await files.close();
      await symlink('/etc/passwd', path.join(assets, 'outside'));
      for (const name of ['../passwd', '.env', 'x/.private', 'outside', 'a\\b', '/etc/passwd'])
        expect(files.find([assets], name), name).to.equal(undefined);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('packages pages independently of the source checkout and resolves them from another working directory', async () => {
    const root = path.resolve(__dirname, '../../../..');
    const dir = await mkdtemp(path.join(tmpdir(), 'sr-installed-pages-'));
    try {
      const views = path.join(dir, 'source-views'),
        assets = path.join(dir, 'source-assets'),
        installed = path.join(dir, 'installed');
      await mkdir(views);
      await mkdir(assets);
      await writeFile(path.join(views, 'page.ejs'), '<%- include("nested/partial") %>');
      await mkdir(path.join(views, 'nested'));
      await writeFile(path.join(views, 'nested/partial.ejs'), '<b><%= value %></b>');
      await writeFile(path.join(assets, 'public.css'), 'body{}');
      await writeFile(path.join(assets, '.private'), 'private');
      await symlink('/etc/passwd', path.join(assets, 'outside'));
      execFileSync(
        process.execPath,
        [path.join(root, 'packages/redbox-core/scripts/package-pages.cjs'), views, assets, installed],
        { cwd: dir }
      );
      await rm(views, { recursive: true });
      await rm(assets, { recursive: true });
      const child = execFileSync(
        process.execPath,
        [
          '-e',
          `
        const assert=require('node:assert/strict');
        const {PageArtifacts}=require(process.argv[1]);
        (async()=>{const pages=PageArtifacts.installed(process.argv[2]);await pages.initialize();
          assert.equal(pages.render(pages.view('page','default','rdmp'),{value:'installed'}),'<b>installed</b>');
          assert(pages.find(pages.assets,'public.css'));assert.equal(pages.find(pages.assets,'outside'),undefined);
          assert.equal(pages.find(pages.assets,'.private'),undefined);await pages.close();
          assert.equal(global.sails,undefined);assert(!Object.keys(require.cache).some(file=>file.includes('/node_modules/sails/')));
          console.log('installed-page-proof');})().catch(error=>{console.error(error);process.exitCode=1});
      `,
          path.join(root, 'packages/redbox-core/dist/pages/Artifacts.js'),
          installed,
        ],
        { cwd: dir, encoding: 'utf8' }
      );
      expect(child).to.include('installed-page-proof');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('renders the copied production layout and keeps CSP nonces request scoped', async () => {
    const root = path.resolve(__dirname, '../../../..');
    const dir = await mkdtemp(path.join(tmpdir(), 'sr-packed-pages-'));
    try {
      await cp(path.join(root, 'views'), path.join(dir, 'views'), { recursive: true });
      await mkdir(path.join(dir, 'assets'));
      const files = new PageArtifacts([path.join(dir, 'views')], [path.join(dir, 'assets')]);
      await files.initialize();
      const locals: Record<string, any> = {
        body: '<h1>Persisted title</h1>',
        branding: 'default',
        portal: 'rdmp',
        title: 'Example',
        lang: 'en',
        _csrf: 'token',
        menu: { items: [] },
        req: { isAuthenticated: () => false, query: {}, originalUrl: '/institution/default/rdmp/home', session: {} },
      };
      Object.assign(
        locals,
        pageLocals(
          {
            root: '/institution',
            origin: 'http://localhost',
            brand: { name: 'default' },
            portal: 'rdmp',
            typeface: null,
            faviconUrl: '/favicon',
            settings: {},
            config: {},
            t: key => key,
            param: () => '',
            bundleHash: () => '',
            hasRole: () => false,
          },
          locals
        )
      );
      locals.superPartial = (name: string) =>
        files.render(files.view(name.replace(/^\//, ''), 'default', 'rdmp')!, locals);
      const policy = pageCsp({
        configuration: csp,
        pathname: '/home',
        appUrl: 'http://localhost',
        environment: 'development',
      })!;
      locals.contentSecurityPolicyNonce = policy.nonce;
      const html = files.render(files.view('layout', 'default', 'rdmp')!, locals);
      expect(html)
        .to.include('<h1>Persisted title</h1>')
        .and.include('href="/institution"')
        .and.include('nonce="' + policy.nonce + '"');
      expect(policy.headerValue)
        .to.include("'nonce-" + policy.nonce + "'")
        .and.not.include('upgrade-insecure-requests');
      expect(
        pageCsp({ configuration: csp, pathname: '/home', appUrl: 'https://localhost', environment: 'production' })!
          .nonce
      ).not.to.equal(policy.nonce);
      await files.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
