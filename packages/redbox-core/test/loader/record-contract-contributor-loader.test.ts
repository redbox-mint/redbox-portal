import { expect } from 'chai';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CORE_RECORD_CONTRACT_COMPONENT_INVENTORY,
  createCoreRecordContractContributors,
  RecordContractContributorRegistry,
  RecordContractContributorRegistrationError,
  RECORD_CONTRACT_REGISTRATION_CODES,
} from '../../src/record-contract';
import type { RecordContractComponentContributor, RecordContractContributorRegistration } from '../../src/record-contract';
import { loadExtensions } from '../../src/extensions';

const contributor = (key: string, componentType: string): RecordContractComponentContributor => ({
  kind: 'component', key, version: '1', componentType, ownedPointers: [''], nullability: 'non-null',
  compile: () => ({ kind: 'node', node: { kind: 'scalar', nullable: false, scalarType: 'string' } }),
});

describe('explicit record-contract contributor registration', () => {
  let appPath: string;
  let dependencies: Record<string, string>;
  let bindings: Record<string, RecordContractComponentContributor>;
  beforeEach(async () => {
    appPath = await fs.mkdtemp(path.join(os.tmpdir(), 'record-contract-extension-'));
    dependencies = {};
    bindings = {};
    await fs.writeFile(path.join(appPath, 'package.json'), JSON.stringify({ dependencies }));
  });
  afterEach(async () => fs.rm(appPath, { recursive: true, force: true }));
  async function addHook(name: string, declaration: string) {
    const root = path.join(appPath, 'node_modules', name);
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js', redbox: { extension: '.' } }));
    await fs.writeFile(path.join(root, 'index.js'), declaration);
    dependencies[name] = '1.0.0';
    await fs.writeFile(path.join(appPath, 'package.json'), JSON.stringify({ dependencies }));
  }
  async function registry() {
    const resolved = await loadExtensions(appPath);
    const registrations: RecordContractContributorRegistration[] = createCoreRecordContractContributors().map(item => ({ contributor: item, source: 'core' }));
    for (const provider of resolved.providers) for (const item of provider.declaration.contributors ?? []) {
      if (!Object.hasOwn(bindings, item.name)) throw new Error('Unregistered record contract contributor: ' + item.name);
      registrations.push({ contributor: bindings[item.name], source: 'hook', packageName: provider.name });
    }
    return new RecordContractContributorRegistry(registrations);
  }
  async function addContributor(name: string, key: string, componentType: string) {
    bindings[key] = contributor(key, componentType);
    await addHook(name, `exports.registerRedboxExtension = () => ({ apiVersion: 1, modules: [{name: 'owner-${key.replaceAll('.', '-')}', create() { throw new Error('offline'); }}], contributors: [{name: '${key.replaceAll('.', '-')}', module: 'owner-${key.replaceAll('.', '-')}'}] });`);
    bindings[key.replaceAll('.', '-')] = bindings[key];
  }
  it('preserves extensions without contributors and retains the core registry', async () => {
    await addHook('@test/no-contributors', 'exports.registerRedboxExtension = () => ({ apiVersion: 1 });');
    const state = await registry();
    expect(state.registrations()).to.have.length(Object.keys(CORE_RECORD_CONTRACT_COMPONENT_INVENTORY).length);
    expect(state.component('SimpleInputComponent')).not.to.equal(undefined);
  });
  it('loads explicit bindings with deterministic ordering and package attribution', async () => {
    await addContributor('@test/zeta', 'hook.zeta', 'ZetaHookComponent');
    await addContributor('@test/alpha', 'hook.alpha', 'AlphaHookComponent');
    const state = await registry();
    expect(state.registrations().filter(item => item.source === 'hook').map(item => item.contributor.key)).to.deep.equal(['hook.alpha', 'hook.zeta']);
    expect(state.component('AlphaHookComponent')?.packageName).to.equal('@test/alpha');
  });
  it('aggregates duplicate component registrations into a stable registry error', async () => {
    await addContributor('@test/first', 'hook.first', 'DuplicateHookComponent');
    await addContributor('@test/second', 'hook.second', 'DuplicateHookComponent');
    let failure: unknown;
    try { await registry(); } catch (error) { failure = error; }
    expect(failure).to.be.instanceOf(RecordContractContributorRegistrationError);
    expect((failure as RecordContractContributorRegistrationError).issues.map(issue => issue.code)).to.include(RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_COMPONENT);
  });
  it('rejects malformed declarations and sanitizes throwing offline registration', async () => {
    await addHook('@test/non-array', 'exports.registerRedboxExtension = () => ({ apiVersion: 1, contributors: {} });');
    let failure: unknown;
    try { await registry(); } catch (error) { failure = error; }
    expect(String(failure)).to.include('@test/non-array').and.include('contributors must be an array');
    await fs.rm(path.join(appPath, 'node_modules/@test/non-array'), { recursive: true });
    delete dependencies['@test/non-array'];
    await addHook('@test/throws', 'exports.registerRedboxExtension = () => { throw new Error("secret"); };');
    try { await registry(); } catch (error) { failure = error; }
    expect(String(failure)).to.include('@test/throws').and.include('registration failed').and.not.include('secret');
  });
  it('fails closed for an unbound contributor without generating a service shim', async () => {
    await addContributor('@test/missing', 'hook.missing', 'MissingHookComponent');
    delete bindings['hook-missing'];
    let failure: unknown;
    try { await registry(); } catch (error) { failure = error; }
    expect(String(failure)).to.include('Unregistered record contract contributor: hook-missing');
    try { await fs.access(path.join(appPath, 'api/services/RecordSchemaService.js')); throw new Error('Unexpected shim'); }
    catch (error) { expect((error as NodeJS.ErrnoException).code).to.equal('ENOENT'); }
    expect(createCoreRecordContractContributors()).to.have.length(Object.keys(CORE_RECORD_CONTRACT_COMPONENT_INVENTORY).length);
  });
  it('keeps contributor implementation separate from its neutral declaration', async () => {
    await addContributor('@test/defined', 'hook.defined', 'DefinedHookComponent');
    const resolved = await loadExtensions(appPath);
    expect(resolved.providers[0].declaration.contributors).to.deep.equal([{ name: 'hook-defined', module: 'owner-hook-defined' }]);
    const state = await registry();
    expect(state.component('DefinedHookComponent')?.contributor.compile).to.equal(bindings['hook-defined'].compile);
  });
});
