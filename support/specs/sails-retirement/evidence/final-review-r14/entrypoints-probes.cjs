// Source-method and CLI probes; no baseline server, HTTP, MongoDB or SQS is started.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const ts = require('typescript');
const rx = require('rxjs');
const operators = require('rxjs/operators');
const _ = require('lodash');
const base = 'a49366803';
const observations = [];
function source(file, before = false) {
  return before ? cp.execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' }) : fs.readFileSync(file, 'utf8');
}
function node(file, name, before, kind = 'method') {
  const sf = ts.createSourceFile(file, source(file, before), 99, true);
  let found;
  function visit(n) {
    if ((kind === 'method' ? ts.isMethodDeclaration(n) : ts.isFunctionDeclaration(n)) && n.name?.getText(sf) === name)
      found = n;
    ts.forEachChild(n, visit);
  }
  visit(sf);
  assert(found, `${file}: ${name}`);
  return { text: found.getText(sf).replace(/^export /, ''), file, line: sf.getLineAndCharacterOfPosition(found.getStart(sf)).line + 1 };
}
function execute(declaration, context, name, kind = 'method') {
  const script = kind === 'method' ? `class Probe { ${declaration.text} }` : declaration.text;
  const js = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2024 } }).outputText;
  return Function('context', `with (context) { ${js}; return ${kind === 'method' ? `Probe.prototype.${name}` : name}; }`)(context);
}
const logger = new Proxy({}, { get: () => () => {} });
async function settle(result) { return rx.isObservable(result) ? rx.firstValueFrom(result) : await result; }
async function probe(id, work) {
  const result = await work();
  observations.push({ id, ...result });
}
(async () => {
  // Actual baseline/current defineJobs methods: same named handlers, job identity,
  // options and rejection propagation. Real backend claim/ack is not simulated.
  for (const before of [true, false]) {
    const file = `packages/redbox-core/src/${before ? 'services/AgendaQueueService' : 'queues/AgendaQueue'}.ts`;
    const declaration = node(file, 'defineJobs', before);
    const catalog = source('packages/redbox-core/src/config/agendaQueueJobs.ts');
    const names = [...catalog.matchAll(/fnName: '([^']+)'/g)].map(m => m[1]);
    names.push('rdmpservice.queuedTriggerSubscriptionHandler');
    for (const [index, fnName] of names.entries()) {
      await probe(`queue-dispatch:${before ? 'baseline' : 'current'}:${fnName}`, async () => {
        const inputJob = { attrs: { name: `probe-${index}`, data: { value: index } } };
        const sentinel = new Error('expected handler rejection');
        const serviceFn = async job => { assert.equal(job, inputJob); return 'handler-result'; };
        const failing = async () => { throw sentinel; };
        let captured;
        const host = {
          input: { handler: name => name === fnName ? serviceFn : undefined, log: logger },
          getBackendForJob: () => 'selected',
          getAgendaForBackend: backend => { assert.equal(backend, 'selected'); return { define: (...args) => { captured = args; } }; },
          acceptedJob: fn => fn,
        };
        const services = {}; _.set(services, fnName, serviceFn);
        const method = execute(declaration, { _, sails: { services, log: logger } }, 'defineJobs');
        for (const options of [undefined, { concurrency: 2, lockLifetime: 1200 }]) {
          method.call(host, [{ name: inputJob.attrs.name, fnName, options }]);
          assert.equal(captured[0], inputJob.attrs.name);
          assert.equal(captured[1], serviceFn);
          assert.equal(captured[2], options);
          assert.equal(await captured[1](inputJob), 'handler-result');
        }
        host.input.handler = () => failing; _.set(services, fnName, failing);
        method.call(host, [{ name: inputJob.attrs.name, fnName }]);
        await assert.rejects(captured[1](inputJob), error => error === sentinel);
        return { provenance: declaration, result: 'same job identity/options/handler value and rejection', transport: 'source-method, backend fixture' };
      });
    }
  }
  for (const before of [true, false]) {
    const file = `packages/redbox-core/src/${before ? 'services/RDMPService' : 'records/RecordTriggers'}.ts`;
    for (const outcome of ['observable', 'promise', 'throw', 'reject']) {
      await probe(`queued-hook:${before ? 'baseline' : 'current'}:${outcome}`, async () => {
        const declaration = node(file, 'queuedTriggerSubscriptionHandler', before);
        const record = { metadata: { title: 'source record' } }, user = { username: 'actor' }, options = { flag: true };
        const marker = { result: true }, failure = new Error('expected hook failure');
        const callback = (...args) => {
          assert.deepEqual(args, ['oid', record, options, user]);
          if (outcome === 'throw') throw failure;
          if (outcome === 'reject') return Promise.reject(failure);
          return outcome === 'promise' ? Promise.resolve(marker) : rx.of(marker, { ignored: true });
        };
        const functionName = before ? 'sails.services.example.run' : 'example.run';
        const method = execute(declaration, { _, ...rx, sails: { services: { example: { run: callback } } }, validateRecordHookConfiguration: () => {} }, 'queuedTriggerSubscriptionHandler');
        const receiver = { input: { resolveHook: name => { assert.equal(name, functionName); return callback; } }, updateChronicle() {}, convertToObservable: v => rx.isObservable(v) ? v : rx.from(v) };
        const call = async () => settle(method.call(receiver, { attrs: { name: 'job', data: { oid: 'oid', record, user, triggerConfiguration: { function: functionName, options } } } }));
        if (['throw', 'reject'].includes(outcome)) await assert.rejects(call, e => e === failure);
        else assert.equal(await call(), marker);
        return { provenance: declaration, result: 'four argument identities, first Observable value / Promise value / identical failure', limitation: 'nested validation stubbed; permanent tests cover validation' };
      });
    }
    for (const phase of ['triggerPreSaveTriggers', 'triggerPostSaveSyncTriggers', 'triggerPostSaveTriggers']) {
      for (const failureMode of [false, true]) {
        await probe(`account-hook:${before ? 'baseline' : 'current'}:${phase}:${failureMode ? 'reject' : 'resolve'}`, async () => {
          const file = `packages/redbox-core/src/${before ? 'services/UsersService' : 'authentication/Accounts'}.ts`;
          const declaration = node(file, phase, before), user = { username: 'actor' }, options = { flag: true }, response = { status: 200 };
          const mode = phase === 'triggerPreSaveTriggers' ? 'pre' : phase === 'triggerPostSaveSyncTriggers' ? 'postSync' : 'post';
          const failure = new Error('expected callback rejection'), value = { returned: true };
          let callbackWork, called = false;
          const callback = (...args) => {
            called = true;
            assert.equal(args[0], user); assert.equal(args[1], options);
            assert.equal(args.length, mode === 'post' ? 2 : 3);
            if (mode === 'pre') assert.equal(args[2], 'continue');
            if (mode === 'postSync') assert.equal(args[2], response);
            callbackWork = failureMode ? Promise.reject(failure) : Promise.resolve(value);
            return callbackWork;
          };
          const method = execute(declaration, { _, ...rx, sails: { services: { example: { run: callback } } } }, phase);
          const receiver = { input: { resolveHook: () => callback }, updateChronicle() {}, resolveHookResponse: settle };
          const config = { hooks: { onUpdate: { [mode]: [{ function: before ? 'sails.services.example.run' : 'example.run', options }] } } };
          const result = method.call(receiver, user, config, 'onUpdate', response);
          assert(called);
          if (failureMode && mode !== 'post') await assert.rejects(result, e => e === failure);
          else if (mode !== 'post') assert.equal(await result, value);
          else {
            if (before) assert.equal(result, undefined); else await result;
            await Promise.allSettled([callbackWork]);
          }
          return { provenance: declaration, result: mode === 'post' ? 'two arguments; callback rejection logged/swallowed; v6 awaits completion' : 'three arguments, callback value / same rejection', transport: 'source-method fixture' };
        });
      }
    }
  }
  for (const before of [true, false]) {
    await probe(`storage-native-options:${before ? 'baseline' : 'current'}`, async () => {
      const file = 'packages/sails-hook-redbox-storage-mongo/src/persistence/preflight.ts';
      const declaration = node(file, 'storageIndexes', before, 'function');
      const method = execute(declaration, { storage: { mongodb: {} }, prismaStagedStorageIndexes: [] }, 'storageIndexes', 'function');
      const config = { mongodb: { indices: [{ key: { expires: 1 }, name: 'institution-expiry', expireAfterSeconds: 60, hidden: true, sparse: true }] } };
      const actual = method({ config: { storage: config } }).find(index => index.name === 'institution-expiry');
      assert.deepEqual(actual, { datastore: 'redboxStorage', collection: 'record', name: 'institution-expiry', keys: { expires: 1 }, sparse: true });
      return { provenance: declaration, result: actual, disposition: 'inherited B: expireAfterSeconds and hidden options are dropped in both sources; no database used' };
    });
  }
  for (const stringify of [false, true]) {
    await probe(`r13-session-native-consumer:stringify=${stringify}`, async () => {
      const { createRequire } = require('node:module');
      const localRequire = createRequire(path.resolve('packages/redbox-core/package.json'));
      const nativeModule = localRequire('connect-mongo');
      const NativeMongoStore = nativeModule.default ?? nativeModule;
      const session = localRequire('express-session');
      const file = 'packages/redbox-core/src/http/express/session.ts';
      const declaration = node(file, 'composeHttpSession', false, 'function');
      const optionsDeclaration = node(file, 'buildRedboxSessionOptions', false, 'function');
      let written, store, native;
      const collection = { updateOne: async (_filter, update) => { written = update.$set; return { acknowledged: true }; } };
      const client = { db: () => ({ collection: () => collection }), close: async () => {} };
      const owner = {};
      const context = {
        _, MongoStore: { create: options => (native = NativeMongoStore.create(options)) }, session,
        buildRedboxSessionOptions: execute(optionsDeclaration, { _ }, 'buildRedboxSessionOptions', 'function'),
        initializePersistence: async () => {}, mongoSessionDatabase: async () => ({ client }),
        resolveSessionDatastore: () => ({ database: 'synthetic-session-db' }),
        registerPersistenceResource: (_owner, _name, resource) => { store = resource; },
      };
      const compose = execute(declaration, context, 'composeHttpSession', 'function');
      const config = { adapter: 'mongo', secret: 'synthetic-session-test-secret', mongoUrl: 'mongodb://unused/synthetic', stringify, autoRemove: 'disabled' };
      const composed = compose(config, owner, true);
      await composed.ready;
      assert.equal(typeof composed.middleware, 'function');
      // Invoke the real native store constructed by actual composeHttpSession.
      await new Promise((resolve, reject) => native.set('sid', { cookie: { expires: new Date(Date.now() + 60000) }, marker: 7 }, error => error ? reject(error) : resolve()));
      assert.equal(typeof written.session, stringify ? 'string' : 'object');
      await store.close();
      return { provenance: declaration, result: { stringify, nativeStoredType: typeof written.session }, limitation: 'actual composition and native serialization on fake driver; no MongoDB or HTTP' };
    });
  }
  // Actual CLI main and its catch run in a process. These help/usage paths never
  // import maintenance. This observes parser output and exit, not Mongo behavior.
  const cli = 'packages/redbox-core/bin/persistence-indexes.cjs';
  for (const before of [true, false]) {
    for (const args of [['--help'], ['--unknown'], ['--ensure', '--inspect']]) {
      await probe(`cli:${before ? 'baseline' : 'current'}:${args.join(' ')}`, async () => {
        const script = source(cli, before).replace(/^#![^\n]*\n/, '');
        const child = cp.spawnSync(process.execPath, ['-e', `process.argv=['node','cli',...${JSON.stringify(args)}];\n${script}`], { encoding: 'utf8' });
        const expected = args[0] === '--help' ? 0 : 2;
        assert.equal(child.status, expected);
        assert.match(expected ? child.stderr : child.stdout, /Usage: npm run persistence:indexes/);
        return { provenance: { file: cli, revision: before ? base : 'working-tree' }, result: { args, exitCode: child.status, stdout: child.stdout.trim(), stderr: child.stderr.trim() }, transport: 'actual isolated CLI process; help/usage only' };
      });
    }
  }
  console.log(JSON.stringify({ node: process.version, baseline: base, checks: observations.length, observations }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
