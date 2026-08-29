'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const test = require('node:test');

const {
  allowlistRelativePath,
  compareFindingsToAllowlist,
  documentationRelativePath,
  isManagedOrRemovedPath,
  isScannedSourcePath,
  normalizeRelativePath,
  runGuard,
  scanRepository,
  scanSource,
  sourceExclusionsRelativePath,
  validateAllowlist,
  validateSourceExclusions,
} = require('../../scripts/check-unsafe-expressions');

const repositoryRoot = path.resolve(__dirname, '../..');
const allowlist = JSON.parse(fs.readFileSync(path.join(repositoryRoot, allowlistRelativePath), 'utf8'));
const documentation = fs.readFileSync(path.join(repositoryRoot, documentationRelativePath), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
const sourceExclusions = JSON.parse(fs.readFileSync(path.join(repositoryRoot, sourceExclusionsRelativePath), 'utf8'));
const expectedEntryIds = [
  'legacy-eval-email-notify-success',
  'legacy-eval-rdmp-queued-trigger',
  'legacy-eval-user-post-save-hook',
  'legacy-eval-user-post-save-sync-hook',
  'legacy-eval-user-pre-save-hook',
  'legacy-template-angular-lodash-utility',
  'legacy-template-angular-utility',
  'legacy-template-core-trigger-condition',
  'legacy-template-form-vocabulary',
  'legacy-template-rdmp-contributor-rule',
  'legacy-template-rdmp-counter',
  'legacy-template-rdmp-run-templates',
  'legacy-template-solr-pre-index',
  'legacy-template-trigger-field-validation',
  'legacy-template-trigger-related-record',
  'legacy-template-workspace-allow-add',
];
const bypassCases = [
  {
    name: 'Reflect.apply invokes builtin eval',
    kind: 'direct-eval',
    source: `Reflect.apply(eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an array carries an eval alias',
    kind: 'direct-eval',
    source: `const executors = [eval]; const execute = executors[0]; execute(configuredSource);`,
  },
  {
    name: 'an array-rest carrier reindexes an eval alias',
    kind: 'direct-eval',
    source: `const [...carrier] = [eval]; carrier[0](configuredSource);`,
  },
  {
    name: 'an offset array-rest carrier reindexes an eval alias',
    kind: 'direct-eval',
    source: `const [safe, ...carrier] = [JSON.parse, eval]; carrier[0](configuredSource);`,
  },
  {
    name: 'an object carries an eval alias',
    kind: 'direct-eval',
    source: `const executors = { evaluate: eval }; executors.evaluate(configuredSource);`,
  },
  {
    name: 'a carrier object is itself aliased',
    kind: 'direct-eval',
    source: `const carrier = { evaluate: eval }; const alias = carrier; alias.evaluate(configuredSource);`,
  },
  {
    name: 'computed destructuring carries builtin eval',
    kind: 'direct-eval',
    source: `const evalKey = 'eval'; const { [evalKey]: execute } = globalThis; execute(configuredSource);`,
  },
  {
    name: 'Lodash runInContext returns a template-bearing namespace',
    kind: 'lodash-template',
    source: `import lodash from 'lodash'; lodash.runInContext().template(configuredSource);`,
  },
  {
    name: 'a bound Lodash runInContext remains callable until invoked',
    kind: 'lodash-template',
    source: `import lodash from 'lodash'; const ric = lodash.runInContext.bind(lodash); ric().template(configuredSource);`,
  },
  {
    name: 'Lodash runInContext.call returns a template-bearing namespace',
    kind: 'lodash-template',
    source: `import lodash from 'lodash'; lodash.runInContext.call(lodash).template(configuredSource);`,
  },
  {
    name: 'Lodash runInContext.apply returns a template-bearing namespace',
    kind: 'lodash-template',
    source: `import lodash from 'lodash'; lodash.runInContext.apply(lodash, []).template(configuredSource);`,
  },
  {
    name: 'computed destructuring carries Lodash template',
    kind: 'lodash-template',
    source: `import lodash from 'lodash'; const key = 'template'; const { [key]: compile } = lodash; compile(configuredSource);`,
  },
  {
    name: 'a named default import aliases the template subpath',
    kind: 'lodash-template',
    source: `import { default as compile } from 'lodash/template'; compile(configuredSource);`,
  },
  {
    name: 'a namespace subpath exposes template through default',
    kind: 'lodash-template',
    source: `import * as templateNamespace from 'lodash/template'; templateNamespace.default(configuredSource);`,
  },
  {
    name: 'the lodash-es template.js default subpath is unsafe',
    kind: 'lodash-template',
    source: `import compile from 'lodash-es/template.js'; compile(configuredSource);`,
  },
  {
    name: 'a whole-package namespace import retains Lodash provenance',
    kind: 'lodash-template',
    source: `import * as lodashNamespace from 'lodash-es'; lodashNamespace.template(configuredSource);`,
  },
  {
    name: 'a whole-package namespace default retains Lodash provenance',
    kind: 'lodash-template',
    source: `import * as lodashNamespace from 'lodash'; lodashNamespace.default.template(configuredSource);`,
  },
  {
    name: 'a whole-package default import retains Lodash provenance',
    kind: 'lodash-template',
    source: `import lodashDefault from 'lodash-es'; lodashDefault.template(configuredSource);`,
  },
  {
    name: 'a whole-package named import retains Lodash provenance',
    kind: 'lodash-template',
    source: `import { template as compile } from 'lodash'; compile(configuredSource);`,
  },
  {
    name: 'a CommonJS whole-package default alias retains Lodash provenance',
    kind: 'lodash-template',
    source: `const lodashDefault = require('lodash').default; lodashDefault.template(configuredSource);`,
  },
  {
    name: 'a CommonJS computed named alias retains Lodash provenance',
    kind: 'lodash-template',
    source: `const key = 'template'; const { [key]: compile } = require('lodash-es'); compile(configuredSource);`,
  },
  {
    name: 'a CommonJS template.js default alias retains Lodash provenance',
    kind: 'lodash-template',
    source: `const compile = require('lodash/template.js').default; compile(configuredSource);`,
  },
  {
    name: 'Reflect.apply invokes an aliased Lodash template compiler',
    kind: 'lodash-template',
    source: `import compile from 'lodash-es/template'; Reflect.apply(compile, undefined, [configuredSource]);`,
  },
  {
    name: 'a bound Reflect.apply retains its builtin eval target',
    kind: 'direct-eval',
    source: `const invoke = Reflect.apply.bind(Reflect, eval, globalThis); invoke([configuredSource]);`,
  },
  {
    name: 'Reflect.apply.call invokes builtin eval',
    kind: 'direct-eval',
    source: `Reflect.apply.call(null, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.apply.apply invokes builtin eval',
    kind: 'direct-eval',
    source: `Reflect.apply.apply(null, [eval, globalThis, [configuredSource]]);`,
  },
  {
    name: 'a Lodash template compiler is invoked as a constructor',
    kind: 'lodash-template',
    source: `import compile from 'lodash/template'; new compile(configuredSource);`,
  },
  {
    name: 'a Lodash template compiler is invoked as a template tag',
    kind: 'lodash-template',
    source: "import compile from 'lodash/template'; compile`configured source`;",
  },
  {
    name: 'Reflect.construct invokes a Lodash template compiler',
    kind: 'lodash-template',
    source: `import compile from 'lodash/template'; Reflect.construct(compile, [configuredSource]);`,
  },
  {
    name: 'Reflect.construct.call invokes a Lodash template compiler',
    kind: 'lodash-template',
    source: `import compile from 'lodash/template'; Reflect.construct.call(null, compile, [configuredSource]);`,
  },
  {
    name: 'Reflect.construct.apply invokes a Lodash template compiler',
    kind: 'lodash-template',
    source: `import compile from 'lodash/template'; Reflect.construct.apply(null, [compile, [configuredSource]]);`,
  },
  {
    name: 'a bound Reflect.construct retains its Lodash template target',
    kind: 'lodash-template',
    source: `import compile from 'lodash/template'; const invoke = Reflect.construct.bind(Reflect, compile); invoke([configuredSource]);`,
  },
];
const invocationCompositionCases = [
  {
    name: 'eval.bind.call returns an eval callable',
    kind: 'direct-eval',
    source: `eval.bind.call(eval, globalThis)(configuredSource);`,
  },
  {
    name: 'eval.bind.apply returns an eval callable',
    kind: 'direct-eval',
    source: `eval.bind.apply(eval, [globalThis])(configuredSource);`,
  },
  {
    name: 'eval.call.bind invokes eval',
    kind: 'direct-eval',
    source: `eval.call.bind(eval, globalThis)(configuredSource);`,
  },
  {
    name: 'eval.apply.bind invokes eval',
    kind: 'direct-eval',
    source: `eval.apply.bind(eval, globalThis)([configuredSource]);`,
  },
  {
    name: 'a global eval member composes bind and call',
    kind: 'direct-eval',
    source: `globalThis.eval.bind.call(globalThis.eval, globalThis)(configuredSource);`,
  },
  {
    name: 'a computed global eval member composes bind and apply',
    kind: 'direct-eval',
    source: `globalThis['eval'].bind.apply(globalThis.eval, [globalThis])(configuredSource);`,
  },
  {
    name: 'Reflect.apply.bind.call retains its eval target',
    kind: 'direct-eval',
    source: `Reflect.apply.bind.call(Reflect.apply, Reflect, eval, globalThis)([configuredSource]);`,
  },
  {
    name: 'Reflect.apply.bind.apply retains its eval target',
    kind: 'direct-eval',
    source: `Reflect.apply.bind.apply(Reflect.apply, [Reflect, eval, globalThis])([configuredSource]);`,
  },
  {
    name: 'a bound Reflect.apply composes call',
    kind: 'direct-eval',
    source: `Reflect.apply.bind(Reflect, eval, globalThis).call(null, [configuredSource]);`,
  },
  {
    name: 'a bound Reflect.apply composes apply',
    kind: 'direct-eval',
    source: `Reflect.apply.bind(Reflect, eval, globalThis).apply(null, [[configuredSource]]);`,
  },
  {
    name: 'an aliased bound Reflect.apply composes call',
    kind: 'direct-eval',
    source: `const invoke = Reflect.apply.bind(Reflect, eval); invoke.call(null, globalThis, [configuredSource]);`,
  },
  {
    name: 'an aliased bound Reflect.apply composes apply',
    kind: 'direct-eval',
    source: `const invoke = Reflect.apply.bind(Reflect, eval); invoke.apply(null, [globalThis, [configuredSource]]);`,
  },
  {
    name: 'nested Reflect.apply.call.call invokes eval',
    kind: 'direct-eval',
    source: `Reflect.apply.call.call(Reflect.apply, null, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'nested Reflect.apply.call.apply invokes eval',
    kind: 'direct-eval',
    source: `Reflect.apply.call.apply(Reflect.apply, [null, eval, globalThis, [configuredSource]]);`,
  },
  {
    name: 'nested Reflect.apply.apply.call invokes eval',
    kind: 'direct-eval',
    source: `Reflect.apply.apply.call(Reflect.apply, Reflect, [eval, globalThis, [configuredSource]]);`,
  },
  {
    name: 'globalThis Reflect.apply invokes a global eval member',
    kind: 'direct-eval',
    source: `globalThis.Reflect.apply(globalThis.eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'globalThis Reflect.apply.call invokes a global eval member',
    kind: 'direct-eval',
    source: `globalThis.Reflect.apply.call(null, globalThis.eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'window Reflect.apply bind composition invokes window eval',
    kind: 'direct-eval',
    source: `window.Reflect.apply.bind(window.Reflect, window.eval, window)([configuredSource]);`,
  },
  {
    name: 'a default parameter aliases eval',
    kind: 'direct-eval',
    source: `function run(execute = eval) { execute(configuredSource); }`,
  },
  {
    name: 'an arrow default parameter aliases global eval',
    kind: 'direct-eval',
    source: `const run = (execute = globalThis.eval) => execute(configuredSource);`,
  },
  {
    name: 'a default object parameter carries eval',
    kind: 'direct-eval',
    source: `function run({ execute = eval } = {}) { execute(configuredSource); }`,
  },
  {
    name: 'a default array parameter carries eval',
    kind: 'direct-eval',
    source: `function run([execute = eval] = []) { execute(configuredSource); }`,
  },
  {
    name: 'a default rest parameter carries eval',
    kind: 'direct-eval',
    source: `function run(...[execute = eval]) { execute(configuredSource); }`,
  },
  {
    name: 'a nested default parameter carries eval',
    kind: 'direct-eval',
    source: `function run({ nested: { execute = eval } = {} } = {}) { execute(configuredSource); }`,
  },
  {
    name: 'a rest carrier destructuring default aliases eval',
    kind: 'direct-eval',
    source: `function run(...values) { const [execute = eval] = values; execute(configuredSource); }`,
  },
  {
    name: 'Lodash template.bind.call returns a compiler',
    kind: 'lodash-template',
    source: `_.template.bind.call(_.template, _)(configuredSource);`,
  },
  {
    name: 'Lodash template.bind.apply returns a compiler',
    kind: 'lodash-template',
    source: `_.template.bind.apply(_.template, [_])(configuredSource);`,
  },
  {
    name: 'an imported compiler composes bind and call',
    kind: 'lodash-template',
    source: `import compile from 'lodash/template'; compile.bind.call(compile, null)(configuredSource);`,
  },
  {
    name: 'an imported compiler composes bind and apply',
    kind: 'lodash-template',
    source: `import compile from 'lodash/template'; compile.bind.apply(compile, [null])(configuredSource);`,
  },
  {
    name: 'Lodash runInContext.bind.call returns a namespace',
    kind: 'lodash-template',
    source: `_.runInContext.bind.call(_.runInContext, _)().template(configuredSource);`,
  },
  {
    name: 'Lodash runInContext.bind.apply returns a namespace',
    kind: 'lodash-template',
    source: `_.runInContext.bind.apply(_.runInContext, [_])().template(configuredSource);`,
  },
  {
    name: 'an imported runInContext result exposes template',
    kind: 'lodash-template',
    source: `import { runInContext } from 'lodash'; runInContext().template(configuredSource);`,
  },
  {
    name: 'an aliased runInContext result exposes template',
    kind: 'lodash-template',
    source: `const createLodash = _.runInContext; createLodash().template(configuredSource);`,
  },
  {
    name: 'a constructed Lodash runInContext result exposes template',
    kind: 'lodash-template',
    source: `(new _.runInContext()).template(configuredSource);`,
  },
  {
    name: 'a constructed imported runInContext result exposes template',
    kind: 'lodash-template',
    source: `import { runInContext } from 'lodash'; (new runInContext()).template(configuredSource);`,
  },
  {
    name: 'Reflect.construct invokes a Lodash member compiler',
    kind: 'lodash-template',
    source: `Reflect.construct(_.template, [configuredSource]);`,
  },
  {
    name: 'Reflect.construct.call invokes a Lodash member compiler',
    kind: 'lodash-template',
    source: `Reflect.construct.call(null, _.template, [configuredSource]);`,
  },
  {
    name: 'Reflect.construct.apply invokes a Lodash member compiler',
    kind: 'lodash-template',
    source: `Reflect.construct.apply(null, [_.template, [configuredSource]]);`,
  },
  {
    name: 'a bound Reflect.construct invokes a Lodash member compiler',
    kind: 'lodash-template',
    source: `Reflect.construct.bind(Reflect, _.template)([configuredSource]);`,
  },
  {
    name: 'Reflect.construct.bind.call retains its compiler target',
    kind: 'lodash-template',
    source: `Reflect.construct.bind.call(Reflect.construct, Reflect, _.template)([configuredSource]);`,
  },
  {
    name: 'Reflect.construct.bind.apply retains its compiler target',
    kind: 'lodash-template',
    source: `Reflect.construct.bind.apply(Reflect.construct, [Reflect, _.template])([configuredSource]);`,
  },
  {
    name: 'a bound Reflect.construct composes call',
    kind: 'lodash-template',
    source: `Reflect.construct.bind(Reflect, _.template).call(null, [configuredSource]);`,
  },
  {
    name: 'a bound Reflect.construct composes apply',
    kind: 'lodash-template',
    source: `Reflect.construct.bind(Reflect, _.template).apply(null, [[configuredSource]]);`,
  },
  {
    name: 'nested Reflect.construct.call.call invokes a compiler',
    kind: 'lodash-template',
    source: `Reflect.construct.call.call(Reflect.construct, null, _.template, [configuredSource]);`,
  },
  {
    name: 'nested Reflect.construct.call.apply invokes a compiler',
    kind: 'lodash-template',
    source: `Reflect.construct.call.apply(Reflect.construct, [null, _.template, [configuredSource]]);`,
  },
  {
    name: 'globalThis Reflect.construct invokes a compiler',
    kind: 'lodash-template',
    source: `globalThis.Reflect.construct(_.template, [configuredSource]);`,
  },
  {
    name: 'window Reflect.construct bind composition invokes a compiler',
    kind: 'lodash-template',
    source: `window.Reflect.construct.bind(window.Reflect, _.template)([configuredSource]);`,
  },
  {
    name: 'new invokes a Lodash member compiler',
    kind: 'lodash-template',
    source: `new _.template(configuredSource);`,
  },
  {
    name: 'new invokes an aliased Lodash compiler',
    kind: 'lodash-template',
    source: `const compile = _.template; new compile(configuredSource);`,
  },
  {
    name: 'a Lodash member compiler is used as a tag',
    kind: 'lodash-template',
    source: '_.template`configured source`;',
  },
  {
    name: 'an aliased Lodash compiler is used as a tag',
    kind: 'lodash-template',
    source: 'const compile = _.template; compile`configured source`;',
  },
  {
    name: 'new invokes a bound Lodash compiler',
    kind: 'lodash-template',
    source: `const compile = _.template.bind(_); new compile(configuredSource);`,
  },
  {
    name: 'a bound Lodash compiler is used as a tag',
    kind: 'lodash-template',
    source: 'const compile = _.template.bind(_); compile`configured source`;',
  },
  {
    name: 'a default parameter aliases an imported compiler',
    kind: 'lodash-template',
    source: `import compile from 'lodash/template'; function run(candidate = compile) { candidate(configuredSource); }`,
  },
  {
    name: 'an arrow default parameter aliases a Lodash member compiler',
    kind: 'lodash-template',
    source: `const run = (compile = _.template) => compile(configuredSource);`,
  },
  {
    name: 'a default object parameter carries a compiler',
    kind: 'lodash-template',
    source: `function run({ compile = _.template } = {}) { compile(configuredSource); }`,
  },
  {
    name: 'a default array parameter carries a compiler',
    kind: 'lodash-template',
    source: `function run([compile = _.template] = []) { compile(configuredSource); }`,
  },
  {
    name: 'a default rest parameter carries a compiler',
    kind: 'lodash-template',
    source: `function run(...[compile = _.template]) { compile(configuredSource); }`,
  },
  {
    name: 'a nested default parameter carries a compiler',
    kind: 'lodash-template',
    source: `function run({ nested: { compile = _.template } = {} } = {}) { compile(configuredSource); }`,
  },
];
const spreadInvocationCases = [
  {
    name: 'Reflect.apply direct spread invocation',
    kind: 'direct-eval',
    source: `Reflect.apply(...[eval, globalThis, [configuredSource]]);`,
  },
  {
    name: 'Reflect.apply.call spread invocation',
    kind: 'direct-eval',
    source: `Reflect.apply.call(...[null, eval, globalThis, [configuredSource]]);`,
  },
  {
    name: 'Reflect.apply.apply spread invocation',
    kind: 'direct-eval',
    source: `Reflect.apply.apply(...[null, [eval, globalThis, [configuredSource]]]);`,
  },
  {
    name: 'Reflect.apply.bind.call spread invocation',
    kind: 'direct-eval',
    source: `Reflect.apply.bind.call(...[Reflect.apply, Reflect, eval, globalThis])(...[[configuredSource]]);`,
  },
  {
    name: 'bound Reflect.apply spread invoker',
    kind: 'direct-eval',
    source: `const invoke = Reflect.apply.bind(Reflect); invoke(...[eval, globalThis, [configuredSource]]);`,
  },
  {
    name: 'nested Reflect.apply.call.call spread invocation',
    kind: 'direct-eval',
    source: `Reflect.apply.call.call(...[Reflect.apply, null, eval, globalThis, [configuredSource]]);`,
  },
  {
    name: 'aliased Reflect.apply spread invocation',
    kind: 'direct-eval',
    source: `const invoke = Reflect.apply; invoke(...[eval, globalThis, [configuredSource]]);`,
  },
  {
    name: 'Reflect.construct direct spread invocation',
    kind: 'lodash-template',
    source: `Reflect.construct(...[_.template, [configuredSource]]);`,
  },
  {
    name: 'Reflect.construct.call spread invocation',
    kind: 'lodash-template',
    source: `Reflect.construct.call(...[null, _.template, [configuredSource]]);`,
  },
  {
    name: 'Reflect.construct.apply spread invocation',
    kind: 'lodash-template',
    source: `Reflect.construct.apply(...[null, [_.template, [configuredSource]]]);`,
  },
  {
    name: 'Reflect.construct.bind.call spread invocation',
    kind: 'lodash-template',
    source: `Reflect.construct.bind.call(...[Reflect.construct, Reflect, _.template])(...[[configuredSource]]);`,
  },
  {
    name: 'bound Reflect.construct spread invoker',
    kind: 'lodash-template',
    source: `const invoke = Reflect.construct.bind(Reflect); invoke(...[_.template, [configuredSource]]);`,
  },
  {
    name: 'nested Reflect.construct.call.call spread invocation',
    kind: 'lodash-template',
    source: `Reflect.construct.call.call(...[Reflect.construct, null, _.template, [configuredSource]]);`,
  },
  {
    name: 'aliased Reflect.construct spread invocation',
    kind: 'lodash-template',
    source: `const invoke = Reflect.construct; invoke(...[_.template, [configuredSource]]);`,
  },
];
const globalLodashCases = [
  {
    name: 'globalThis Lodash global',
    source: `globalThis._.template(configuredSource);`,
  },
  {
    name: 'global Lodash global',
    source: `global._.template(configuredSource);`,
  },
  {
    name: 'window Lodash global',
    source: `window._.template(configuredSource);`,
  },
  {
    name: 'self Lodash global',
    source: `self._.template(configuredSource);`,
  },
  {
    name: 'computed global Lodash member',
    source: `globalThis['_'].template(configuredSource);`,
  },
  {
    name: 'aliased global root Lodash member',
    source: `const root = globalThis; root._.template(configuredSource);`,
  },
  {
    name: 'global Lodash runInContext result',
    source: `window._.runInContext().template(configuredSource);`,
  },
  {
    name: 'destructured global Lodash member',
    source: `const { _: lodash } = globalThis; lodash.template(configuredSource);`,
  },
  {
    name: 'nested recognized global root',
    source: `window.globalThis._.template(configuredSource);`,
  },
];
const safeSpreadCases = [
  {
    name: 'ordinary Reflect targets with spread arguments',
    source: `Reflect.apply(...[JSON.parse, null, ['{}']]); Reflect.construct(...[Date, []]);`,
  },
  {
    name: 'unsafe callable values passed to a safe target',
    source: `Reflect.apply(...[Array.of, null, [eval, _.template]]);`,
  },
  {
    name: 'ordinary function receiving spread unsafe callable values',
    source: `const collect = (...values) => values; collect(...[eval, _.template]);`,
  },
  {
    name: 'shadowed invocation globals with spread arguments',
    source: `function run(eval, Reflect, globalThis, _) {
      Reflect.apply(...[eval, globalThis, [configuredSource]]);
      Reflect.construct(...[_.template, [configuredSource]]);
    }`,
  },
  {
    name: 'shadowed global roots with Lodash-looking members',
    source: `function run(globalThis, global, window, self) {
      globalThis._.template(configuredSource);
      global._.template(configuredSource);
      window._.runInContext().template(configuredSource);
      const { _: lodash } = self;
      lodash.template(configuredSource);
    }`,
  },
  {
    name: 'arbitrary local Lodash-looking property chain',
    source: `const holder = { _: { template: value => value } }; holder._.template(configuredSource);`,
  },
];
const safeInvocationCompositionCases = [
  {
    name: 'shadowed eval Reflect globalThis and Lodash globals',
    source: `function run(eval, Reflect, globalThis, _) {
      eval.bind.call(eval, globalThis)(configuredSource);
      Reflect.apply.bind.call(Reflect.apply, Reflect, eval, globalThis)([configuredSource]);
      Reflect.construct.bind.call(Reflect.construct, Reflect, _.template)([configuredSource]);
      _.template.bind.call(_.template, _)(configuredSource);
    }`,
  },
  {
    name: 'shadowed global member roots',
    source: `function run(globalThis, window) {
      globalThis.Reflect.apply(globalThis.eval, globalThis, [configuredSource]);
      window.Reflect.construct(window._.template, [configuredSource]);
    }`,
  },
  {
    name: 'local constructors and template tags',
    source: 'const compile = value => value; new compile(configuredSource); compile`configured source`;',
  },
  {
    name: 'ordinary Reflect constructors and their compositions',
    source: `Reflect.construct(Date, []);
      Reflect.construct.call(null, Date, []);
      Reflect.construct.apply(null, [Date, []]);
      Reflect.construct.bind(Reflect, Date)([]);`,
  },
  {
    name: 'uninvoked bound unsafe callables',
    source: `const direct = eval.bind.call(eval, globalThis);
      const reflected = Reflect.apply.bind.call(Reflect.apply, Reflect, eval, globalThis);
      const compile = _.template.bind.call(_.template, _);
      const construct = Reflect.construct.bind(Reflect, _.template);
      void direct; void reflected; void compile; void construct;`,
  },
  {
    name: 'Handlebars and JSONata bound APIs',
    source: `import Handlebars from 'handlebars';
      import jsonata from 'jsonata';
      Handlebars.compile.bind(Handlebars)(configuredSource)({});
      jsonata.bind(null)(configuredSource).evaluate({});`,
  },
];
const sourceExtensionCases = [
  {
    extension: '.jsx',
    source: `const view = <div />; eval(configuredSource);`,
  },
  {
    extension: '.mts',
    source: `export {}; eval(configuredSource);`,
  },
  {
    extension: '.cts',
    source: `export = {}; eval(configuredSource);`,
  },
];

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createEndToEndGuardRepository() {
  const temporaryParent = path.join(repositoryRoot, '.tmp');
  fs.mkdirSync(temporaryParent, { recursive: true });
  const root = fs.mkdtempSync(path.join(temporaryParent, 'unsafe-expression-guard-'));
  const scriptPath = path.join(root, 'scripts/check-unsafe-expressions.js');
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.copyFileSync(path.join(repositoryRoot, 'scripts/check-unsafe-expressions.js'), scriptPath);
  writeJson(path.join(root, allowlistRelativePath), {
    schemaVersion: 1,
    documentation: documentationRelativePath,
    entries: [],
  });
  writeJson(path.join(root, sourceExclusionsRelativePath), {
    schemaVersion: 1,
    documentation: documentationRelativePath,
    entries: [],
  });
  fs.mkdirSync(path.dirname(path.join(root, documentationRelativePath)), { recursive: true });
  fs.writeFileSync(path.join(root, documentationRelativePath), '# Test inventory\n');
  writeJson(path.join(root, 'package.json'), {
    private: true,
    scripts: {
      lint: 'npm run lint:unsafe-expressions',
      'lint:unsafe-expressions': 'node scripts/check-unsafe-expressions.js && npm run test:unsafe-expressions',
      'test:unsafe-expressions': 'node --test test/static/unsafe-expression-guard.test.js',
    },
  });
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  return root;
}

function invokeGuardWithTrackedSources(root, sources) {
  for (const { relativePath, source } of sources) {
    const absolutePath = path.join(root, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, source);
  }
  execFileSync('git', ['add', '.'], { cwd: root });
  return spawnSync(process.execPath, ['scripts/check-unsafe-expressions.js'], {
    cwd: root,
    encoding: 'utf8',
  });
}

function invokeGuardWithTrackedSource(root, source, relativePath = 'packages/example/src/runtime.ts') {
  return invokeGuardWithTrackedSources(root, [{ relativePath, source }]);
}

function invokeNpmLintWithTrackedSources(root, sources) {
  for (const { relativePath, source } of sources) {
    const absolutePath = path.join(root, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, source);
  }
  execFileSync('git', ['add', '.'], { cwd: root });
  return spawnSync('npm', ['run', 'lint'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, npm_config_update_notifier: 'false' },
  });
}

test('detects direct eval without matching comments, strings, or property names', () => {
  const findings = scanSource(
    `
      // eval(configuredSource)
      const description = 'eval(configuredSource)';
      const safe = { eval: configuredSource };
      eval(configuredSource);
    `,
    'packages/example/src/runtime.ts'
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'direct-eval');
});

test('detects indirect, global-member, aliased, and call-form eval execution', () => {
  const findings = scanSource(
    `
      (0, eval)(configuredSource);
      globalThis['eval'](configuredSource);
      const executeConfiguredSource = eval;
      executeConfiguredSource(configuredSource);
      const { eval: destructuredEval } = globalThis;
      destructuredEval(configuredSource);
      eval.call(globalThis, configuredSource);
      const reboundEval = window.eval.bind(window);
      reboundEval(configuredSource);
    `,
    'packages/example/src/runtime.ts'
  );

  assert.ok(findings.length >= 6);
  assert.ok(findings.every(finding => finding.kind === 'direct-eval'));
});

test('detects Lodash template imports, bracket access, destructuring, and aliases', () => {
  const findings = scanSource(
    `
      import lodashDefault, { template as compileConfigured } from 'lodash-es';
      import compileSubpath from 'lodash/template';
      const lodashRequired = require('lodash');
      const lodashAlias = lodashDefault;
      const { template: destructuredCompile } = lodashRequired;
      const aliasedCompile = lodashDefault['template'];
      compileConfigured(firstConfig);
      lodashRequired['template'](secondConfig);
      destructuredCompile(thirdConfig);
      aliasedCompile(fourthConfig);
      lodashAlias.template(fifthConfig);
      compileSubpath(sixthConfig);
    `,
    'packages/example/src/runtime.ts'
  );

  assert.equal(findings.length, 6);
  assert.ok(findings.every(finding => finding.kind === 'lodash-template'));
});

for (const bypass of bypassCases) {
  test(`scanSource rejects ${bypass.name}`, () => {
    const findings = scanSource(bypass.source, 'packages/example/src/runtime.ts');
    assert.ok(
      findings.some(finding => finding.kind === bypass.kind),
      `${bypass.name} should produce a ${bypass.kind} finding`
    );
  });
}

test('scanSource rejects every invocation-provenance composition', () => {
  for (const composition of invocationCompositionCases) {
    const findings = scanSource(composition.source, 'packages/example/src/runtime.ts');
    assert.ok(
      findings.some(finding => finding.kind === composition.kind),
      `${composition.name} should produce a ${composition.kind} finding`
    );
  }
});

test('scanSource rejects spread invocation provenance for Reflect.apply and Reflect.construct', () => {
  for (const invocation of spreadInvocationCases) {
    const findings = scanSource(invocation.source, 'packages/example/src/runtime.ts');
    assert.ok(
      findings.some(finding => finding.kind === invocation.kind),
      `${invocation.name} should produce a ${invocation.kind} finding`
    );
  }
});

test('scanSource resolves the configured Lodash global through recognized global objects', () => {
  for (const lodashAccess of globalLodashCases) {
    assert.ok(
      scanSource(lodashAccess.source, 'packages/example/src/runtime.ts').some(
        finding => finding.kind === 'lodash-template'
      ),
      `${lodashAccess.name} should produce a lodash-template finding`
    );
  }
});

test('the npm lint path rejects every invocation-provenance composition in tracked sources', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = invocationCompositionCases.map((composition, index) => ({
    relativePath: `packages/example/src/composition-${index}.ts`,
    source: composition.source,
  }));
  const result = invokeNpmLintWithTrackedSources(root, sources);

  assert.notEqual(result.status, 0);
  for (const [index, composition] of invocationCompositionCases.entries()) {
    const prefix = `Unexpected unsafe execution: packages/example/src/composition-${index}.ts:`;
    const diagnostic = result.stderr.split('\n').find(line => line.startsWith(prefix));
    assert.ok(diagnostic, `${composition.name} was not rejected:\n${result.stderr}`);
    assert.ok(diagnostic.includes(` ${composition.kind} `), `${composition.name} reported the wrong kind`);
  }
});

test('the npm lint path rejects spread invocation and global Lodash bypasses in tracked sources', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const unsafeCases = [...spreadInvocationCases, ...globalLodashCases];
  const sources = unsafeCases.map((unsafeCase, index) => ({
    relativePath: `packages/example/src/review-bypass-${index}.ts`,
    source: unsafeCase.source,
  }));
  const result = invokeNpmLintWithTrackedSources(root, sources);

  assert.notEqual(result.status, 0);
  for (const [index, unsafeCase] of unsafeCases.entries()) {
    assert.ok(
      result.stderr.includes(`Unexpected unsafe execution: packages/example/src/review-bypass-${index}.ts:`),
      `${unsafeCase.name} was not rejected:\n${result.stderr}`
    );
  }
});

test('scanSource keeps the invocation-composition negative matrix clean', () => {
  for (const safeCase of safeInvocationCompositionCases) {
    assert.deepEqual(
      scanSource(safeCase.source, 'packages/example/src/runtime.ts'),
      [],
      `${safeCase.name} should not produce a finding`
    );
  }
});

test('scanSource keeps safe spread invocations and shadowed global roots clean', () => {
  for (const safeCase of safeSpreadCases) {
    assert.deepEqual(
      scanSource(safeCase.source, 'packages/example/src/runtime.ts'),
      [],
      `${safeCase.name} should not produce a finding`
    );
  }
});

test('the guard CLI accepts the tracked invocation-composition negative matrix', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = safeInvocationCompositionCases.map((safeCase, index) => ({
    relativePath: `packages/example/src/safe-composition-${index}.ts`,
    source: safeCase.source,
  }));
  const result = invokeGuardWithTrackedSources(root, sources);

  assert.equal(result.status, 0, result.stderr);
});

test('the guard CLI accepts safe spread invocations in tracked sources', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = safeSpreadCases.map((safeCase, index) => ({
    relativePath: `packages/example/src/safe-spread-${index}.ts`,
    source: safeCase.source,
  }));
  const result = invokeGuardWithTrackedSources(root, sources);

  assert.equal(result.status, 0, result.stderr);
});

test('the dependency worklist resolves reverse aliases and cycles without quadratic rescans', () => {
  const aliasCount = 4000;
  const aliases = Array.from({ length: aliasCount + 1 }, (_, index) => `alias${index}`);
  const source = [
    `let ${aliases.join(', ')};`,
    ...Array.from({ length: aliasCount }, (_, index) => `alias${index} = alias${index + 1};`),
    `alias${aliasCount} = eval;`,
    'alias0(configuredSource);',
  ].join('\n');
  const startedAt = performance.now();
  const findings = scanSource(source, 'packages/example/src/reverse-aliases.ts');
  const elapsedMilliseconds = performance.now() - startedAt;

  assert.deepEqual(
    findings.map(finding => finding.kind),
    ['direct-eval']
  );
  assert.ok(
    elapsedMilliseconds < 2500,
    `reverse provenance took ${Math.round(elapsedMilliseconds)}ms; expected dependency-driven propagation`
  );
  assert.deepEqual(
    scanSource(
      `let first, second, third;
       first = second;
       second = third;
       third = first;
       third = eval;
       first(configuredSource);`,
      'packages/example/src/cyclic-aliases.ts'
    ).map(finding => finding.kind),
    ['direct-eval']
  );
  assert.deepEqual(
    scanSource(
      `let invocationArguments, lodash;
       const invoke = Reflect.apply.bind(Reflect, ...invocationArguments);
       lodash = invoke([]);
       invocationArguments = [_.runInContext, _];
       lodash.template(configuredSource);`,
      'packages/example/src/composed-reverse-aliases.ts'
    ).map(finding => finding.kind),
    ['lodash-template']
  );
});

test('spread provenance remains positionally bounded to 64 invocation arguments', () => {
  const trailingArguments = Array.from({ length: 128 }, () => 'null').join(', ');
  const unsafeSource = `Reflect.apply(...[eval, globalThis, [configuredSource], ${trailingArguments}]);`;
  const safeSource = `Reflect.apply(...[JSON.parse, null, ['{}'], eval, _.template, ${trailingArguments}]);`;

  assert.deepEqual(
    scanSource(unsafeSource, 'packages/example/src/bounded-spread.ts').map(finding => finding.kind),
    ['direct-eval']
  );
  assert.deepEqual(scanSource(safeSource, 'packages/example/src/bounded-safe-spread.ts'), []);
});

test('the guard invocation rejects every provenance bypass', async t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  for (const bypass of bypassCases) {
    await t.test(bypass.name, () => {
      const result = invokeGuardWithTrackedSource(root, bypass.source);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, new RegExp(`Unexpected unsafe execution: .* ${bypass.kind} `));
    });
  }
});

test('scans JSX and explicit TypeScript module extensions in packages and first-party assets', () => {
  for (const { extension, source } of sourceExtensionCases) {
    for (const relativePath of [
      `packages/example/src/runtime${extension}`,
      `assets/default/default/js/first-party-runtime${extension}`,
    ]) {
      assert.equal(isScannedSourcePath(relativePath), true, `${relativePath} should be scanned`);
      assert.deepEqual(
        scanSource(source, relativePath).map(finding => finding.kind),
        ['direct-eval'],
        `${relativePath} should use the appropriate parser mode and reject builtin eval`
      );
    }
  }
});

test('the guard invocation rejects JSX, MTS, and CTS in package and first-party asset paths', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = sourceExtensionCases.flatMap(({ extension, source }) => [
    { relativePath: `packages/example/src/runtime${extension}`, source },
    { relativePath: `assets/default/default/js/first-party-runtime${extension}`, source },
  ]);
  const result = invokeGuardWithTrackedSources(root, sources);

  assert.notEqual(result.status, 0);
  for (const { relativePath } of sources) {
    assert.ok(result.stderr.includes(`Unexpected unsafe execution: ${relativePath}:`), result.stderr);
  }
});

test('standard lint keeps both the guard CLI and its regression suite enabled', () => {
  assert.match(packageJson.scripts.lint, /npm run lint:unsafe-expressions/);
  assert.equal(
    packageJson.scripts['lint:unsafe-expressions'],
    'node scripts/check-unsafe-expressions.js && npm run test:unsafe-expressions'
  );
  assert.equal(
    packageJson.scripts['test:unsafe-expressions'],
    'node --test test/static/unsafe-expression-guard.test.js'
  );
});

test('does not confuse safe template APIs and local render functions with Lodash', () => {
  const findings = scanSource(
    `
      import Handlebars from 'handlebars';
      const template = context => String(context);
      Handlebars.template(precompiledSpecification)(context);
      template(context);
    `,
    'packages/example/src/runtime.ts'
  );

  assert.deepEqual(findings, []);
});

test('distinguishes bound callables from invocation results', () => {
  const findings = scanSource(
    `
      import lodash from 'lodash';
      const ric = lodash.runInContext.bind(lodash);
      const invoke = Reflect.apply.bind(Reflect, eval, globalThis);
      ric.template(configuredSource);
      ric();
      void invoke;
    `,
    'packages/example/src/runtime.ts'
  );

  assert.deepEqual(findings, []);
});

test('respects lexical shadowing and excludes Handlebars and JSONata APIs', () => {
  const findings = scanSource(
    `
      import Handlebars from 'handlebars';
      import jsonata from 'jsonata';
      function runLocal(eval, Reflect, globalThis, _) {
        const carrier = { evaluate: eval, compile: _.template };
        const [...rest] = [eval];
        const ric = _.runInContext.bind(_);
        Reflect.apply(carrier.evaluate, globalThis, [configuredSource]);
        Reflect.apply.call(null, carrier.evaluate, globalThis, [configuredSource]);
        Reflect.construct(carrier.compile, [configuredSource]);
        carrier.compile(configuredSource);
        rest[0](configuredSource);
        ric().template(configuredSource);
      }
      const compile = function (source) { return source; };
      new compile(configuredSource);
      compile\`configured source\`;
      Handlebars.compile(configuredSource)({});
      jsonata(configuredSource).evaluate({});
      $eval(configuredSource);
    `,
    'packages/example/src/runtime.ts'
  );

  assert.deepEqual(findings, []);
});

test('keeps nested shadow bindings separate from imported Lodash provenance', () => {
  const findings = scanSource(
    `
      import lodash from 'lodash';
      namespace SafeNamespace {
        const lodash = { template: value => value };
        lodash.template(configuredSource);
      }
      function runLocal(lodash) {
        lodash.template(configuredSource);
      }
      lodash.template(configuredSource);
    `,
    'packages/example/src/runtime.ts'
  );

  assert.deepEqual(
    findings.map(finding => finding.kind),
    ['lodash-template']
  );
});

test('the deliberately unsafe fixture fails even when presented with a test-like runtime filename', () => {
  const fixture = fs.readFileSync(
    path.join(repositoryRoot, 'test/resources/static-guard/unsafe-expressions.fixture.ts'),
    'utf8'
  );
  const disguisedRuntimePath = 'packages/example/src/unsafe-expressions.spec.ts';
  assert.equal(isScannedSourcePath(disguisedRuntimePath), true);

  const findings = scanSource(fixture, disguisedRuntimePath);
  const comparison = compareFindingsToAllowlist(findings, []);
  assert.deepEqual(
    new Set(comparison.unexpected.map(finding => finding.kind)),
    new Set(['direct-eval', 'lodash-template'])
  );
  assert.deepEqual(comparison.stale, []);
});

test('a first-party asset fixture is scanned and rejected', () => {
  const fixture = fs.readFileSync(
    path.join(repositoryRoot, 'test/resources/static-guard/unsafe-first-party-asset.fixture.js'),
    'utf8'
  );
  const firstPartyAssetPath = 'assets/default/default/js/first-party-runtime.js';
  assert.equal(isScannedSourcePath(firstPartyAssetPath), true);
  assert.deepEqual(
    scanSource(fixture, firstPartyAssetPath).map(finding => finding.kind),
    ['direct-eval']
  );
});

test('the guard invocation rejects unsafe first-party asset JavaScript', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fixture = fs.readFileSync(
    path.join(repositoryRoot, 'test/resources/static-guard/unsafe-first-party-asset.fixture.js'),
    'utf8'
  );
  const result = invokeGuardWithTrackedSource(root, fixture, 'assets/default/default/js/first-party-runtime.js');

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unexpected unsafe execution: assets\/default\/default\/js\/first-party-runtime\.js/);
});

