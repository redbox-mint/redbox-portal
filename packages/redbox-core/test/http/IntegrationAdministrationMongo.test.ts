import { createServer as createSmtpServer } from 'node:net';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Services as Email } from '../../src/integrations/Email';
import { emailnotification } from '../../src/config/emailnotification.config';
import { mountIntegrationOperationRoutes } from '../../src/http/express/integrationOperations';
import { dompurify } from '../../src/config/dompurify.config';
import { StreamingMultipart } from '../../src/http/express/multipart';
import { mountDatastreamWriteRoutes } from '../../src/http/express/datastreamWrites';
import { mountDatastreamReadRoutes } from '../../src/http/express/datastreamReads';
import { mountBrandingUploadRoutes } from '../../src/http/express/brandingUploads';
import { Services as Logos } from '../../src/branding/BrandingLogo';
import { Services as Sanitizer } from '../../src/forms/DomSanitizer';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { firstValueFrom } from 'rxjs';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { recordWriteFixture } from './recordWriteFixture';
import { Services as Branding } from '../../src/branding/Branding';
import { Services as Theme } from '../../src/branding/BrandingThemeCss';
import { Services as Typeface } from '../../src/branding/BrandingTypeface';
import { Services as Vocabulary } from '../../src/vocabulary/Vocabulary';
import { Services as Figshare } from '../../src/vocabulary/FigshareVocabulary';
import { Services as FormVocabulary } from '../../src/vocabulary/FormVocabulary';
import { Services as Forwarding } from '../../src/integrations/SiemForwarding';
import { Services as Queries } from '../../src/queries/NamedQueries';
import { getBrandingRepository } from '../../src/persistence/branding/runtime';
import { getReferenceRepositories } from '../../src/persistence/reference/runtime';
import { ensureCachePersistenceIndex } from '../../src/persistence/cache/preflight';
import { initializeCachePersistence, getCacheEntryRepository } from '../../src/persistence/cache/runtime';
import { ensureConfigurationPersistenceIndexes } from '../../src/persistence/configuration/preflight';
import {
  initializeConfigurationPersistence,
  getConfigurationRepositories,
} from '../../src/persistence/configuration/runtime';
import { ensureVocabularyPersistenceIndexes } from '../../src/persistence/vocabulary/preflight';
import { initializeVocabularyPersistence, getVocabularyRepositories } from '../../src/persistence/vocabulary/runtime';
import { ensureSiemPersistenceIndexes } from '../../src/persistence/siem/preflight';
import { initializeSiemPersistence, getSiemRepository } from '../../src/persistence/siem/runtime';
import { executeNamedQuery, namedQueryTarget } from '../../src/persistence/reference/NamedQueryExecution';
import { AppConfigs } from '../../src/configuration/AppConfigs';
import { ConfigModelRegistry } from '../../src/configuration/ConfigModelRegistry';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import { resolveFigshareVocabularyConfigData } from '../../src/vocabulary/FigshareConfiguration';
import { registerPersistenceResource } from '../../src/persistence/runtime';
import { mountBrandingOperationRoutes, brandingOperationRoutes } from '../../src/http/express/brandingOperations';
import {
  mountFigshareAdministrationRoutes,
  figshareAdministrationRoutes,
} from '../../src/http/express/figshareAdministration';
import { mountFormVocabularyRoutes } from '../../src/http/express/formVocabulary';
import { mountSiemWriteRoutes } from '../../src/http/express/siemWrites';
import { mountAdminOperationRoutes } from '../../src/http/express/adminOperations';
import { mountConfiguredActionRoutes } from '../../src/http/express/configuredActions';

