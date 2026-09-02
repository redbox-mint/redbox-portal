import { expect } from 'chai';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import {
  CORE_RECORD_CONTRACT_COMPONENT_INVENTORY,
  defineRedboxHook,
  discoverRecordContractContributorRegistry,
  generateAllShims,
  RECORD_CONTRACT_REGISTRATION_CODES,
} from '../../src';
import type { RecordContractComponentContributor } from '../../src';

const contributorSource = (key: string, componentType: string): string => `
module.exports.registerRecordContractContributors = () => [{
  kind: 'component',
  key: ${JSON.stringify(key)},
  version: '1',
  componentType: ${JSON.stringify(componentType)},
  ownedPointers: [''],
  nullability: 'non-null',
  compile: () => ({
    kind: 'node',
    node: { kind: 'scalar', nullable: false, scalarType: 'string' }
  })
}];
`;

describe('record-contract contributor loader discovery', function () {
  let appPath: string;
  const dependencies: Record<string, string> = {};

  beforeEach(async function () {
    appPath = await fs.mkdtemp(path.join(os.tmpdir(), 'record-contract-loader-'));
    for (const key of Object.keys(dependencies)) {
      delete dependencies[key];
    }
    await writeAppPackage();
  });

  afterEach(async function () {
    await fs.rm(appPath, { recursive: true, force: true });
  });

  async function writeAppPackage(): Promise<void> {
    await fs.writeFile(
      path.join(appPath, 'package.json'),
      JSON.stringify({ name: 'record-contract-loader-test', dependencies })
    );
  }

  async function addHook(packageName: string, source: string): Promise<void> {
    const packagePath = path.join(appPath, 'node_modules', packageName);
    await fs.mkdir(packagePath, { recursive: true });
    await fs.writeFile(
      path.join(packagePath, 'package.json'),
      JSON.stringify({ name: packageName, version: '1.0.0', main: 'index.js', sails: { isHook: true } })
    );
    await fs.writeFile(path.join(packagePath, 'index.js'), source);
    dependencies[packageName] = '1.0.0';
    await writeAppPackage();
  }

  it('preserves hooks without a contributor method and retains the discovered core registry', async function () {
    await addHook('@test/no-contributors', 'module.exports = {};');

    const state = await discoverRecordContractContributorRegistry(appPath);

    expect(state.registrations).to.have.length(Object.keys(CORE_RECORD_CONTRACT_COMPONENT_INVENTORY).length);
    expect(state.componentTypes).to.include('SimpleInputComponent');
    expect(state.registrationIssues).to.deep.equal([]);
  });

  it('loads valid contributors with deterministic ordering', async function () {
    await addHook('@test/zeta', contributorSource('hook.zeta', 'ZetaHookComponent'));
    await addHook('@test/alpha', contributorSource('hook.alpha', 'AlphaHookComponent'));

    const state = await discoverRecordContractContributorRegistry(appPath);
    const hookKeys = state.registrations
      .filter(registration => registration.source === 'hook')
      .map(registration => registration.contributor.key);

    expect(hookKeys).to.deep.equal(['hook.alpha', 'hook.zeta']);
    expect(
      state.registrations.find(item => item.contributor.componentType === 'AlphaHookComponent')?.packageName
    ).to.equal('@test/alpha');
  });

  it('aggregates duplicate contributors across hooks into one sorted registration error', async function () {
    await addHook('@test/first', contributorSource('hook.first', 'DuplicateHookComponent'));
    await addHook('@test/second', contributorSource('hook.second', 'DuplicateHookComponent'));

    const state = await discoverRecordContractContributorRegistry(appPath);

    expect(state.registrationIssues.map(issue => issue.code)).to.include(
      RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_COMPONENT
    );
  });

  it('aggregates malformed and throwing hook exports with stable issue ordering', async function () {
    await addHook('@test/non-array', 'module.exports.registerRecordContractContributors = () => ({});');
    await addHook(
      '@test/throws',
      'module.exports.registerRecordContractContributors = () => { throw new Error("secret"); };'
    );

    const state = await discoverRecordContractContributorRegistry(appPath);

    expect(state.registrationIssues.map(issue => issue.code)).to.deep.equal([
      RECORD_CONTRACT_REGISTRATION_CODES.INVALID_EXPORT,
      RECORD_CONTRACT_REGISTRATION_CODES.INVALID_EXPORT,
    ]);
    expect(JSON.stringify(state.registrationIssues)).not.to.include('secret');
  });

  it('retains coverage and generates the RecordSchemaService shim when discovery finds invalid contributors', async function () {
    await addHook('@test/non-array', 'module.exports.registerRecordContractContributors = () => ({});');

    const result = await generateAllShims(appPath, { forceRegenerate: true });

    expect(result.skipped).to.equal(false);
    expect(result.recordContractContributorState.registrations).to.have.length(
      Object.keys(CORE_RECORD_CONTRACT_COMPONENT_INVENTORY).length
    );
    expect(result.recordContractContributorState.registrationIssues.map(issue => issue.code)).to.deep.equal([
      RECORD_CONTRACT_REGISTRATION_CODES.INVALID_EXPORT,
    ]);
    expect(result.recordContractContributorState.componentTypes).to.deep.equal(
      Object.keys(CORE_RECORD_CONTRACT_COMPONENT_INVENTORY).sort()
    );
    const shim = await fs.readFile(path.join(appPath, 'api', 'services', 'RecordSchemaService.js'), 'utf8');
    expect(shim).to.include("ServiceExports['RecordSchemaService']");
  });

  it('exposes the optional contributor registration through defineRedboxHook', function () {
    const contributor: RecordContractComponentContributor = {
      kind: 'component',
      key: 'hook.defined',
      version: '1',
      componentType: 'DefinedHookComponent',
      ownedPointers: [''],
      nullability: 'non-null',
      compile: () => ({
        kind: 'node',
        node: { kind: 'scalar', nullable: false, scalarType: 'string' },
      }),
    };
    const hook = defineRedboxHook({ registerRecordContractContributors: () => [contributor] });

    expect(hook.registerRecordContractContributors?.()).to.deep.equal([contributor]);
  });
});
