import * as sinon from 'sinon';
import { of } from 'rxjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PageArtifacts } from '../../src/pages/Artifacts';
import { httpRecordPagesFixture } from '../helpers/httpRecordPagesFixture';
let expect: Chai.ExpectStatic;
before(async () => {
  expect = (await import('chai')).expect;
});
describe('Owned record browser pages', function () {
  let f: Awaited<ReturnType<typeof httpRecordPagesFixture>>;
  const base = '/default/portal';
  const request = (suffix: string) => f.request(base + suffix, { headers: { Accept: 'text/html' } });
  beforeEach(async () => {
    f = await httpRecordPagesFixture();
  });
  afterEach(async () => {
    await f?.close();
    sinon.restore();
  });
  it('renders the saved metadata title', async function () {
    const response = await request('/record/view/oid-1');
    expect(response.status).to.equal(200);
    expect(response.text.match(/<title>([\s\S]*?)<\/title>/)?.[1].trim()).to.equal('Saved title | Site');
  });
  it('renders an institution record/view-orig override at its legacy URL', async function () {
    const directory = await mkdtemp(path.join(tmpdir(), 'redbox-original-view-'));
    let artifacts: PageArtifacts | undefined;
    try {
      const viewDirectory = path.join(directory, 'default/default/record');
      await mkdir(viewDirectory, { recursive: true });
      await writeFile(path.join(viewDirectory, 'view-orig.ejs'), '<p>Institution original view: <%= oid %></p>');
      artifacts = new PageArtifacts([directory, ...f.page.input.artifacts.views], f.page.input.artifacts.assets);
      await artifacts.initialize();
      await f.close();
      f = await httpRecordPagesFixture(pages => {
        pages.artifacts = artifacts!;
      });
      const response = await request('/record/view-orig/oid-1');
      expect(response.status).to.equal(200);
      expect(response.text).to.include('Institution original view: oid-1');
      expect((await request('/record/view/oid-1')).text).not.to.include('Institution original view');
    } finally {
      await artifacts?.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('falls back to the type label when the saved title is blank', async function () {
    f.record.metadata.title = '   ';
    const response = await request('/record/view/oid-1');
    expect(response.status).to.equal(200);
    expect(response.text.match(/<title>([\s\S]*?)<\/title>/)?.[1].trim()).to.equal('RDMP | Site');
  });
  it('falls back to oid when both title and type are missing', async function () {
    f.record.metadata.title = '';
    f.record.metaMetadata.type = '';
    const response = await request('/record/view/oid-1');
    expect(response.status).to.equal(200);
    expect(response.text.match(/<title>([\s\S]*?)<\/title>/)?.[1].trim()).to.equal('oid-1 | Site');
  });
  it('returns sanitized 500 on view metadata lookup failure', async function () {
    f.loadRecord.rejects(new TypeError('PRIVATE'));
    const response = await request('/record/view/oid-1');
    expect(response.status).to.equal(500);
    expect(response.text).not.to.include('PRIVATE');
    const diagnostic = JSON.stringify(f.log.error.args);
    expect(diagnostic).to.include('record/view');
    expect(diagnostic).to.include('pageFailureCategory');
    expect(diagnostic).to.include('type');
    expect(diagnostic).not.to.include('PRIVATE');
  });
  it('rejects blank record identifiers before storage', async function () {
    const response = await request('/record/view/%20%20%20');
    expect(response.status).to.equal(400);
    expect(f.loadRecord.called).to.equal(false);
  });
  it('rejects view without a current grant', async function () {
    f.record.authorization = { view: [], edit: [] };
    const response = await request('/record/view/oid-1');
    expect(response.status).to.equal(403);
    expect(f.loadRecord.calledOnce).to.equal(true);
  });
  for (const route of ['view', 'view-orig']) {
    it(`renders ${route} with one metadata lookup`, async function () {
      const response = await request('/record/' + route + '/oid-1');
      expect(response.status).to.equal(200);
      expect(response.text.match(/<title>([\s\S]*?)<\/title>/)?.[1].trim()).to.equal('Saved title | Site');
      expect(f.loadRecord.calledOnceWithExactly('oid-1')).to.equal(true);
    });
    for (const missing of [undefined, null, {}])
      it(`returns 404 from ${route} for ${JSON.stringify(missing)}`, async function () {
        f.loadRecord.resolves(missing);
        const response = await request('/record/' + route + '/deleted-oid');
        expect(response.status).to.equal(404);
        expect(f.loadRecord.calledOnceWithExactly('deleted-oid')).to.equal(true);
        expect(f.forms.getFormByName.called).to.equal(false);
      });
    for (const failure of [
      new Error('Storage unavailable'),
      new Error('Storage index not found'),
      { code: 500, message: 'Storage unavailable' },
    ])
      it(`keeps ${route} lookup failure ${failure.message} as 500`, async function () {
        f.loadRecord.rejects(failure);
        const response = await request('/record/' + route + '/oid-1');
        expect(response.status).to.equal(500);
        expect(response.text).not.to.include('Storage unavailable');
      });
    it(`refuses inaccessible ${route}`, async function () {
      f.record.authorization = { view: [], edit: [] };
      expect((await request('/record/' + route + '/oid-1')).status).to.equal(403);
    });
  }
  for (const missing of [undefined, null, {}])
    for (const route of ['standard', 'named-form', 'record-type'])
      it(`returns missing ${route} edit for ${JSON.stringify(missing)}`, async function () {
        f.loadRecord.resolves(missing);
        const suffix = route === 'standard' ? '/record/edit/deleted-oid' : '/record/finalise/rdmp/edit/deleted-oid';
        expect((await request(suffix)).status).to.equal(404);
        expect(f.forms.getFormByName.called).to.equal(false);
        expect(f.forms.getFormByStartingWorkflowStep.called).to.equal(false);
      });
  it('keeps failed editor lookup as a sanitized server error', async function () {
    f.loadRecord.rejects(new Error('Storage unavailable'));
    const response = await request('/record/edit/oid-1');
    expect(response.status).to.equal(500);
    expect(response.text).not.to.include('Storage unavailable');
    expect(f.forms.getFormByName.called).to.equal(false);
  });
  for (const selection of ['named', 'saved'])
    for (const type of ['rdmp', null])
      it(`uses saved type ${JSON.stringify(type)} with ${selection} form without configured type`, async function () {
        f.record.metaMetadata.type = type as any;
        f.forms.getFormByName.returns(of({ configuration: {} }));
        const suffix = selection === 'named' ? '/record/finalise/rdmp/edit/oid-1' : '/record/edit/oid-1';
        const response = await request(suffix);
        expect(response.status).to.equal(200);
        expect(response.text.match(/<title>([\s\S]*?)<\/title>/)?.[1].trim()).to.equal('Saved title | Site');
        expect(f.loadRecord.calledOnceWithExactly('oid-1')).to.equal(true);
        expect(
          f.forms.getFormByName.calledOnceWithExactly(
            selection === 'named' ? 'default-1.0-draft' : 'saved-form',
            true,
            'brand-1'
          )
        ).to.equal(true);
      });
  for (const formName of [undefined, null])
    it(`distinguishes unavailable form ${formName} from a missing record`, async function () {
      f.record.metaMetadata.form = formName as any;
      f.forms.getFormByName.returns(of(null));
      expect((await request('/record/edit/oid-1')).status).to.equal(404);
      expect(f.loadRecord.calledOnce).to.equal(true);
      expect(f.forms.getFormByName.calledOnce).to.equal(true);
    });
  it('renders create form without loading an existing record', async function () {
    const response = await request('/record/rdmp/edit');
    expect(response.status).to.equal(200);
    expect(response.text.match(/<title>([\s\S]*?)<\/title>/)?.[1].trim()).to.equal('Create RDMP | Site');
    expect(f.loadRecord.called).to.equal(false);
    expect(f.forms.getFormByStartingWorkflowStep.calledOnce).to.equal(true);
  });
  it('retains saved titles on existing edit pages', async function () {
    const response = await request('/record/edit/oid-1');
    expect(response.status).to.equal(200);
    expect(response.text.match(/<title>([\s\S]*?)<\/title>/)?.[1].trim()).to.equal('Saved title | Site');
    expect(f.loadRecord.calledOnce).to.equal(true);
  });
  it('retains record type titles on create pages', async function () {
    const response = await request('/record/rdmp/edit');
    expect(response.status).to.equal(200);
    expect(response.text.match(/<title>([\s\S]*?)<\/title>/)?.[1].trim()).to.equal('Create RDMP | Site');
    expect(f.loadRecord.called).to.equal(false);
  });
  it('redirects the legacy consolidated dashboard to its owned view', async function () {
    const response = await fetch(f.url + base + '/dashboard/consolidated', { redirect: 'manual' });
    expect(response.status).to.equal(302);
    expect(response.headers.get('Location')).to.equal(base + '/dashboard-view/consolidated');
  });
});