test('requires complete metadata and an identical documentation row for every allowlist entry', () => {
  assert.deepEqual(validateAllowlist(allowlist, documentation), []);
  assert.equal(allowlist.entries.length, 16);
  assert.equal(allowlist.entries.filter(entry => entry.kind === 'direct-eval').length, 5);
  assert.equal(allowlist.entries.filter(entry => entry.kind === 'lodash-template').length, 11);

  const incomplete = structuredClone(allowlist);
  delete incomplete.entries[0].followUp;
  assert.ok(validateAllowlist(incomplete, documentation).some(error => error.includes('must contain exactly')));

  const undocumented = structuredClone(allowlist);
  undocumented.entries[0].rationale = 'A replacement rationale long enough to satisfy the metadata length gate.';
  assert.ok(validateAllowlist(undocumented, documentation).some(error => error.includes('not explicitly mirrored')));
});

test('limits source exclusions to the named vendored and generated asset files', () => {
  assert.deepEqual(validateSourceExclusions(sourceExclusions, documentation, repositoryRoot), []);
  assert.deepEqual(
    sourceExclusions.entries.map(entry => [entry.path, entry.kind]),
    [
      ['assets/default/default/js/v0_3_1-leaflet-omnivore.min.js', 'vendored'],
      ['assets/default/default/js/vocab_widget_v2.js', 'vendored'],
      ['assets/js/dependencies/sails.io.js', 'generated'],
    ]
  );
  assert.ok(sourceExclusions.entries.every(entry => !isScannedSourcePath(entry.path)));
  assert.equal(isScannedSourcePath('assets/default/default/js/admin-api-docs-bootstrap.js'), true);
  assert.equal(isScannedSourcePath('assets/default/default/js/admin-api-docs-init.js'), true);
  assert.equal(isScannedSourcePath('assets/js/index.js'), true);
  assert.equal(isScannedSourcePath('assets/js/dependencies/first-party.js'), true);

  const broad = structuredClone(sourceExclusions);
  broad.entries[0].path = 'assets/';
  assert.ok(
    validateSourceExclusions(broad, documentation, repositoryRoot).some(error =>
      error.includes('must name a JavaScript or TypeScript source file')
    )
  );
});

