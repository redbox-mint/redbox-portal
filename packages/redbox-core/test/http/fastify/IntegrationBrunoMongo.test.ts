import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { referenceProductionFixture } from './referenceProductionFixture';
import { integrationDeclarations } from '../../../src/http/integrationRoutes';
import { recordQueryReadDeclarations } from '../../../src/http/readRoutes';
import { integrationProviderFixture } from './integrationProviderFixture';
import { seedIntegrations } from './integrationDifferentialSupport';
const execute = promisify(execFile);
const brandingSequences = new Set([1, 18, 19, 20, 21, 22, 30, 31, 32, 35, 36, 37, 40, 41, 42, 43, 44, 45, 49, 50]);
/** Existing requests/assertions run on the production native host. The selected
 * profile subsets exclude P4 rendering and P5 uploads rather than claiming them. */
describe('FM-027 existing Bruno integration profiles on Fastify', function () {
  this.timeout(300000);
  for (const profile of ['REST-vocabulary', 'REST-branding', 'REST-search', 'REST-email', 'AJAX-vocabulary'] as const)
    it(profile, async () => {
      const directory = await mkdtemp(path.join(tmpdir(), 'fm027-bruno-')),
        provider = await integrationProviderFixture();
      let f: Awaited<ReturnType<typeof referenceProductionFixture>> | undefined;
      try {
        const tailscale = JSON.parse((await execute('tailscale', ['status', '--json'], { timeout: 10000 })).stdout);
        const dns = String(tailscale.Self.DNSName).replace(/\.$/, '');
        assert(dns);
        const publicUrl = 'http://' + dns + ':35027';
        if (profile === 'REST-search') {
          const schema = 'http://127.0.0.1:' + process.env.HTTP_READ_SOLR_PORT + '/solr/redbox/schema';
          const field = await fetch(schema + '/fields/date_object_modified');
          if (!field.ok) {
            assert.equal(field.status, 404);
            const prepared = await fetch(schema, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                'add-field': {
                  name: 'date_object_modified',
                  type: 'pdate',
                  indexed: true,
                  stored: true,
                  docValues: true,
                },
              }),
            });
            assert(prepared.ok, await prepared.text());
          }
        }
        f = await referenceProductionFixture(true, undefined, undefined, {
          declarations: [...integrationDeclarations, ...recordQueryReadDeclarations],
          configuration: {
            ...provider.configuration,
            ...(profile === 'REST-email'
              ? {
                  emailnotification: {
                    settings: {
                      ...provider.configuration.emailnotification.settings,
                      templateDir: path.resolve(__dirname, '../../../../../views/emailTemplates') + '/',
                    },
                  },
                }
              : {}),
            vocab: {
              ...provider.configuration.vocab,
              queries: {
                ...provider.configuration.vocab.queries,
                rdmp: provider.configuration.vocab.queries.owned,
                party: {
                  querySource: 'solr',
                  searchQuery: { searchCore: 'default', baseQuery: '*:*' },
                  queryField: { property: 'fullName', type: 'text' },
                  resultObjectMapping: { fullName: 'record.fullName', email: 'record.email', orcid: 'record.orcid' },
                },
              },
              services: {
                ...provider.configuration.vocab.services,
                dataciteDois: provider.configuration.vocab.services.datacite,
              },
            },
            server: {
              rootContext: '/portal',
              hostname: '0.0.0.0',
              port: 35027,
              trustProxy: true,
              stopDeadlineMs: 30000,
              publicUrl,
            },
          },
        });
        await seedIntegrations(f);
        await f.data.reference.vocabulary.get().create({
          branding: f.brand.id,
          name: 'ANZSRC fixture',
          slug: 'anzsrc-2020-for',
          entries: [{ label: 'Artificial intelligence', identifier: '0801', value: '0801' }],
        });
        const collection = path.resolve(__dirname, '../../../../../test/bruno');
        let selected: string[];
        if (profile === 'REST-vocabulary') selected = ['1 - REST API/11 - Vocabulary'];
        else if (profile === 'REST-email') selected = ['1 - REST API/8 - Email'];
        else if (profile === 'AJAX-vocabulary') selected = ['2 - AJAX calls/1 - Admin User Tests/Vocabulary'];
        else if (profile === 'REST-search') {
          const folder = '1 - REST API/3 - Search';
          selected = (await readdir(path.join(collection, folder)))
            .filter(
              name => name.endsWith('.bru') && !['Create Record For Search.bru', 'Search Index.bru'].includes(name)
            )
            .map(name => folder + '/' + name);
        } else {
          const folder = '1 - REST API/10 - Branding';
          selected = [];
          for (const name of await readdir(path.join(collection, folder)))
            if (brandingSequences.has(Number(name.split(' - ')[0]))) selected.push(folder + '/' + name);
        }
        const envFile = path.join(directory, 'environment.bru');
        await writeFile(
          envFile,
          'vars {\n host: ' + publicUrl + '/portal\n token: pilot-api-token\n dmpOid: reference-record\n}\n'
        );
        const report = path.join(directory, 'bruno.json');
        const result = await execute(
          process.execPath,
          [
            path.join(collection, 'node_modules/@usebruno/cli/bin/bru.js'),
            'run',
            ...selected,
            '--sandbox',
            'developer',
            '--env-file',
            envFile,
            '--reporter-json',
            report,
            '--reporter-skip-all-headers',
          ],
          {
            cwd: collection,
            timeout: 180000,
            maxBuffer: 4 * 1024 * 1024,
            env: { ...process.env, NO_PROXY: dns, no_proxy: dns, REDBOX_PORTAL_APP_URL: publicUrl },
          }
        ).catch(async (error: unknown) => {
          const failure = error as Error & { stdout?: string; stderr?: string };
          if (process.env.FM027_BRUNO_DIRECTORY) {
            await writeFile(
              path.join(process.env.FM027_BRUNO_DIRECTORY, profile + '.log'),
              (failure.stdout ?? '') + '\n' + (failure.stderr ?? '')
            );
            const raw = await readFile(report, 'utf8').catch(() => undefined);
            if (raw) await writeFile(path.join(process.env.FM027_BRUNO_DIRECTORY, profile + '.json'), raw);
          }
          throw error;
        });
        const raw = await readFile(report, 'utf8');
        if (process.env.FM027_BRUNO_DIRECTORY) {
          await writeFile(path.join(process.env.FM027_BRUNO_DIRECTORY, profile + '.json'), raw);
          await writeFile(
            path.join(process.env.FM027_BRUNO_DIRECTORY, profile + '.log'),
            result.stdout + '\n' + result.stderr
          );
        }
        console.log(result.stdout);
        const warnings = (result.stdout + '\n' + result.stderr).split('\n').filter(line => line.includes('[WARN]'));
        if (profile === 'REST-search') {
          // Retained Express also maps malformed ObjectId parent input to 500.
          // Pin it explicitly instead of treating the collection's two warning
          // branches as successful 400 assertions. See FM-027 deferred issues.
          const runs = JSON.parse(raw) as {
            results: {
              test: { filename: string };
              response?: { status: number; data: { errors?: { code: string }[] } };
            }[];
          }[];
          const invalidParent = runs
            .flatMap(run => run.results)
            .find(row => row.test.filename.endsWith('/Get Form Vocabulary Children Invalid Parent.bru'));
          assert.equal(invalidParent?.response?.status, 500);
          assert.equal(invalidParent?.response?.data.errors?.[0].code, 'vocabulary-children-failed');
          assert.equal(warnings.length, 2);
          assert(
            warnings.every(line =>
              /Children invalid-parent endpoint returned 500|Skipping invalid-parent error code assertion/.test(line)
            )
          );
        } else assert.equal(warnings.length, 0, 'Provider success assertions must actually execute');
        assert(!/did not succeed/i.test(result.stdout));
        if (profile === 'REST-email')
          assert.equal(provider.deliveries.length, 1, 'Exactly one successful request must deliver mail');
        if (profile === 'REST-search')
          assert(
            provider.calls.some(call => call.path.startsWith('/dois')),
            'DataCite success must use the real network client'
          );
      } finally {
        await f?.close();
        await provider.close();
        await rm(directory, { recursive: true, force: true });
      }
    });
});