// Standalone suites deliberately omit the legacy test/setup.ts bootstrap.
describe('owned integration administration on real Mongo HTTP and provider sockets', function () {
  this.timeout(45000);
  let f: Awaited<ReturnType<typeof recordWriteFixture>>;
  let branding!: Branding.Branding, settings!: AppConfigs, vocabulary!: Vocabulary.VocabularyService;
  let smtpFailures = false;
  const deliveries: string[] = [];
  let mailDirectory = '';
  let calls = 0,
    failProvider = false,
    endpoint = '',
    refreshes = 0,
    actionCalls = 0;
  before(async () => {
    f = await recordWriteFixture(async (router, fixture, bindings) => {
      const provider = createServer((_req, res) => {
        calls++;
        res.setHeader('Content-Type', 'application/json');
        if (failProvider) {
          res.statusCode = 503;
          res.end('{"private":"provider credentials"}');
          return;
        }
        if (_req.url?.includes('/categories'))
          res.end(
            JSON.stringify([
              {
                id: 1,
                title: 'Science',
                parent_id: 0,
                taxonomy_id: 10,
                taxonomy_name: 'Fields',
                source_id: '10',
                is_selectable: true,
              },
            ])
          );
        else res.end(JSON.stringify({ results: [{ label: 'Alpha', value: 'A' }] }));
      });
      registerPersistenceResource(fixture.owner, 'integration-http-provider', {
        close: () => new Promise<void>((resolve, reject) => provider.close(e => (e ? reject(e) : resolve()))),
      });
      provider.listen(0, '127.0.0.1');
      await once(provider, 'listening');
      const address = provider.address();
      assert(address && typeof address === 'object');
      endpoint = 'http://127.0.0.1:' + address.port;
      await ensureCachePersistenceIndex(fixture.owner);
      await initializeCachePersistence(fixture.owner);
      await ensureConfigurationPersistenceIndexes(fixture.owner);
      await initializeConfigurationPersistence(fixture.owner);
      await ensureVocabularyPersistenceIndexes(fixture.owner);
      await initializeVocabularyPersistence(fixture.owner);
      await ensureSiemPersistenceIndexes(fixture.owner);
      await initializeSiemPersistence(fixture.owner);
      const brands = [fixture.brand, fixture.otherBrand].map(b => Object.assign(new BrandingModel(), b));
      settings = new AppConfigs({
        repository: getConfigurationRepositories(fixture.owner),
        models: new ConfigModelRegistry(),
        config: {},
        log: nothingLogger,
        availableBrands: () => brands.map(b => b.name),
        getBrand: name => brands.find(b => b.name === name)!,
      });
      await settings.initialize();
      registerPersistenceResource(fixture.owner, 'integration-settings', { close: () => settings.close() });
      const theme = new Theme.BrandingThemeCss();
      const typeface = new Typeface.BrandingTypeface({
        repository: getBrandingRepository(fixture.owner),
        disk: () => bindings.disks.primaryDisk(),
        log: nothingLogger,
        rootContext: 'portal',
        positiveInt: (_key, fallback) => fallback,
      });
      branding = new Branding.Branding({
        repository: getBrandingRepository(fixture.owner),
        cacheEntries: () => getCacheEntryRepository(fixture.owner),
        log: nothingLogger,
        theme,
        typeface,
        positiveInt: (_key, fallback) => fallback,
      });
      await firstValueFrom(branding.loadAvailableBrands(null));
      vocabulary = new Vocabulary.VocabularyService({
        repository: getVocabularyRepositories(fixture.owner),
        config: {},
        log: nothingLogger,
        getBrand: name => brands.find(b => b.name === name || b.id === name) ?? null,
        defaultBrand: () => fixture.brand.id,
      });
      const queries = new Queries.NamedQueryService({
        queries: getReferenceRepositories(fixture.owner).namedQueries,
        log: nothingLogger,
        config: { namedQuery: { supportedCollections: ['user'] } },
        target: name => namedQueryTarget(fixture.owner, name),
        execute: (request, count) => executeNamedQuery(fixture.owner, request, count),
      });
      const lookups = new FormVocabulary.FormVocabulary({
        config: {
          external: { fixture: { method: 'get', url: endpoint + '/lookup?q=${query}', options: {} } },
          services: { selected: { serviceName: 'lookup', methodName: 'selected' } },
          queries: {},
        },
        log: nothingLogger,
        queries,
        search: bindings.search,
        resolveLookup: (service, method) =>
          service === 'lookup' && method === 'selected'
            ? async request => ({
                data: [{ label: request.user.username, value: request.brand.id }],
                meta: { selected: true },
              })
            : undefined,
      });
      const figshare = new Figshare.FigshareVocabularyService({
        repository: getVocabularyRepositories(fixture.owner),
        log: nothingLogger,
        brandName: id => brands.find(b => b.id === id)?.name ?? id,
        defaultBrandId: () => fixture.brand.id,
        configuration: () =>
          resolveFigshareVocabularyConfigData(
            { figsharePublishing: { connection: { baseUrl: endpoint, token: '' } } },
            { enabled: false, mode: 'live' },
            'test'
          ),
        appConfiguration: () => ({}),
        bootstrapFigshareImports: false,
      });
      const forwarding = new Forwarding.SiemForwardingService({
        repository: getSiemRepository(fixture.owner),
        configuration: () => ({}),
        brandIds: () => [fixture.brand.id],
      });
      registerPersistenceResource(fixture.owner, 'integration-forwarding', {
        quiesce: () => forwarding.quiesce(),
        drain: () => forwarding.drain(),
        close: async () => {},
      });
      mailDirectory = await mkdtemp(join(tmpdir(), 'sr-mail-'));
      await writeFile(join(mailDirectory, 'test.hbs'), 'Hello {{name}}');
      const smtp = createSmtpServer(connection => {
        connection.write('220 fixture ESMTP\r\n');
        let pending = '',
          data = false,
          message = '';
        connection.on('data', chunk => {
          pending += chunk.toString();
          let index: number;
          while ((index = pending.indexOf('\r\n')) >= 0) {
            const line = pending.slice(0, index);
            pending = pending.slice(index + 2);
            if (data) {
              if (line === '.') {
                data = false;
                if (smtpFailures) connection.write('451 try later\r\n');
                else {
                  deliveries.push(message);
                  connection.write('250 accepted\r\n');
                }
                message = '';
              } else message += line + '\r\n';
            } else if (/^EHLO|^HELO/.test(line)) connection.write('250 fixture\r\n');
            else if (/^DATA/.test(line)) {
              data = true;
              connection.write('354 send message\r\n');
            } else if (/^QUIT/.test(line)) connection.end('221 goodbye\r\n');
            else connection.write('250 OK\r\n');
          }
        });
      });
      registerPersistenceResource(fixture.owner, 'smtp-fixture', {
        close: () => new Promise<void>((resolve, reject) => smtp.close(error => (error ? reject(error) : resolve()))),
      });
      smtp.listen(0, '127.0.0.1');
      await once(smtp, 'listening');
      const smtpAddress = smtp.address();
      assert(smtpAddress && typeof smtpAddress === 'object');
      const email = new Email.Email({
        config: {
          ...emailnotification,
          settings: {
            ...emailnotification.settings,
            templateDir: mailDirectory + '/',
            serverOptions: { host: '127.0.0.1', port: smtpAddress.port, secure: false },
          },
        },
        log: nothingLogger,
        templateContext: {},
        resolveHook: name => {
          throw new Error('Unconfigured mail hook ' + name);
        },
        retainFollowup: work => {
          void work;
        },
      });
      const common = {
        ...bindings,
        log: nothingLogger,
        audit: (actor: { id: string; username: string }, action: string, context: { brandId: string }) =>
          bindings.users.addUserAuditEvent(actor, action, context),
      };
      const multipart = new StreamingMultipart(bindings.disks.stagingDisk(), {
        files: 5,
        fileSize: 2 * 1024 * 1024,
        fields: 10,
        fieldSize: 8192,
      });
      registerPersistenceResource(fixture.owner, 'integration-multipart', {
        quiesce: () => multipart.quiesce(),
        drain: () => multipart.drain(),
        close: () => multipart.close(),
      });
      const sanitizer = new Sanitizer.DomSanitizer({ config: { dompurify }, log: nothingLogger });
      const logos = new Logos.BrandingLogo({
        repository: getBrandingRepository(fixture.owner),
        disk: () => bindings.disks.primaryDisk(),
        legacyDatabase: async () => fixture.native.db(),
        sanitize: svg => sanitizer.sanitize(svg),
        config: {},
        log: nothingLogger,
      });
      registerPersistenceResource(fixture.owner, 'integration-logos', {
        quiesce: () => logos.quiesce(),
        drain: () => logos.drain(),
        close: async () => {
          await logos.close();
          await sanitizer.close();
        },
      });
      mountIntegrationOperationRoutes(router, { ...common, email, records: bindings.writer });
      mountDatastreamWriteRoutes(router, { ...common, records: bindings.writer, multipart });
      mountDatastreamReadRoutes(router, { ...common, records: bindings.writer });
      mountBrandingUploadRoutes(router, {
        ...common,
        branding,
        logos,
        multipart,
        staging: bindings.disks.stagingDisk(),
      });
      mountBrandingOperationRoutes(router, { ...common, branding });
      mountFigshareAdministrationRoutes(router, { ...common, vocabulary: figshare });
      mountFormVocabularyRoutes(router, { ...common, vocabulary, lookups });
      mountSiemWriteRoutes(router, { ...common, settings, forwarding });
      mountAdminOperationRoutes(router, {
        ...common,
        settings,
        reloadTranslations: async () => {
          refreshes++;
        },
        invalidateAssets: () => {},
      });
      mountConfiguredActionRoutes(router, {
        ...common,
        actions: {
          selected: {
            authorize: async context => context.actor.username === 'pilot-admin',
            execute: async context => {
              actionCalls++;
              await fixture.identities.create('useraudit', {
                user: context.actor.id,
                action: 'selected-action',
                additionalContext: JSON.stringify({ brandId: context.brand.id }),
              });
              return { selected: true };
            },
          },
          denied: {
            authorize: async () => false,
            execute: async () => {
              throw new Error('Denied action must not run');
            },
          },
        },
      });
    });
  });
  after(async () => {
    await f?.close();
    if (mailDirectory) await rm(mailDirectory, { recursive: true, force: true });
  });
  async function request(method: string, path: string, body?: unknown, headers: Record<string, string> = f.headers) {
    const response = await fetch(f.url + '/default/rdmp' + path, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json', 'X-ReDBox-Api-Version': '2.0' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { response, body: text ? JSON.parse(text) : {} };
  }
  async function browser() {
    const login = await fetch(f.url + '/__test/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'pilot-admin',
        password: 'pilot-password',
        branding: 'default',
        portal: 'rdmp',
      }),
    });
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const token = await fetch(f.url + '/csrfToken', { headers: { Cookie: cookie } });
    return { Cookie: cookie, 'X-CSRF-Token': (await token.json())._csrf };
  }
  it('mounts 24 branding and 19 Figshare declarations without legacy imports', () => {
    assert.equal(brandingOperationRoutes.length, 24);
    assert.equal(figshareAdministrationRoutes.length, 19);
  });
  it('saves drafts, rejects stale counters, previews, publishes, restores and audits persisted branding', async () => {
    const state = await request('GET', '/api/branding/config');
    assert.equal(state.response.status, 200, JSON.stringify(state.body));
    const draft = await request('POST', '/api/branding/draft', {
      variables: { primary: '#123456' },
      expectedDraftRevision: state.body.data.draft.revision,
    });
    assert.equal(draft.response.status, 200, JSON.stringify(draft.body));
    assert.equal(
      (
        await request('POST', '/api/branding/draft', {
          variables: { primary: '#ffffff' },
          expectedDraftRevision: state.body.data.draft.revision,
        })
      ).response.status,
      409
    );
    const preview = await request('POST', '/api/branding/preview', {
      expectedDraftRevision: draft.body.data.draft.revision,
    });
    assert.equal(preview.response.status, 200, JSON.stringify(preview.body));
    assert((await branding.fetchPreview(preview.body.data.token)).css.includes('#123456'));
    await assert.rejects(branding.fetchPreview(preview.body.data.token));
    const publish = await request('POST', '/api/branding/publish', {
      expectedDraftRevision: draft.body.data.draft.revision,
      expectedVersion: draft.body.data.active.version,
    });
    assert.equal(publish.response.status, 200, JSON.stringify(publish.body));
    const versions = await request('GET', '/api/branding/versions');
    assert.equal(versions.body.data.length, 1);
    assert.equal(versions.body.data[0].actorId, f.user.id);
    const cookie = await browser();
    assert.equal(
      (
        await request(
          'POST',
          '/app/branding/draft/typeface/use-default',
          { expectedDraftRevision: publish.body.data.draft.revision },
          cookie
        )
      ).response.status,
      200
    );
    const current = await branding.getAdminState('default');
    assert.equal(
      (
        await request('POST', '/api/branding/restore/foreign', {
          expectedVersion: current.active.version,
          expectedDraftRevision: current.draft.revision,
        })
      ).response.status,
      404
    );
    const restored = await request('POST', '/api/branding/rollback/' + versions.body.data[0].id, {
      expectedVersion: current.active.version,
      expectedDraftRevision: current.draft.revision,
    });
    assert.equal(restored.response.status, 200, JSON.stringify(restored.body));
    assert.equal(restored.response.headers.get('Deprecation'), 'true');
    assert(await f.native.db().collection('useraudit').countDocuments({ action: 'branding-publish' }));
  });
  it('uses actual configured HTTP vocabulary and selected lookup with browser CSRF', async () => {
    const cookie = await browser();
    const before = calls;
    assert.equal(
      (await request('POST', '/external/vocab/fixture', { options: { query: 'Alpha' } }, { Cookie: cookie.Cookie }))
        .response.status,
      403
    );
    assert.equal(calls, before);
    const external = await request('POST', '/external/vocab/fixture', { options: { query: 'Alpha' } }, cookie);
    assert.equal(external.response.status, 200, JSON.stringify(external.body));
    assert.equal(external.body.data.results[0].value, 'A');
    const selected = await request('POST', '/service/vocab/selected', { search: 'a' }, cookie);
    assert.equal(selected.response.status, 200, JSON.stringify(selected.body));
    assert.equal(selected.body.meta.selected, true);
    assert.equal(selected.body.data[0].value, f.brand.id);
    failProvider = true;
    const failed = await request('POST', '/external/vocab/fixture', { options: { query: 'Alpha' } }, cookie);
    failProvider = false;
    assert.equal(failed.response.status, 500);
    assert(!JSON.stringify(failed.body).includes('credentials'));
  });
  it('protects unsafe GET refresh and configured actions, persisting selected action and audit', async () => {
    const cookie = await browser();
    const before = refreshes;
    assert.equal(
      (await request('GET', '/api/admin/refreshCachedResources', undefined, { Cookie: cookie.Cookie })).response.status,
      403
    );
    const refreshed = await request('GET', '/api/admin/refreshCachedResources', undefined, cookie);
    assert.equal(refreshed.response.status, 200, JSON.stringify(refreshed.body));
    assert.equal(refreshes, before + 1);
    assert.equal((await request('HEAD', '/api/admin/refreshCachedResources', undefined, cookie)).response.status, 405);
    assert.equal(refreshes, before + 1);
    assert.equal((await request('POST', '/action/selected', {}, { Cookie: cookie.Cookie })).response.status, 403);
    assert.equal((await request('POST', '/action/denied', {}, cookie)).response.status, 403);
    assert.equal((await request('POST', '/action/selected', {}, cookie)).response.status, 200);
    assert.equal(actionCalls, 1);
  });
  it('discovers, previews and applies a live Figshare catalogue with persisted crosswalks and retry behavior', async () => {
    const catalogue = await request('GET', '/api/figshare-vocabularies/catalogues?scope=public');
    assert.equal(catalogue.response.status, 200, JSON.stringify(catalogue.body));
    const preview = await request('POST', '/api/figshare-vocabularies/previews', {
      scope: 'public',
      taxonomyId: '10',
      createLocalClone: true,
      localCloneName: 'Local clone',
      localCloneSlug: 'local-clone',
    });
    assert.equal(preview.response.status, 201, JSON.stringify(preview.body));
    const runId = preview.body.data.runId;
    const reviewed = await request('GET', '/api/figshare-vocabularies/previews/' + runId);
    assert.equal(reviewed.response.status, 200, JSON.stringify(reviewed.body));
    const applied = await request('POST', '/api/figshare-vocabularies/previews/' + runId + '/apply', {
      remoteHash: preview.body.data.remoteHash,
      approvedProposalIds: reviewed.body.data.page.records.map((r: { proposalId: string }) => r.proposalId),
    });
    assert.equal(applied.response.status, 200, JSON.stringify(applied.body));
    assert.equal(applied.body.data.categories.created, 1);
    const crosswalk = await request('GET', '/api/figshare-crosswalks/' + applied.body.data.crosswalkId);
    assert.equal(crosswalk.response.status, 200, JSON.stringify(crosswalk.body));
    const mappings = await request('GET', '/api/figshare-crosswalks/' + applied.body.data.crosswalkId + '/mappings');
    assert.equal(mappings.response.status, 200, JSON.stringify(mappings.body));
    assert.equal(mappings.body.data.records.length, 1);
    const repeat = await request('POST', '/api/figshare-vocabularies/previews/' + runId + '/apply', {
      remoteHash: preview.body.data.remoteHash,
    });
    assert.equal(repeat.response.status, 200, JSON.stringify(repeat.body));
    assert.equal(repeat.body.data.sourceId, applied.body.data.sourceId);
    const before = calls;
    assert.equal(
      (await request('POST', '/api/figshare-vocabularies/sources/' + f.otherBrand.id + '/preview', {})).response.status,
      404
    );
    assert.equal(calls, before);
    failProvider = true;
    const failed = await request('GET', '/api/figshare-vocabularies/catalogues?scope=public');
    failProvider = false;
    assert.equal(failed.response.status, 502, JSON.stringify(failed.body));
    assert(!JSON.stringify(failed.body).includes('credentials'));
  });
  it('saves SIEM credentials masked and tests only the saved destination through actual HTTP', async () => {
    const destination = {
      id: 'local',
      name: 'Local collector',
      enabled: true,
      adapterType: 'splunk-hec-json',
      endpointUrl: endpoint + '/collector',
      token: 'private-collector-token',
    };
    const saved = await request('PUT', '/api/siem/config', { enabled: true, destinations: [destination] });
    assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
    assert(!JSON.stringify(saved.body).includes('private-collector-token'));
    const test = await request('POST', '/api/siem/test', { destination: saved.body.data.destinations[0] });
    assert.equal(test.response.status, 200, JSON.stringify(test.body));
    assert.equal(test.body.data.status, 'success');
    const before = calls;
    assert.equal(
      (
        await request('POST', '/api/siem/test', {
          destination: { ...saved.body.data.destinations[0], endpointUrl: endpoint + '/forged' },
        })
      ).response.status,
      400
    );
    assert.equal(calls, before);
    failProvider = true;
    const failed = await request('POST', '/api/siem/test', { destination: saved.body.data.destinations[0] });
    failProvider = false;
    assert.equal(failed.response.status, 200, JSON.stringify(failed.body));
    assert.equal(failed.body.data.status, 'failed');
    assert(!JSON.stringify(failed.body).includes('private-collector-token'));
    assert(await f.native.db().collection('useraudit').countDocuments({ action: 'siem-test' }));
  });
  it('streams authenticated multipart bytes to GridFS and downloads them with current record authorization', async () => {
    const created = await request('POST', '/api/records/metadata/dataRecord', {
      metadata: { title: 'Attachment owner' },
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    const oid = created.body.data.oid;
    const files = new FormData();
    files.append('attachmentFields', new Blob(['Owned attachment bytes'], { type: 'text/plain' }), 'owned.txt');
    const upload = await fetch(f.url + '/default/rdmp/api/records/datastreams/' + oid, {
      method: 'POST',
      headers: { ...f.headers, 'X-ReDBox-Api-Version': '2.0' },
      body: files,
    });
    const uploaded = await upload.json();
    assert.equal(upload.status, 200, JSON.stringify(uploaded));
    assert.equal(uploaded.meta.outcome, 'saved');
    const list = await request('GET', '/api/records/datastreams/' + oid);
    assert.equal(list.response.status, 200, JSON.stringify(list.body));
    assert.equal(list.body.data.records.length, 1, JSON.stringify(list.body));
    const id = list.body.data.records[0].fileId;
    const download = await fetch(f.url + '/default/rdmp/api/records/datastreams/' + oid + '/' + id, {
      headers: f.headers,
    });
    assert.equal(download.status, 200);
    assert.equal(await download.text(), 'Owned attachment bytes');
    assert.match(download.headers.get('content-disposition')!, /owned.txt/);
    const alias = await fetch(f.url + '/default/rdmp/record/' + oid + '/attach/' + id, { headers: f.headers });
    assert.equal(alias.status, 200);
    assert.equal(await alias.text(), 'Owned attachment bytes');
    assert.match(alias.headers.get('content-type')!, /text\/plain/);
    await f.native
      .db()
      .collection('record')
      .updateOne(
        { redboxOid: oid },
        { $set: { authorization: { view: ['other'], edit: ['other'], viewRoles: [], editRoles: [] } } }
      );
    assert.equal((await request('GET', '/api/records/datastreams/' + oid)).response.status, 403);
    const refused = new FormData();
    refused.append('attachmentFields', new Blob(['no bytes']), 'no.txt');
    assert.equal(
      (
        await fetch(f.url + '/default/rdmp/api/records/datastreams/' + oid, {
          method: 'POST',
          headers: f.headers,
          body: refused,
        })
      ).status,
      403
    );
  });
  it('uses owned branding multipart validation, persists sanitized SVG, and cleans staging', async () => {
    const file = new FormData();
    file.append(
      'logo',
      new Blob(
        [
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>',
        ],
        { type: 'image/svg+xml' }
      ),
      'logo.svg'
    );
    const response = await fetch(f.url + '/default/rdmp/api/branding/logo', {
      method: 'POST',
      headers: { ...f.headers, 'X-ReDBox-Api-Version': '2.0' },
      body: file,
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert(body.data.hash);
    const current = await getBrandingRepository(f.owner).getBrand({ id: f.brand.id });
    assert(current?.logo?.storageKey);
    const bad = new FormData();
    bad.append('face', new Blob(['not a font']), 'bad.woff2');
    bad.append('expectedDraftRevision', String((await branding.getAdminState('default')).draft.revision));
    const rejected = await fetch(f.url + '/default/rdmp/api/branding/draft/typeface/faces/regular', {
      method: 'PUT',
      headers: f.headers,
      body: bad,
    });
    assert.equal(rejected.status, 400, await rejected.text());
  });
  it('uploads a valid WOFF2 face and rejects a stale draft revision after the bytes are staged', async () => {
    const revision = (await branding.getAdminState('default')).draft.revision;
    async function upload() {
      const data = new FormData();
      data.append('expectedDraftRevision', String(revision));
      data.append(
        'face',
        new Blob([await readFile(resolve('../../test/resources/fonts/test-font-regular.woff2'))], {
          type: 'font/woff2',
        }),
        'regular.woff2'
      );
      return fetch(f.url + '/default/rdmp/api/branding/draft/typeface/faces/regular', {
        method: 'PUT',
        headers: { ...f.headers, 'X-ReDBox-Api-Version': '2.0' },
        body: data,
      });
    }
    const result = await upload();
    assert.equal(result.status, 200, await result.text());
    assert.equal((await upload()).status, 409);
    assert((await branding.getAdminState('default')).draft.typeface);
  });
  it('delivers a rendered notification to real SMTP and reports a transient rejection without claiming success', async () => {
    const before = deliveries.length;
    const sent = await request('POST', '/api/sendNotification', {
      to: 'recipient@example.test',
      from: 'sender@example.test',
      subject: 'Owned mail',
      template: 'test',
      format: 'text',
      data: { name: 'Reader' },
    });
    assert.equal(sent.response.status, 200, JSON.stringify(sent.body));
    assert.equal(deliveries.length, before + 1);
    assert(deliveries.at(-1)!.includes('Hello Reader'));
    smtpFailures = true;
    const failed = await request('POST', '/api/sendNotification', {
      to: 'recipient@example.test',
      template: 'test',
      data: { name: 'Retry' },
    });
    smtpFailures = false;
    assert.equal(failed.response.status, 500, JSON.stringify(failed.body));
    assert.equal(deliveries.length, before + 1);
    assert.equal(
      (await request('POST', '/api/sendNotification', { to: 'recipient@example.test', template: '../private' }))
        .response.status,
      400
    );
  });
  it('indexes persisted records and limits removeAll to the authenticated brand in actual Solr', async () => {
    const created = await request('POST', '/api/records/metadata/dataRecord', { metadata: { title: 'Indexed owner' } });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    await f.search.index('foreign-index-fixture', {
      redboxOid: 'foreign-index-fixture',
      metadata: { title: 'Foreign' },
      metaMetadata: { brandId: f.otherBrand.id, type: 'dataRecord' },
      authorization: { view: [], edit: [] },
    });
    assert.equal((await request('POST', '/api/search/index?oid=' + created.body.data.oid, {})).response.status, 200);
    assert.equal((await request('POST', '/api/search/index?oid=foreign-index-fixture', {})).response.status, 404);
    const indexed = await request('POST', '/api/search/indexAll', {});
    assert.equal(indexed.response.status, 200, JSON.stringify(indexed.body));
    const removed = await request('POST', '/api/search/removeAll', {});
    assert.equal(removed.response.status, 200, JSON.stringify(removed.body));
    const results = await fetch(
      'http://127.0.0.1:' +
        process.env.HTTP_READ_SOLR_PORT +
        '/solr/redbox/select?q=' +
        encodeURIComponent('id:foreign-index-fixture')
    );
    assert.equal((await results.json()).response.numFound, 1);
    const own = await fetch(
      'http://127.0.0.1:' +
        process.env.HTTP_READ_SOLR_PORT +
        '/solr/redbox/select?q=' +
        encodeURIComponent('id:' + created.body.data.oid)
    );
    assert.equal((await own.json()).response.numFound, 0);
  });
  it('denies foreign roles and malformed administration before provider effects', async () => {
    const callsBefore = calls;
    for (const [method, path] of [
      ['POST', '/api/branding/draft'],
      ['POST', '/api/figshare-vocabularies/previews'],
      ['PUT', '/api/siem/config'],
    ])
      assert([401, 403].includes((await request(method!, path!, {}, {})).response.status), path);
    assert.equal(calls, callsBefore);
    assert.equal(
      (await request('POST', '/api/branding/draft', { variables: [], expectedDraftRevision: 1 })).response.status,
      400
    );
    assert.equal((await request('GET', '/api/figshare-vocabularies/sources/' + f.otherBrand.id)).response.status, 404);
  });
});