test('freezes the allowlist entry identities so growth requires an explicit test change', () => {
  assert.deepEqual(allowlist.entries.map(entry => entry.id).sort(), expectedEntryIds);
});

test('forbids managed record workflow and removed generic-action paths from the allowlist', () => {
  assert.ok(allowlist.entries.every(entry => !isManagedOrRemovedPath(entry.path)));

  for (const forbiddenPath of [
    'packages/redbox-core/src/action-registry/injected.ts',
    'packages/redbox-core/src/expression-runtime/injected.ts',
    'packages/redbox-core/src/record-workflow-administration/injected.ts',
    'packages/redbox-core/src/workflow-transition/injected.ts',
    `packages/redbox-core/src/controllers/${['Action', 'Controller'].join('')}.ts`,
  ]) {
    const mutated = structuredClone(allowlist);
    mutated.entries[0].path = forbiddenPath;
    assert.ok(validateAllowlist(mutated, '').some(error => error.includes('cannot allowlist managed or removed')));
  }
});

test('normalizes repository paths and keeps only declared non-runtime roots out of scope', () => {
  assert.equal(isScannedSourcePath('packages/example/src/hidden.spec.ts'), true);
  assert.equal(isScannedSourcePath('test/resources/fixture.ts'), false);
  assert.equal(isScannedSourcePath('packages/example/test/fixture.ts'), false);
  assert.equal(isScannedSourcePath('support/documentation/tool.ts'), false);
  assert.equal(isScannedSourcePath('assets/first-party.js'), true);
  assert.throws(() => normalizeRelativePath('../packages/example/src/runtime.ts'));
  assert.throws(() => normalizeRelativePath('packages\\example\\src\\runtime.ts'));
  assert.throws(() => normalizeRelativePath('/packages/example/src/runtime.ts'));
});

