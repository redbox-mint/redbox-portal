/** Disposable integrated host for the repository's Docker Playwright runner. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { firstValueFrom } from 'rxjs';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { pageFixture } from './pageFixture';
import { PageArtifacts } from '../../src/pages/Artifacts';
import {
  registerPersistenceResource,
  persistenceStatus,
  runAcceptedPersistenceWork,
} from '../../src/persistence/runtime';
import { getReferenceRepositories } from '../../src/persistence/reference/runtime';
import { ensureProgressPersistenceIndexes } from '../../src/persistence/progress/preflight';
import { initializeProgressPersistence, getProgressRepositories } from '../../src/persistence/progress/runtime';
import { Services as Progress } from '../../src/progress/Asynchs';
import { StreamingMultipart } from '../../src/http/express/multipart';
import { mountDatastreamWriteRoutes } from '../../src/http/express/datastreamWrites';
import { mountDatastreamReadRoutes } from '../../src/http/express/datastreamReads';
import { ResumableUploads, mountResumableUploadRoutes } from '../../src/http/express/resumableUploads';
import { CompanionUploads, mountCompanionRoutes } from '../../src/http/express/companion';
import { ProgressSockets } from '../../src/http/express/progressSockets';
import { mountProgressOperationRoutes } from '../../src/http/express/progressOperations';
import { bindHttpPolicies, pilotPolicyChain, httpAction } from '../../src/http/express';
import { installOidcAuthentication } from '../../src/http/express/identityProviders';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import type { Observable } from 'rxjs';
import type { Services as Disks } from '../../src/storage/StorageManager';
import type { DatastreamService } from '../../src/DatastreamService';
interface PdfOwner {
  initialize(): Promise<void>;
  activate(): Promise<void>;
  drain(): Promise<void>;
  close(): Promise<void>;
  quiesce(): void;
  createPDF(oid: string, record: unknown, options: Record<string, unknown>, user: unknown): Observable<unknown>;
}
// Load the compiled extension entrypoint in this source-checkout fixture without
// importing its emitted declarations into the source-only core typecheck.
const {
  Services: Pdf,
}: {
  Services: {
    PDF: new (input: {
      config: { appUrl: string };
      runAcceptedWork<T>(operation: () => Promise<T>): Promise<T>;
      log: {
        warn(...args: unknown[]): void;
        error(...args: unknown[]): void;
        debug(...args: unknown[]): void;
        verbose(...args: unknown[]): void;
      };
      brandById(id: string): BrandingModel | undefined;
      optionsForBrand(name: string): Record<string, unknown>;
      stagingDisk(): Disks.IDisk;
      datastreams: Pick<DatastreamService, 'addDatastream'>;
    }) => PdfOwner;
  };
} = require('../../../sails-hook-redbox-pdfgen/dist/extension');
import type { AuthBrandConfig } from '../../src/authentication/Accounts';

async function main() {
  const root = path.resolve(__dirname, '../../../..');
  const realm = JSON.parse(
    await readFile(path.join(root, 'support/integration-testing/keycloakdb/import/redbox-realm.json'), 'utf8')
  );
  const oidc: AuthBrandConfig = {
    active: ['local', 'oidc'],
    oidc: {
      discoverAttemptsMax: 1,
      userInfoSource: 'tokenset_claims',
      opts: {
        issuer: process.env.OIDC_TEST_ISSUER!,
        client: {
          client_id: 'redbox',
          client_secret: realm.clients.find((c: { clientId: string }) => c.clientId === 'redbox').secret,
          redirect_uris: ['http://127.0.0.1:1500/portal/user/login_oidc'],
        },
        params: { scope: 'openid profile email' },
      },
      claimMappings: { username: 'preferred_username', email: 'email', name: 'name' },
    } as AuthBrandConfig['oidc'],
  };
  const gate = Promise.withResolvers<void>();
  let uploadSeen = false,
    uploadSaved = false,
    tusSeen = false,
    tusSaved = false,
    remoteSeen = false,
    holdTus = false;
  let sessionSeen = false,
    pdfSeen = false,
    sessionSaved = false,
    pdfSaved = false,
    pdfBytes = 0,
    persistedPdfBytes = 0;
  let fixture!: Awaited<ReturnType<typeof pageFixture>>;
  let progress!: Progress.Asynchs, sockets!: ProgressSockets;
  let pdf!: PdfOwner;
  const source = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': '21' });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    if (req.url === '/held') {
      remoteSeen = true;
      res.write('companion-');
      void gate.promise.then(() => res.end('real-bytes!'));
    } else res.end('companion-real-bytes!');
  });
  source.listen(0, '127.0.0.1');
  await once(source, 'listening');
  const sourceUrl = 'http://127.0.0.1:' + (source.address() as { port: number }).port;
  try {
    fixture = await pageFixture({
      artifacts: PageArtifacts.installed(path.join(root, '.tmp/playwright/installed-pages')),
      port: 1500,
      auth: oidc,
      prepare: async (router, f, input) => {
        const brand = Object.assign(new BrandingModel(), f.brand);
        await installOidcAuthentication({
          passport: input.realtime.auth.passport,
          accounts: input.accounts,
          config: oidc,
          brand: () => brand,
        });
        const refs = getReferenceRepositories(f.owner);
        const form = await refs.forms.findByName('dataRecord', f.brand.id);
        assert(form?.configuration);
        await refs.forms.removeByName('dataRecord', f.brand.id);
        await refs.forms.createDefinition({
          name: 'dataRecord',
          branding: f.brand.id,
          configuration: {
            ...(form.configuration as Record<string, unknown>),
            componentDefinitions: [
              {
                name: 'title',
                component: { class: 'SimpleInputComponent', config: { type: 'text', label: 'Title' } },
                model: { class: 'SimpleInputModel', config: { defaultValue: 'Default title' } },
              },
              {
                name: 'save',
                component: {
                  class: 'SaveButtonComponent',
                  config: { label: 'Save draft', labelSaving: 'Saving', operation: 'draft', forceSave: true },
                },
              },
            ],
          },
        });
        const origin = 'http://127.0.0.1:1500';
        const multipart = new StreamingMultipart(input.disks.stagingDisk(), {
          files: 4,
          fileSize: 1024 * 1024,
          fields: 10,
          fieldSize: 1024,
        });
        registerPersistenceResource(f.owner, 'browser-multipart', multipart);
        mountDatastreamWriteRoutes(router, {
          ...input,
          records: input.writer,
          multipart,
          log: nothingLogger,
          datastream: {
            addDatastreams: async (oid, files) => {
              const held = files.some(file => file.metadata.name === 'held-upload.txt');
              if (held) {
                uploadSeen = true;
                await gate.promise;
              }
              const result = await input.datastream.addDatastreams(oid, files);
              if (held) {
                assert(result.isSuccessful());
                uploadSaved = true;
              }
              return result;
            },
          },
        });
        mountDatastreamReadRoutes(router, { ...input, records: input.writer, log: nothingLogger });
        const uploads = new ResumableUploads({
          disk: input.disks.stagingDisk(),
          records: input.writer,
          maxSize: 1024 * 1024,
          origins: [origin],
          rootContext: '/portal',
          log: nothingLogger,
          authorizePending: async () => false,
          audit: async (actor, action, context) => {
            const held = holdTus && action === 'attachment-upload-completed';
            if (held) {
              tusSeen = true;
              await gate.promise;
            }
            const result = await input.users.addUserAuditEvent(actor, action, context);
            if (held) tusSaved = true;
            return result;
          },
        });
        registerPersistenceResource(f.owner, 'browser-tus', uploads);
        mountResumableUploadRoutes(router, { ...input, uploads });
        const companion = new CompanionUploads({
          owner: f.owner,
          path: '/companion',
          origins: [origin],
          isReady: () => f.application.status().ready,
          options: {
            secret: 'synthetic-browser-companion-secret-at-least-32',
            filePath: path.join(root, '.tmp/playwright/companion-pages'),
            metrics: false,
            providerOptions: {},
            enableUrlEndpoint: true,
            allowLocalUrls: true,
            streamingUpload: false,
            chunkSize: 65536,
            clientSocketConnectTimeout: 3000,
            uploadUrls: [origin + '/portal/default/rdmp/companion/record'],
            server: { host: '127.0.0.1:1500', protocol: 'http', path: '/companion', implicitPath: '/portal' },
          },
        });
        await companion.initialize(input.realtime.server);
        mountCompanionRoutes(router, {
          ...input,
          uploads: companion,
          path: '/companion',
          context: req => ({ branding: String(req.session.branding ?? 'default'), portal: 'rdmp' }),
          audit: (actor, action, context) => input.users.addUserAuditEvent(actor, action, context),
        });
        await ensureProgressPersistenceIndexes(f.owner);
        await initializeProgressPersistence(f.owner);
        progress = new Progress.Asynchs(getProgressRepositories(f.owner).progress);
        sockets = new ProgressSockets({
          owner: f.owner,
          path: '/portal/progress/socket.io',
          origins: [origin],
          records: input.writer,
          progress,
          authenticate: input.realtime.authenticateCredential,
        });
        registerPersistenceResource(f.owner, 'browser-progress', sockets);
        sockets.attach(input.realtime.server);
        mountProgressOperationRoutes(router, {
          ...input,
          records: input.writer,
          progress,
          sockets,
          log: nothingLogger,
          audit: (actor, action, context) => input.users.addUserAuditEvent(actor, action, context),
        });
        pdf = new Pdf.PDF({
          runAcceptedWork: operation => runAcceptedPersistenceWork(f.owner, operation),
          config: { appUrl: origin + '/portal' },
          log: { ...nothingLogger, error: (...args: unknown[]) => console.error(...args) },
          brandById: id => (id === brand.id ? brand : undefined),
          optionsForBrand: () => ({
            token: 'pilot-api-token',
            maxRetries: 0,
            pdfPrefix: 'proof',
            readinessStrategy: 'jsFlag',
            waitForFunction: `(() => { const form = document.querySelector('redbox-form'); return form && (form.textContent.includes('Provider lifetime record') || [...form.querySelectorAll('input')].some(input => input.value === 'Provider lifetime record')); })()`,
            readinessTimeout: 30000,
            sourceUrlBase: '/default/rdmp/record/view',
          }),
          stagingDisk: () => input.disks.stagingDisk(),
          datastreams: {
            addDatastream: async (...args) => {
              const bytes = await input.disks.stagingDisk().getBytes(args[1].fileId);
              assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), '%PDF');
              pdfBytes = bytes.byteLength;
              pdfSeen = true;
              await gate.promise;
              const result = await input.datastream.addDatastream(...args);
              const prefix = input.disks.getMergedStorageConfig().keyPrefix?.replace(/\/+$/, '') ?? '';
              const persisted = await input.disks
                .primaryDisk()
                .getBytes((prefix ? prefix + '/' : '') + args[0] + '/' + args[1].fileId);
              assert.equal(Buffer.from(persisted).subarray(0, 4).toString(), '%PDF');
              persistedPdfBytes = persisted.byteLength;
              pdfSaved = true;
              return result;
            },
          },
        });
        await pdf.initialize();
        await pdf.activate();
        registerPersistenceResource(f.owner, 'browser-pdf', pdf);
        const policies = bindHttpPolicies(
          pilotPolicyChain.map(name => name.toLowerCase()),
          input.policies
        );
        router.post(
          '/:branding/:portal/__test/pdf/:oid',
          ...policies,
          input.csrf.protect,
          httpAction(async (req, res) => {
            const record = await input.storage.getMeta(String(req.params.oid));
            assert(record);
            await firstValueFrom(pdf.createPDF(String(req.params.oid), record, {}, {}));
            res.json({ accepted: true });
          })
        );
        router.post(
          '/:branding/:portal/__test/held-session',
          ...policies,
          input.csrf.protect,
          httpAction(async (req, res) => {
            Reflect.set(req.session, 'lifetimeProof', 'persisted-after-abort');
            sessionSeen = true;
            await gate.promise;
            await new Promise<void>((resolve, reject) =>
              req.session.save(error => (error ? reject(error) : resolve()))
            );
            sessionSaved = true;
            res.json({ saved: true });
          })
        );
      },
    });
  } catch (error) {
    await new Promise<void>(resolve => source.close(() => resolve()));
    throw error;
  }
  const control = createServer(async (req, res) => {
    try {
      const url = new URL(req.url!, 'http://localhost');
      const oid = url.searchParams.get('oid') ?? '';
      let result: unknown;
      switch (url.pathname) {
        case '/status':
          result = {
            pid: process.pid,
            upgradeListeners: Reflect.get(fixture.host, 'server').listenerCount('upgrade'),
            ...fixture.host.status(),
            persistence: persistenceStatus(fixture.owner),
            sessionSeen,
            pdfSeen,
            sessionSaved,
            pdfSaved,
            uploadSeen,
            uploadSaved,
            tusSeen,
            tusSaved,
            remoteSeen,
            pdfBytes,
            persistedPdfBytes,
            sessionPersisted: (await fixture.native.db().collection('pilotSessions').find().toArray()).filter(
              entry => JSON.parse(entry.session).lifetimeProof === 'persisted-after-abort'
            ).length,
          };
          break;
        case '/record':
          result = await fixture.native.db().collection('record').findOne({ redboxOid: oid });
          break;
        case '/staged': {
          const key = url.searchParams.get('key')!;
          assert(/^[a-f0-9]{32}$/.test(key));
          result = { bytes: await fixture.disks.stagingDisk().get(key) };
          break;
        }
        case '/hold-tus':
          holdTus = true;
          result = { holding: true };
          break;
        case '/release':
          gate.resolve();
          result = { released: true };
          break;
        case '/stop':
          try {
            await fixture.host.stop({ deadlineMs: 250 });
            result = { stopped: true };
          } catch {
            result = { stopFailed: true, status: fixture.host.status(), persistence: persistenceStatus(fixture.owner) };
          }
          break;
        case '/retry':
          await fixture.host.stop({ deadlineMs: 10000 });
          result = {
            upgradeListeners: Reflect.get(fixture.host, 'server').listenerCount('upgrade'),
            status: fixture.host.status(),
            persistence: persistenceStatus(fixture.owner),
          };
          break;
        default:
          res.writeHead(404).end();
          return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
    } catch (error) {
      console.error(error);
      res.writeHead(500).end(JSON.stringify({ error: String(error) }));
    }
  });
  control.listen(0, '127.0.0.1');
  await once(control, 'listening');
  await mkdir(path.join(root, '.tmp/playwright'), { recursive: true });
  await writeFile(
    path.join(root, '.tmp/playwright/sr-pages-host.json'),
    JSON.stringify({
      url: fixture.url,
      sourceUrl,
      control: 'http://127.0.0.1:' + (control.address() as { port: number }).port,
    })
  );
  console.log('Standalone browser fixture ready', fixture.url);
  process.once('SIGTERM', () => {
    void (async () => {
      gate.resolve();
      await fixture.close();
      await new Promise<void>(resolve => source.close(() => resolve()));
      await new Promise<void>(resolve => control.close(() => resolve()));
      console.log('Standalone browser fixture closed');
    })().catch(console.error);
  });
}
void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
