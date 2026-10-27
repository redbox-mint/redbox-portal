import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PageArtifacts } from '../../src/pages/Artifacts';
import { pageLocals } from '../../src/pages/locals';

const input = { root: '', origin: 'http://localhost', brand: { name: 'default' }, portal: 'portal',
  typeface: null, faviconUrl: '/default/portal/images/favicon', settings: {}, config: {},
  t: (key: string) => key, param: () => undefined, bundleHash: () => '', hasRole: () => false };

describe('Explicit page locals and installed partial artifacts', () => {
  describe('displayValue', () => {
    it('returns the default when a key path is absent', () => {
      expect(pageLocals(input, {}).displayValue('user.name', 'defaultName')).to.equal('defaultName');
    });
    it('returns a simple local value', () => {
      expect(pageLocals(input, { username: 'testuser' }).displayValue('username', 'default')).to.equal('testuser');
    });
    it('returns the default when an intermediate key is null', () => {
      expect(pageLocals(input, { user: null }).displayValue('user.name', 'defaultName')).to.equal('defaultName');
    });
    it('defaults to an empty string', () => {
      expect(pageLocals(input, {}).displayValue('nonexistent')).to.equal('');
    });
  });
  describe('declared partial roots', () => {
    let directory: string;
    let views: string;
    let assets: string;
    const write = (name: string, content = 'partial') => {
      const file = path.join(views, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
      return file;
    };
    beforeEach(() => {
      directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-page-artifacts-')));
      views = path.join(directory, 'views'); assets = path.join(directory, 'assets');
      fs.mkdirSync(views); fs.mkdirSync(assets);
    });
    afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
    it('reports a missing partial instead of fabricating an installed path', () => {
      expect(new PageArtifacts([views], [assets]).view('partial.ejs', 'default', 'portal')).to.equal(undefined);
    });
    it('checks the brand and portal path first', () => {
      const expected = write('mybrand/myportal/partial.ejs');
      write('default/myportal/partial.ejs'); write('default/default/partial.ejs');
      expect(new PageArtifacts([views], [assets]).view('partial.ejs', 'mybrand', 'myportal')).to.equal(expected);
    });
    it('falls back to the default brand for the requested portal', () => {
      const expected = write('default/myportal/partial.ejs'); write('default/default/partial.ejs');
      expect(new PageArtifacts([views], [assets]).view('partial.ejs', 'mybrand', 'myportal')).to.equal(expected);
    });
    it('falls back to the default brand and portal', () => {
      const expected = write('default/default/partial.ejs');
      expect(new PageArtifacts([views], [assets]).view('partial.ejs', 'mybrand', 'myportal')).to.equal(expected);
    });
    it('renders relative includes from the actual template directory', async () => {
      write('mybrand/myportal/partial.ejs', 'resolved partial');
      const template = write('mybrand/myportal/pages/sub/template.ejs', '<%- include("../../partial.ejs") %>');
      const artifacts = new PageArtifacts([views], [assets]);
      try { await artifacts.initialize(); expect(artifacts.render(template, {})).to.equal('resolved partial'); }
      finally { await artifacts.close(); }
    });
    it('resolves explicitly selected hook partials from a core layout', async () => {
      const hookViews = path.join(directory, 'hook-views');
      fs.mkdirSync(path.join(hookViews, 'default/default/layout'), { recursive: true });
      fs.writeFileSync(path.join(hookViews, 'default/default/layout/footer.ejs'), 'hook footer');
      const layout = write('default/default/layout.ejs', '<%- include("layout/footer.ejs") %>');
      const artifacts = new PageArtifacts([hookViews, views], [assets]);
      try { await artifacts.initialize(); expect(artifacts.render(layout, {})).to.equal('hook footer'); }
      finally { await artifacts.close(); }
    });
  });
  it('exposes plain page operations without a generated service instance', () => {
    expect(pageLocals(input, {}).displayValue).to.be.a('function');
    expect(PageArtifacts.prototype.view).to.be.a('function');
    expect(PageArtifacts.prototype.render).to.be.a('function');
  });
});