test('recovers unsafe calls from malformed tracked source without losing bounded diagnostics', () => {
  const findings = scanSource(
    `const incomplete = ;
     eval(configuredSource);
     const alsoIncomplete = {`,
    'packages/example/src/malformed-runtime.ts'
  );

  assert.deepEqual(
    findings.map(finding => finding.kind),
    ['direct-eval']
  );
});

test('refuses a Git-tracked source symlink before reading its target', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const symlinkPath = path.join(root, 'packages/example/src/runtime.ts');
  fs.mkdirSync(path.dirname(symlinkPath), { recursive: true });
  fs.writeFileSync(path.join(root, 'safe-target.txt'), 'eval(configuredSource);\n');
  fs.symlinkSync('../../../safe-target.txt', symlinkPath);
  execFileSync('git', ['add', '.'], { cwd: root });

  assert.throws(() => scanRepository(root, new Set()), /Refusing to scan source symlink/);
});

test('the repository findings exactly match the bounded legacy allowlist', () => {
  const result = runGuard(repositoryRoot);
  assert.deepEqual(result.metadataErrors, []);
  assert.deepEqual(result.unexpected, []);
  assert.deepEqual(result.stale, []);
  assert.deepEqual(
    result.findings.filter(finding => isManagedOrRemovedPath(finding.path)),
    []
  );
  assert.equal(result.findings.length, 16);
});
