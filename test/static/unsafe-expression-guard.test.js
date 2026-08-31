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
  maximumDiagnosticOutputBytes,
  maximumFindingsPerFile,
  maximumRepositoryFindings,
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
const variableLengthSpreadCases = [
  {
    name: 'a conditional Reflect.apply prefix',
    kind: 'direct-eval',
    source: `Reflect.apply(...(flag ? [] : [null]), eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a reassigned prefix through a Reflect.apply alias',
    kind: 'direct-eval',
    source: `let prefix = []; prefix = [null]; const invoke = Reflect.apply;
      invoke(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a computed nested mixed-array prefix',
    kind: 'direct-eval',
    source: `const choices = { short: [], long: [null] };
      Reflect.apply(...[...choices[key]], eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a Reflect.apply.call prefix',
    kind: 'direct-eval',
    source: `Reflect.apply.call(...(flag ? [] : [null]), null, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a Reflect.apply.apply prefix',
    kind: 'direct-eval',
    source: `Reflect.apply.apply(...(flag ? [] : [null]), null, [eval, globalThis, [configuredSource]]);`,
  },
  {
    name: 'a Reflect.apply.bind prefix',
    kind: 'direct-eval',
    source: `Reflect.apply.bind(...(flag ? [] : [null]), Reflect, eval, globalThis)([configuredSource]);`,
  },
  {
    name: 'a Reflect.apply.bind.call prefix',
    kind: 'direct-eval',
    source: `Reflect.apply.bind.call(...(flag ? [] : [null]), Reflect.apply, Reflect, eval, globalThis)(
      [configuredSource]
    );`,
  },
  {
    name: 'a conditional Reflect.construct prefix',
    kind: 'lodash-template',
    source: `Reflect.construct(...(flag ? [] : [null]), _.template, [configuredSource]);`,
  },
  {
    name: 'a Reflect.construct.call prefix',
    kind: 'lodash-template',
    source: `Reflect.construct.call(...(flag ? [] : [null]), null, _.template, [configuredSource]);`,
  },
  {
    name: 'a Reflect.construct.apply prefix',
    kind: 'lodash-template',
    source: `Reflect.construct.apply(...(flag ? [] : [null]), null, [_.template, [configuredSource]]);`,
  },
  {
    name: 'a Reflect.construct.bind prefix',
    kind: 'lodash-template',
    source: `Reflect.construct.bind(...(flag ? [] : [null]), Reflect, _.template)([configuredSource]);`,
  },
  {
    name: 'a Reflect.construct.bind.call prefix',
    kind: 'lodash-template',
    source: `Reflect.construct.bind.call(...(flag ? [] : [null]), Reflect.construct, Reflect, _.template)(
      [configuredSource]
    );`,
  },
];
const mutableSpreadPrefixCases = [
  {
    name: 'a direct length truncation',
    source: `const prefix = [null];
      prefix.length = 0;
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a pop mutation',
    source: `const prefix = [null];
      prefix.pop();
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a shift mutation through a carrier alias',
    source: `const prefix = [null];
      const alias = prefix;
      alias.shift();
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a conditional splice mutation',
    source: `const prefix = [null];
      if (flag) prefix.splice(0, 1);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a conditional compound length write',
    source: `const prefix = [null];
      if (flag) prefix.length -= 1;
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a borrowed carrier mutator call',
    source: `const prefix = [null];
      prefix.pop.call(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a borrowed Array prototype mutator call',
    source: `const prefix = [null];
      Array.prototype.pop.call(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an applied carrier mutator',
    source: `const prefix = [null];
      prefix.pop.apply(prefix, []);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a bound carrier mutator',
    source: `const prefix = [null];
      const mutate = prefix.pop.bind(prefix);
      mutate();
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a reflected Array prototype mutator',
    source: `const prefix = [null];
      Reflect.apply(Array.prototype.pop, prefix, []);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a reflected bound Array prototype mutator',
    source: `const prefix = [null];
      const mutate = Reflect.apply.bind(Reflect, Array.prototype.pop, prefix);
      mutate([]);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a computed borrowed carrier mutator',
    source: `const prefix = [null];
      const method = 'pop';
      prefix[method].call(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a for-of length assignment',
    source: `const prefix = [null];
      for (prefix.length of [0]) consume(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.assign truncates an array carrier',
    source: `const prefix = [null];
      Object.assign(prefix, { length: 0 });
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.assign truncates a Lodash constructor prefix',
    source: `const prefix = [null];
      Object.assign(prefix, { length: 0 });
      Reflect.construct(...prefix, _.template, [configuredSource]);`,
  },
  {
    name: 'Object.defineProperty writes carrier length',
    source: `const prefix = [null];
      Object.defineProperty(prefix, 'length', { value: 0 });
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.defineProperty writes a carrier index',
    source: `const prefix = [];
      Object.defineProperty(prefix, '0', { value: eval });
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.defineProperties writes carrier length',
    source: `const prefix = [null];
      Object.defineProperties(prefix, { length: { value: 0 } });
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.defineProperties writes a Lodash carrier index',
    source: `const prefix = [];
      Object.defineProperties(prefix, { 0: { value: _.template } });
      Reflect.construct(...prefix, [configuredSource]);`,
  },
  {
    name: 'Reflect.set writes carrier length',
    source: `const prefix = [null];
      Reflect.set(prefix, 'length', 0);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.set writes a carrier index',
    source: `const prefix = [];
      Reflect.set(prefix, '0', eval);
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.set writes an unknown carrier key',
    source: `const prefix = [null];
      Reflect.set(prefix, loadKey(), 0);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.set writes an eval target through its receiver',
    source: `const prefix = [];
      Reflect.set({}, '0', eval, prefix);
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.set.call writes through its receiver',
    source: `const prefix = [];
      Reflect.set.call(Reflect, {}, '0', eval, prefix);
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.set.apply writes through its receiver',
    source: `const prefix = [];
      Reflect.set.apply(Reflect, [{}, '0', eval, prefix]);
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'a bound Reflect.set writes through its receiver',
    source: `const prefix = [];
      Reflect.set.bind(Reflect, {}, '0', eval, prefix)();
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.apply invokes a receiver-sensitive Reflect.set',
    source: `const prefix = [];
      Reflect.apply(Reflect.set, Reflect, [{}, '0', eval, prefix]);
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'a direct Symbol.iterator replacement yields eval',
    source: `const prefix = [null];
      prefix[Symbol.iterator] = function* replacement() { yield eval; };
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'a global Symbol.iterator replacement yields a compiler',
    source: `const prefix = [null];
      prefix[globalThis.Symbol.iterator] = function* replacement() { yield _.template; };
      Reflect.construct(...prefix, [configuredSource]);`,
  },
  {
    name: 'an unknown direct Symbol.iterator replacement fails closed',
    source: `const prefix = [null];
      prefix[Symbol.iterator] = loadIterator();
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'a conditional direct Symbol.iterator replacement fails closed',
    source: `const prefix = [null];
      prefix[Symbol.iterator] = flag ? function* () { yield JSON.parse; } : loadIterator();
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.defineProperty replaces Symbol.iterator',
    source: `const prefix = [null];
      Object.defineProperty(prefix, Symbol.iterator, { value: function* () { yield eval; } });
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.defineProperties replaces Symbol.iterator',
    source: `const prefix = [null];
      Object.defineProperties(prefix, {
        [Symbol.iterator]: { value: function* () { yield eval; } }
      });
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.assign replaces Symbol.iterator',
    source: `const prefix = [null];
      Object.assign(prefix, { *[Symbol.iterator]() { yield eval; } });
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.defineProperty writes carrier length',
    source: `const prefix = [null];
      Reflect.defineProperty(prefix, 'length', { value: 0 });
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.defineProperty writes a carrier index',
    source: `const prefix = [];
      Reflect.defineProperty(prefix, '0', { value: eval });
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.defineProperty.call writes carrier length',
    source: `const prefix = [null];
      Reflect.defineProperty.call(Reflect, prefix, 'length', { value: 0 });
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.defineProperty.apply writes carrier length',
    source: `const prefix = [null];
      Reflect.defineProperty.apply(Reflect, [prefix, 'length', { value: 0 }]);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a bound Reflect.defineProperty writes carrier length',
    source: `const prefix = [null];
      Reflect.defineProperty.bind(Reflect, prefix, 'length', { value: 0 })();
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.apply invokes Reflect.defineProperty',
    source: `const prefix = [null];
      Reflect.apply(Reflect.defineProperty, Reflect, [prefix, 'length', { value: 0 }]);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.setPrototypeOf replaces the carrier iterator',
    source: `const prefix = [null];
      Object.setPrototypeOf(prefix, { *[Symbol.iterator]() {} });
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.setPrototypeOf replaces a Lodash carrier iterator',
    source: `const prefix = [null];
      Reflect.setPrototypeOf(prefix, { *[Symbol.iterator]() {} });
      Reflect.construct(...prefix, _.template, [configuredSource]);`,
  },
  {
    name: 'Object.setPrototypeOf installs an iterator that yields eval',
    source: `const prefix = [null];
      Object.setPrototypeOf(prefix, { *[Symbol.iterator]() { yield eval; } });
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.setPrototypeOf installs an iterator that yields a compiler',
    source: `const prefix = [null];
      Reflect.setPrototypeOf(prefix, { *[Symbol.iterator]() { yield _.template; } });
      Reflect.construct(...prefix, [configuredSource]);`,
  },
  {
    name: 'an unknown replacement prototype iterator fails closed',
    source: `const prefix = [null];
      Object.setPrototypeOf(prefix, loadPrototype());
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'a conditional replacement prototype iterator fails closed',
    source: `const prefix = [null];
      Reflect.setPrototypeOf(prefix, flag ? { *[Symbol.iterator]() { yield JSON.parse; } } : loadPrototype());
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'a replacement prototype supplies an eval index',
    source: `const prefix = [,];
      Object.setPrototypeOf(prefix, { 0: eval });
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'a direct __proto__ write installs an unsafe iterator',
    source: `const prefix = [null];
      prefix.__proto__ = { *[Symbol.iterator]() { yield eval; } };
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'an Array prototype iterator replacement affects array carriers',
    source: `Array.prototype[Symbol.iterator] = function* replacement() { yield eval; };
      const prefix = [null];
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'an array destructuring target in for-of writes carrier length',
    source: `const prefix = [null];
      for ([prefix.length] of [[0]]) {}
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an object destructuring target in for-of writes carrier length',
    source: `const prefix = [null];
      for ({ length: prefix.length } of [{ length: 0 }]) {}
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an array destructuring target in for-in writes carrier length',
    source: `const prefix = [null];
      for ([prefix.length] in { 0: null }) {}
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an object destructuring target in for-in writes carrier length',
    source: `const prefix = [null];
      for ({ 0: prefix.length } in { 0: null }) {}
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.get retrieves a borrowed carrier mutator',
    source: `const prefix = [null];
      Reflect.get(Array.prototype, 'pop').call(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.getOwnPropertyDescriptor retrieves a carrier mutator',
    source: `const prefix = [null];
      Object.getOwnPropertyDescriptor(Array.prototype, 'pop').value.call(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.getOwnPropertyDescriptors retrieves a carrier mutator',
    source: `const prefix = [null];
      Object.getOwnPropertyDescriptors(Array.prototype).pop.value.call(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.get extracts a mutator from plural descriptors',
    source: `const prefix = [null];
      Reflect.get(Object.getOwnPropertyDescriptors(Array.prototype).pop, 'value').call(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'plural descriptor extraction composes call and apply',
    source: `const prefix = [null];
      Object.getOwnPropertyDescriptors.call(Object, Array.prototype).pop.value.apply(prefix, []);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a reflected plural descriptor mutator is borrowed',
    source: `const prefix = [null];
      const descriptors = Reflect.apply(Object.getOwnPropertyDescriptors, Object, [Array.prototype]);
      Reflect.apply(descriptors.pop.value, prefix, []);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a plural descriptor mutator is bound',
    source: `const prefix = [null];
      const mutate = Object.getOwnPropertyDescriptors(Array.prototype).pop.value.bind(prefix);
      mutate();
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'globalThis plural descriptor extraction retrieves a mutator',
    source: `const prefix = [null];
      globalThis.Object.getOwnPropertyDescriptors(globalThis.Array.prototype).pop.value.call(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.getOwnPropertyDescriptor retrieves a carrier mutator',
    source: `const prefix = [null];
      Reflect.getOwnPropertyDescriptor(Array.prototype, 'pop').value.call(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.getPrototypeOf retrieves a carrier mutator',
    source: `const prefix = [null];
      Object.getPrototypeOf(prefix).pop.call(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.getPrototypeOf retrieves a reflected carrier mutator',
    source: `const prefix = [null];
      Reflect.apply(Reflect.get(Reflect.getPrototypeOf(prefix), 'pop'), prefix, []);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'prototype and descriptor extraction compose',
    source: `const prefix = [null];
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(prefix), 'pop').value.call(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Function.prototype.call.call invokes a plural descriptor mutator',
    source: `const prefix = [null];
      Function.prototype.call.call(
        Object.getOwnPropertyDescriptors(Array.prototype).pop.value,
        prefix
      );
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'the __proto__ descriptor setter replaces a carrier iterator',
    source: `const prefix = [null];
      Object.getOwnPropertyDescriptor(Object.prototype, '__proto__').set.call(
        prefix,
        { *[Symbol.iterator]() { yield eval; } }
      );
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'Function.prototype.call.call invokes a carrier mutator',
    source: `const prefix = [null];
      Function.prototype.call.call(Array.prototype.pop, prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a conditional helper mutates the carrier',
    source: `const prefix = [null];
      const mutate = flag ? Object.assign : value => value;
      mutate(prefix, { length: 0 });
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
];
const positionalInsertionCases = [
  {
    name: 'push inserts eval into a Reflect.apply carrier',
    source: `const args = [];
      args.push(eval, globalThis, [configuredSource]);
      Reflect.apply(...args);`,
  },
  {
    name: 'unshift inserts eval into a Reflect.apply carrier',
    source: `const args = [globalThis, [configuredSource]];
      args.unshift(eval);
      Reflect.apply(...args);`,
  },
  {
    name: 'splice inserts eval into a Reflect.apply carrier',
    source: `const args = [globalThis, [configuredSource]];
      args.splice(0, 0, eval);
      Reflect.apply(...args);`,
  },
  {
    name: 'a borrowed push.call inserts eval',
    source: `const args = [];
      Array.prototype.push.call(args, eval, globalThis, [configuredSource]);
      Reflect.apply(...args);`,
  },
  {
    name: 'a borrowed unshift.apply inserts a Lodash compiler',
    source: `const args = [[configuredSource]];
      Array.prototype.unshift.apply(args, [_.template]);
      Reflect.construct(...args);`,
  },
  {
    name: 'a bound splice inserts eval',
    source: `const args = [globalThis, [configuredSource]];
      const insert = args.splice.bind(args, 0, 0);
      insert(eval);
      Reflect.apply(...args);`,
  },
  {
    name: 'Reflect.apply of push inserts eval',
    source: `const args = [];
      Reflect.apply(Array.prototype.push, args, [eval, globalThis, [configuredSource]]);
      Reflect.apply(...args);`,
  },
  {
    name: 'Object.assign inserts eval into indexed carrier properties',
    source: `const args = [];
      Object.assign(args, { 0: eval, 1: globalThis, 2: [configuredSource], length: 3 });
      Reflect.apply(...args);`,
  },
  {
    name: 'Object.defineProperty inserts a Lodash compiler into a carrier',
    source: `const args = [[configuredSource]];
      Object.defineProperty(args, '0', { value: _.template });
      Reflect.construct(...args);`,
  },
  {
    name: 'Reflect.set inserts eval into a carrier',
    source: `const args = [];
      Reflect.set(args, '0', eval);
      Reflect.set(args, '1', globalThis);
      Reflect.set(args, '2', [configuredSource]);
      Reflect.apply(...args);`,
  },
  {
    name: 'destructuring observes values inserted by push',
    source: `const args = [];
      args.push(eval, globalThis, [configuredSource]);
      const [target, receiver, invocationArgs] = args;
      Reflect.apply(target, receiver, invocationArgs);`,
  },
  {
    name: 'array spread observes a Lodash compiler inserted by unshift',
    source: `const args = [[configuredSource]];
      args.unshift(_.template);
      const copy = [...args];
      Reflect.construct(...copy);`,
  },
  {
    name: 'Array.from observes eval inserted by splice',
    source: `const args = [globalThis, [configuredSource]];
      args.splice(0, 0, eval);
      const copy = Array.from(args);
      Reflect.apply(...copy);`,
  },
];
const multiHopPrototypeCases = [
  {
    name: 'a second-hop iterator yields eval',
    source: `const root = { *[Symbol.iterator]() { yield eval; } };
      const hop = { __proto__: root };
      const prefix = [null];
      Object.setPrototypeOf(prefix, hop);
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.create carries a second-hop Lodash iterator',
    source: `const root = { *[Symbol.iterator]() { yield _.template; } };
      const hop = Object.create(root);
      const prefix = [null];
      Reflect.setPrototypeOf(prefix, hop);
      Reflect.construct(...prefix, [configuredSource]);`,
  },
  {
    name: 'an unknown second-hop prototype fails closed',
    source: `const root = loadPrototype();
      const hop = { __proto__: root };
      const prefix = [null];
      Object.setPrototypeOf(prefix, hop);
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'a conditional second-hop prototype fails closed',
    source: `const root = flag
        ? { *[Symbol.iterator]() { yield JSON.parse; } }
        : loadPrototype();
      const hop = { __proto__: root };
      const prefix = [null];
      Reflect.setPrototypeOf(prefix, hop);
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.defineProperty installs a second-hop iterator',
    source: `const root = {};
      Reflect.defineProperty(root, Symbol.iterator, {
        value: function* replacement() { yield eval; }
      });
      const hop = { __proto__: root };
      const prefix = [null];
      Object.setPrototypeOf(prefix, hop);
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.defineProperties installs a second-hop iterator',
    source: `const root = {};
      Object.defineProperties(root, {
        [Symbol.iterator]: { value: function* replacement() { yield eval; } }
      });
      const hop = { __proto__: root };
      const prefix = [null];
      Object.setPrototypeOf(prefix, hop);
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
];
const inheritedDescriptorProvenanceCases = [
  {
    name: 'Object.defineProperty reads an inherited setter field',
    source: `const descriptorPrototype = { set(value) { this[0] = eval; } };
      const target = {};
      Object.defineProperty(target, 'x', Object.create(descriptorPrototype));
      const args = [null];
      Reflect.set(target, 'x', 1, args);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.defineProperty reads a multi-hop inherited getter field',
    source: `const descriptorRoot = { get() { this[0] = eval; return true; } };
      const descriptorPrototype = Object.create(descriptorRoot);
      const target = {};
      Reflect.defineProperty(target, 'x', Object.create(descriptorPrototype));
      const args = [null];
      Reflect.get(target, 'x', args);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.defineProperties reads inherited descriptor fields',
    source: `const descriptorPrototype = { set(value) { this[0] = eval; } };
      const target = {};
      Object.defineProperties(target, { x: Object.create(descriptorPrototype) });
      const args = [null];
      Reflect.set(target, 'x', 1, args);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.create reads inherited fields from its descriptor map',
    source: `const descriptorPrototype = { get() { this[0] = eval; return true; } };
      const target = Object.create(null, { x: Object.create(descriptorPrototype) });
      const args = [null];
      Reflect.get(target, 'x', args);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.setPrototypeOf supplies a descriptor field prototype',
    source: `const descriptor = {};
      Object.setPrototypeOf(descriptor, { set(value) { this[0] = eval; } });
      const target = {};
      Object.defineProperty(target, 'x', descriptor);
      const args = [null];
      Reflect.set(target, 'x', 1, args);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.setPrototypeOf supplies a descriptor field prototype',
    source: `const descriptor = {};
      Reflect.setPrototypeOf(descriptor, { get() { this[0] = eval; return true; } });
      const target = {};
      Reflect.defineProperty(target, 'x', descriptor);
      const args = [null];
      Reflect.get(target, 'x', args);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'a conditional descriptor prototype fails closed',
    source: `const descriptor = Object.create(
        flag ? { set(value) { this[0] = eval; } } : loadDescriptorPrototype()
      );
      const target = {};
      Object.defineProperty(target, 'x', descriptor);
      const args = [null];
      Reflect.set(target, 'x', 1, args);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'an inherited descriptor-field getter fails closed',
    source: `const descriptorPrototype = {
        get set() { return function setter(value) { this[0] = eval; }; }
      };
      const target = {};
      Reflect.defineProperty(target, 'x', Object.create(descriptorPrototype));
      const args = [null];
      Reflect.set(target, 'x', 1, args);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
];
const accessorReceiverMutationCases = [
  {
    name: 'Reflect.set invokes a direct non-positional setter with the carrier receiver',
    source: `const prefix = [null];
      const target = { set harmless(value) { this.length = 0; } };
      Reflect.set(target, 'harmless', true, prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.set invokes a prototype setter with the carrier receiver',
    source: `const prototype = { set harmless(value) { this[0] = eval; } };
      const target = { __proto__: prototype };
      const prefix = [null];
      Reflect.set(target, 'harmless', true, prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an unknown Reflect.set target may expose a setter',
    source: `const prefix = [null];
      Reflect.set(loadTarget(), 'harmless', true, prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an aliased Reflect.set call retains receiver semantics',
    source: `const prefix = [null];
      const target = { set harmless(value) { this[Symbol.iterator] = loadIterator(); } };
      const write = Reflect.set;
      write.call(Reflect, target, 'harmless', true, prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.get invokes a direct non-positional getter with the carrier receiver',
    source: `const prefix = [null];
      const target = { get harmless() { this.length = 0; return true; } };
      Reflect.get(target, 'harmless', prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.get invokes a prototype getter with the carrier receiver',
    source: `const prototype = { get harmless() { this[0] = eval; return true; } };
      const target = { __proto__: prototype };
      const prefix = [null];
      Reflect.get.call(Reflect, target, 'harmless', prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an unknown aliased Reflect.get target may expose a getter',
    source: `const prefix = [null];
      const read = Reflect.get;
      read.call(Reflect, loadTarget(), 'harmless', prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.defineProperty accessors retain Reflect.get receiver semantics',
    source: `const target = {};
      Object.defineProperty(target, 'harmless', { get() { return true; } });
      const prefix = [null];
      Reflect.get(target, 'harmless', prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an unknown descriptor may install a receiver-sensitive getter',
    source: `const target = {};
      Object.defineProperty(target, 'harmless', loadDescriptor());
      const prefix = [null];
      Reflect.get(target, 'harmless', prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.defineProperty accessors retain Reflect.set receiver semantics',
    source: `const target = {};
      Reflect.defineProperty(target, 'harmless', { set(value) {} });
      const prefix = [null];
      Reflect.set(target, 'harmless', true, prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.apply preserves computed Reflect.get receiver semantics',
    source: `const key = 'harmless';
      const target = { get [key]() { this[Symbol.iterator] = loadIterator(); return true; } };
      const prefix = [null];
      Reflect.apply(Reflect.get, Reflect, [target, key, prefix]);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
];
const observedAccessorSideEffectCases = [
  {
    name: 'a standalone property read observes a carrier getter',
    source: `const args = [null];
      Object.defineProperty(args, 'x', { get() { this[0] = eval; return true; } });
      args.x;
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'a void property read observes a carrier getter',
    source: `const args = [null];
      Object.defineProperty(args, 'x', { get() { this[0] = eval; return true; } });
      void args.x;
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'a conditional property read observes a carrier getter',
    source: `const args = [null];
      Object.defineProperty(args, 'x', { get() { this[0] = eval; return true; } });
      flag && args.x;
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'an assigned computed property read observes a carrier getter',
    source: `const key = 'x';
      const args = [null];
      Object.defineProperty(args, key, { get() { this[0] = eval; return true; } });
      const observed = args[key];
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'object binding destructuring observes a carrier getter',
    source: `const args = [null];
      Object.defineProperty(args, 'x', { get() { this[0] = eval; return true; } });
      const { x } = args;
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'object assignment destructuring observes a carrier getter',
    source: `let observed;
      const args = [null];
      Object.defineProperty(args, 'x', { get() { this[0] = eval; return true; } });
      ({ x: observed } = args);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'object spread observes a carrier getter',
    source: `const args = [null];
      args.__defineGetter__('x', function getter() { this[0] = eval; return true; });
      const copy = { ...args };
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'an inherited getter is observed through ordinary property access',
    source: `Object.defineProperty(Array.prototype, 'x', {
        get() { this[0] = eval; return true; }
      });
      const args = [null];
      args.x;
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'ordinary assignment observes a carrier setter',
    source: `const args = [null];
      Object.defineProperty(args, 'x', { set(value) { this[0] = eval; } });
      args.x = true;
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'ordinary assignment observes an inherited carrier setter',
    source: `Object.defineProperty(Array.prototype, 'x', {
        set(value) { this[0] = eval; }
      });
      const args = [null];
      args.x = true;
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.defineProperty observes a descriptor-field getter',
    source: `const args = [null];
      args.__defineGetter__('value', function valueGetter() { this[0] = eval; return true; });
      Object.defineProperty({}, 'x', args);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.defineProperties observes a descriptor-map getter',
    source: `const args = [null];
      Object.defineProperty(args, 'x', {
        enumerable: true,
        get() { this[0] = eval; return { value: true }; }
      });
      Object.defineProperties({}, args);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.assign observes a source getter',
    source: `const args = [null];
      args.__defineGetter__('x', function sourceGetter() { this[0] = eval; return true; });
      Object.assign({}, args);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'a bound Object.assign observes a source getter',
    source: `const args = [null];
      args.__defineGetter__('x', function sourceGetter() { this[0] = eval; return true; });
      const copy = Object.assign.bind(Object, {});
      copy(args);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'descriptor-extracted Object.assign observes a source getter',
    source: `const args = [null];
      args.__defineGetter__('x', function sourceGetter() { this[0] = eval; return true; });
      Object.getOwnPropertyDescriptor(Object, 'assign').value({}, args);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.apply preserves descriptor-field reads',
    source: `const args = [null];
      args.__defineGetter__('value', function valueGetter() { this[0] = eval; return true; });
      Reflect.apply(Object.defineProperty, Object, [{}, 'x', args]);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'Function.prototype.call.call preserves descriptor-map reads',
    source: `const args = [null];
      Object.defineProperty(args, 'x', {
        enumerable: true,
        get() { this[0] = eval; return { value: true }; }
      });
      Function.prototype.call.call(Object.defineProperties, Object, {}, args);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: '__defineSetter__ is observed by ordinary assignment',
    source: `const args = [null];
      args.__defineSetter__('x', function setter(value) { this[0] = eval; });
      args.x = true;
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'a descriptor-extracted __defineGetter__ is observed by a read',
    source: `const args = [null];
      Object.getOwnPropertyDescriptors(Object.prototype).__defineGetter__.value.call(
        args,
        'x',
        function getter() { this[0] = eval; return true; }
      );
      args.x;
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
];
const objectAssignPrototypeCases = [
  {
    name: 'Object.assign invokes the inherited __proto__ setter',
    source: `const prefix = [null];
      Object.assign(prefix, {
        ['__proto__']: { *[Symbol.iterator]() { yield eval; } }
      });
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'borrowed Object.assign preserves computed __proto__ provenance',
    source: `const key = '__proto__';
      const prefix = [null];
      Object.assign.call(Object, prefix, {
        [key]: { *[Symbol.iterator]() { yield eval; } }
      });
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'conditional Object.assign __proto__ values fail closed',
    source: `const prefix = [null];
      Object.assign(prefix, { ['__proto__']: flag ? {} : loadPrototype() });
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
];
const legacyAccessorMutationCases = [
  {
    name: 'a directly borrowed __defineGetter__ installs an iterator getter',
    source: `const prefix = [null];
      prefix.__defineGetter__(Symbol.iterator, function iteratorGetter() { return loadIterator(); });
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.prototype __defineGetter__ installs a numeric getter',
    source: `const prefix = [null];
      Object.prototype.__defineGetter__.call(prefix, '0', function indexGetter() { return eval; });
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'the plural descriptor extracts __defineGetter__',
    source: `const prefix = [null];
      Object.getOwnPropertyDescriptors(Object.prototype).__defineGetter__.value.apply(prefix, [
        '0',
        function indexGetter() { return eval; }
      ]);
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'the singular descriptor extracts __defineGetter__',
    source: `const prefix = [null];
      Object.getOwnPropertyDescriptor(Object.prototype, '__defineGetter__').value.call(
        prefix,
        Symbol.iterator,
        function iteratorGetter() { return loadIterator(); }
      );
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'the reflected singular descriptor extracts __defineGetter__',
    source: `const prefix = [null];
      Reflect.getOwnPropertyDescriptor(Object.prototype, '__defineGetter__').value.call(
        prefix,
        '0',
        function indexGetter() { return eval; }
      );
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'computed descriptor extraction composes Function.prototype.call.call',
    source: `const key = '__defineGetter__';
      const install = Object.getOwnPropertyDescriptor(Object.prototype, key).value;
      const prefix = [null];
      Function.prototype.call.call(install, prefix, '0', function indexGetter() { return eval; });
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'descriptor-extracted __defineSetter__ invalidates a numeric position',
    source: `const prefix = [null];
      Object.getOwnPropertyDescriptors(Object.prototype).__defineSetter__.value.call(
        prefix,
        '0',
        function indexSetter(value) {}
      );
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
];
const safeReflectiveCarrierCases = [
  {
    name: 'a nearer known-safe iterator shadows an unsafe root iterator',
    source: `const root = { *[Symbol.iterator]() { yield eval; } };
      const hop = {
        __proto__: root,
        *[Symbol.iterator]() { yield JSON.parse; }
      };
      const prefix = [null];
      Object.setPrototypeOf(prefix, hop);
      Reflect.apply(...prefix, null, ['{}']);`,
  },
  {
    name: 'a known-safe iterator survives a multi-hop chain',
    source: `const root = {
        *[Symbol.iterator]() { yield JSON.parse; yield null; yield ['{}']; }
      };
      const hop = { __proto__: root };
      const prefix = [null];
      Reflect.setPrototypeOf(prefix, hop);
      Reflect.apply(...prefix);`,
  },
  {
    name: 'Reflect.set on a known data property does not invalidate its receiver',
    source: `const target = { harmless: 0 };
      const prefix = [null];
      Reflect.set(target, 'harmless', 1, prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.get on a known data property does not invalidate its receiver',
    source: `const target = { harmless: 0 };
      const prefix = [null];
      Reflect.get(target, 'harmless', prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'the known-safe legacy __proto__ getter does not invalidate its receiver',
    source: `const prefix = [null];
      Reflect.get(Object.prototype, '__proto__', prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.assign with ordinary properties preserves the carrier layout',
    source: `const prefix = [null];
      Object.assign(prefix, { harmless: true });
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a non-computed object-literal __proto__ is not assigned',
    source: `const unsafePrototype = { *[Symbol.iterator]() { yield eval; } };
      const prefix = [null];
      Object.assign(prefix, { __proto__: unsafePrototype });
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an own data __proto__ property shadows the legacy setter',
    source: `const prefix = [null];
      Object.defineProperty(prefix, '__proto__', { value: null, writable: true });
      Object.assign(prefix, {
        ['__proto__']: { *[Symbol.iterator]() { yield eval; } }
      });
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an unobserved non-positional legacy getter preserves the carrier layout',
    source: `const prefix = [null];
      prefix.__defineGetter__('metadata', function metadataGetter() { return eval; });
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a data descriptor does not acquire getter receiver side effects',
    source: `const target = {};
      Object.defineProperty(target, 'harmless', { value: true });
      const prefix = [null];
      Reflect.get(target, 'harmless', prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an own undefined descriptor field shadows an inherited setter field',
    source: `const descriptor = Object.create({ set(value) { this[0] = eval; } });
      Object.defineProperty(descriptor, 'set', { value: undefined });
      const target = {};
      Object.defineProperty(target, 'x', descriptor);
      const args = [null];
      Reflect.set(target, 'x', true, args);
      Reflect.apply(...args, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'ordinary data reads and destructuring preserve a carrier layout',
    source: `const args = [null];
      Object.defineProperty(args, 'x', { value: true });
      const direct = args.x;
      const { x } = args;
      Reflect.apply(...args, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'ordinary data spread and Object.assign preserve a carrier layout',
    source: `const args = [null];
      args.x = true;
      const copy = { ...args };
      Object.assign({}, args);
      Reflect.apply(...args, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a mutator may insert unsafe values as data for a safe Reflect target',
    source: `const args = [];
      args.push(eval, _.template);
      Reflect.apply(Array.of, null, args);`,
  },
  {
    name: 'unshift may install a known-safe Reflect.apply target',
    source: `const args = [null, [eval, _.template]];
      args.unshift(Array.of);
      Reflect.apply(...args);`,
  },
  {
    name: 'a borrowed splice may insert only a known-safe Reflect.construct target',
    source: `const args = [[eval, _.template]];
      Array.prototype.splice.call(args, 0, 0, Array);
      Reflect.construct(...args);`,
  },
];
const safePluralDescriptorTargetCases = [
  {
    name: 'Array.of from plural descriptors',
    source: `const target = Object.getOwnPropertyDescriptors(Array).of.value;
      Reflect.apply(target, null, [eval, _.template]);`,
  },
  {
    name: 'globalThis.Array.of from plural descriptors',
    source: `const target = Object.getOwnPropertyDescriptors(globalThis.Array).of.value;
      Reflect.apply(target, null, [eval, _.template]);`,
  },
  {
    name: 'an aliased plural descriptor extractor returns Array.of',
    source: `const descriptorsOf = Object.getOwnPropertyDescriptors;
      const target = descriptorsOf(Array).of.value;
      Reflect.apply(target, null, [eval, _.template]);`,
  },
  {
    name: 'Object.getOwnPropertyDescriptors.call returns Array.of',
    source: `const target = Object.getOwnPropertyDescriptors.call(Object, Array).of.value;
      Reflect.apply(target, null, [eval, _.template]);`,
  },
  {
    name: 'a bound plural descriptor extractor returns Array.of',
    source: `const descriptorsOfArray = Object.getOwnPropertyDescriptors.bind(Object, Array);
      const target = descriptorsOfArray().of.value;
      Reflect.apply(target, null, [eval, _.template]);`,
  },
  {
    name: 'Reflect.apply returns plural Array descriptors',
    source: `const descriptors = Reflect.apply(Object.getOwnPropertyDescriptors, Object, [Array]);
      const target = Reflect.get(Reflect.get(descriptors, 'of'), 'value');
      Reflect.apply(target, null, [eval, _.template]);`,
  },
  {
    name: 'singular descriptor extraction returns Array.of',
    source: `const target = Reflect.getOwnPropertyDescriptor(Array, 'of').value;
      Reflect.apply(target, null, [eval, _.template]);`,
  },
  {
    name: 'plural global descriptors return the Array constructor',
    source: `const target = Object.getOwnPropertyDescriptors(globalThis).Array.value;
      Reflect.apply(target, null, [eval, _.template]);`,
  },
  {
    name: 'plural JSON descriptors return JSON.parse',
    source: `const target = Object.getOwnPropertyDescriptors(globalThis.JSON).parse.value;
      Reflect.apply(target, null, ['{}', eval, _.template]);`,
  },
  {
    name: 'Array construction remains a known-safe target',
    source: `Reflect.construct(globalThis.Array, [eval, _.template]);`,
  },
];
const unsafePluralDescriptorTargetCases = [
  {
    name: 'a conditional plural descriptor target may be eval',
    kind: 'direct-eval',
    source: `const safe = Object.getOwnPropertyDescriptors(Array).of.value;
      const target = flag ? safe : eval;
      Reflect.apply(target, null, [configuredSource]);`,
  },
  {
    name: 'a conditional plural descriptor target may be Lodash template',
    kind: 'lodash-template',
    source: `const safe = Object.getOwnPropertyDescriptors(globalThis.Array).of.value;
      const target = flag ? safe : _.template;
      Reflect.apply(target, null, [configuredSource]);`,
  },
  {
    name: 'a reassigned Array.of retains eval provenance',
    kind: 'direct-eval',
    source: `Array.of = eval;
      const target = Object.getOwnPropertyDescriptors(Array).of.value;
      Reflect.apply(target, null, [configuredSource]);`,
  },
  {
    name: 'a reassigned global Array constructor retains eval provenance',
    kind: 'direct-eval',
    source: `globalThis.Array = eval;
      const target = Object.getOwnPropertyDescriptors(globalThis).Array.value;
      Reflect.apply(target, null, [configuredSource]);`,
  },
  {
    name: 'a reassigned descriptor-extracted Object method retains eval provenance',
    kind: 'direct-eval',
    source: `Object.assign = eval;
      const target = Object.getOwnPropertyDescriptors(Object).assign.value;
      Reflect.apply(target, null, [configuredSource]);`,
  },
  {
    name: 'an unknown alternative to Array.of fails closed',
    kind: 'analysis-limit',
    reason: 'unknown-reflect-target',
    source: `const safe = Object.getOwnPropertyDescriptors(Array).of.value;
      const target = flag ? safe : loadTarget();
      Reflect.apply(target, null, [configuredSource]);`,
  },
];
const accessorReturnedCallableCases = [
  {
    name: 'Object.defineProperty reads an inherited value getter returning eval',
    source: `const target = {};
      Object.defineProperty(target, 'run', Object.create({ get value() { return eval; } }));
      target.run(configuredSource);`,
  },
  {
    name: 'Reflect.defineProperty preserves an inherited value getter through call',
    source: `const target = {};
      Reflect.defineProperty(target, 'run', Object.create({ get value() { return eval; } }));
      target.run.call(null, configuredSource);`,
  },
  {
    name: 'Object.defineProperties preserves inherited value getters through apply',
    source: `const target = {};
      Object.defineProperties(target, {
        run: Object.create({ get value() { return eval; } })
      });
      target.run.apply(null, [configuredSource]);`,
  },
  {
    name: 'Object.create descriptor maps preserve inherited value getters through bind',
    source: `const target = Object.create(null, {
        run: Object.create({ get value() { return eval; } })
      });
      target.run.bind(null)(configuredSource);`,
  },
  {
    name: 'borrowed Object.defineProperty preserves getter-returned eval',
    source: `const target = {};
      Object.defineProperty.call(
        Object,
        target,
        'run',
        Object.create({ get value() { return eval; } })
      );
      Reflect.apply(target.run, null, [configuredSource]);`,
  },
  {
    name: 'reflected Reflect.defineProperty preserves getter-returned eval',
    source: `const target = {};
      Reflect.apply(Reflect.defineProperty, Reflect, [
        target,
        'run',
        Object.create({ get value() { return eval; } })
      ]);
      Reflect.construct(target.run, [configuredSource]);`,
  },
  {
    name: 'Object.defineProperties.call preserves inherited value getters',
    source: `const target = {};
      Object.defineProperties.call(Object, target, {
        run: Object.create({ get value() { return eval; } })
      });
      target.run(configuredSource);`,
  },
  {
    name: 'Reflect.apply of Object.defineProperties preserves inherited value getters',
    source: `const target = Reflect.apply(Object.defineProperties, Object, [
        {},
        { run: Object.create({ get value() { return eval; } }) }
      ]);
      target.run(configuredSource);`,
  },
  {
    name: 'a direct accessor replacing Array.of returns eval',
    source: `Object.defineProperty(Array, 'of', { get() { return eval; } });
      Array.of(configuredSource);`,
  },
  {
    name: 'a computed reflected accessor replacing Array.of returns eval',
    source: `const key = 'of';
      Reflect.defineProperty(globalThis.Array, key, { get() { return eval; } });
      Reflect.apply(globalThis.Array[key], null, [configuredSource]);`,
  },
  {
    name: 'a plural descriptor getter composes call before returning eval',
    source: `const target = { get run() { return eval; } };
      Object.getOwnPropertyDescriptors(target).run.get.call(target)(configuredSource);`,
  },
  {
    name: 'a plural descriptor getter composes Reflect.apply before returning eval',
    source: `const target = { get run() { return eval; } };
      const getter = Object.getOwnPropertyDescriptors(target).run.get;
      Reflect.apply(getter, target, [])(configuredSource);`,
  },
  {
    name: 'a singular descriptor getter composes bind before returning eval',
    source: `const target = { get run() { return eval; } };
      Object.getOwnPropertyDescriptor(target, 'run').get.bind(target)()(configuredSource);`,
  },
];
const unknownPluralDescriptorInvocationCases = [
  {
    name: 'an unknown plural descriptor value is invoked directly',
    source: `Object.getOwnPropertyDescriptors(loadTarget()).run.value(configuredSource);`,
  },
  {
    name: 'an unknown plural descriptor value composes call',
    source: `Object.getOwnPropertyDescriptors(loadTarget()).run.value.call(null, configuredSource);`,
  },
  {
    name: 'an unknown plural descriptor value composes apply',
    source: `Object.getOwnPropertyDescriptors(loadTarget()).run.value.apply(null, [configuredSource]);`,
  },
  {
    name: 'an unknown plural descriptor value composes bind',
    source: `const run = Object.getOwnPropertyDescriptors(loadTarget()).run.value.bind(null);
      run(configuredSource);`,
  },
  {
    name: 'an unknown plural descriptor value composes Reflect.apply',
    source: `Reflect.apply(
        Object.getOwnPropertyDescriptors(loadTarget()).run.value,
        null,
        [configuredSource]
      );`,
  },
  {
    name: 'an unknown plural descriptor value composes Reflect.construct',
    source: `Reflect.construct(
        Object.getOwnPropertyDescriptors(loadTarget()).run.value,
        [configuredSource]
      );`,
  },
  {
    name: 'a conditional plural Array.of descriptor target fails closed',
    source: `Object.getOwnPropertyDescriptors(flag ? Array : loadTarget()).of.value(configuredSource);`,
  },
  {
    name: 'a conditional plural JSON.parse descriptor target fails closed',
    source: `const parse = Object.getOwnPropertyDescriptors(flag ? JSON : loadTarget()).parse.value;
      parse.call(null, configuredSource);`,
  },
];
const unknownSingularReflectiveInvocationCases = [
  {
    name: 'an unknown Object descriptor value is invoked directly',
    source: `Object.getOwnPropertyDescriptor(loadTarget(), loadKey()).value(configuredSource);`,
  },
  {
    name: 'a conditional Reflect descriptor value composes call',
    source: `Reflect.getOwnPropertyDescriptor(
        flag ? Array : loadTarget(),
        flag ? 'of' : loadKey()
      ).value.call(null, configuredSource);`,
  },
  {
    name: 'an Object descriptor intrinsic composes apply before its value is invoked',
    source: `Object.getOwnPropertyDescriptor
        .apply(Object, [loadTarget(), loadKey()])
        .value(configuredSource);`,
  },
  {
    name: 'a bound Reflect descriptor intrinsic returns an invoked value',
    source: `const descriptorOf = Reflect.getOwnPropertyDescriptor.bind(Reflect, loadTarget());
      descriptorOf(loadKey()).value(configuredSource);`,
  },
  {
    name: 'Reflect.apply invokes a singular descriptor intrinsic',
    source: `Reflect.apply(Object.getOwnPropertyDescriptor, Object, [loadTarget(), loadKey()])
        .value(configuredSource);`,
  },
  {
    name: 'an unknown Reflect.get result composes apply',
    source: `Reflect.get(loadTarget(), loadKey()).apply(null, [configuredSource]);`,
  },
  {
    name: 'a bound Reflect.get result is invoked',
    source: `const run = Reflect.get(loadTarget(), loadKey()).bind(null);
      run(configuredSource);`,
  },
  {
    name: 'a conditional Reflect.get target is invoked directly',
    source: `Reflect.get(flag ? { run: Array.of } : loadTarget(), 'run')(configuredSource);`,
  },
  {
    name: 'an unknown Object prototype callable composes bind',
    source: `const run = Object.getPrototypeOf(loadTarget()).run.bind(null);
      run(configuredSource);`,
  },
  {
    name: 'an unknown Reflect prototype callable composes Reflect.apply',
    source: `Reflect.apply(
        Reflect.get(Reflect.getPrototypeOf(loadTarget()), loadKey()),
        null,
        [configuredSource]
      );`,
  },
  {
    name: 'Object.getPrototypeOf.call returns an invoked unknown prototype member',
    source: `Object.getPrototypeOf.call(Object, loadTarget()).run(configuredSource);`,
  },
  {
    name: 'Reflect.apply invokes Object.getPrototypeOf before a derived call',
    source: `Reflect.apply(Object.getPrototypeOf, Object, [loadTarget()]).run(configuredSource);`,
  },
];
const returnedReflectiveTargetCases = [
  {
    name: 'a function returns Reflect.apply for direct invocation',
    kind: 'direct-eval',
    source: `function loadTarget() { return Reflect.apply; }
      const target = loadTarget();
      target(eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an arrow returns Reflect.construct for direct invocation',
    kind: 'lodash-template',
    source: `const loadTarget = () => Reflect.construct;
      const target = loadTarget();
      target(_.template, [configuredSource]);`,
  },
  {
    name: 'a function returns a local Reflect.apply alias',
    kind: 'direct-eval',
    source: `function loadTarget() {
        const reflectiveTarget = globalThis.Reflect.apply;
        return reflectiveTarget;
      }
      loadTarget()(eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a function closes over an outer Reflect.apply alias',
    kind: 'direct-eval',
    source: `const reflectiveTarget = Reflect.apply;
      function loadTarget() { return reflectiveTarget; }
      loadTarget()(eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an identity parameter carries Reflect.apply',
    kind: 'direct-eval',
    source: `function identity(target) { return target; }
      identity(Reflect.apply)(eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a returned closure captures a Reflect.apply parameter',
    kind: 'direct-eval',
    source: `function closeOver(target) { return () => target; }
      closeOver(Reflect.apply)()(eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a later parameter-dependent return retains Reflect.apply',
    kind: 'direct-eval',
    source: `function chooseTarget(target) {
        if (flag) return null;
        return target;
      }
      chooseTarget(Reflect.apply)(eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a default parameter supplies Reflect.apply',
    kind: 'direct-eval',
    source: `function defaultTarget(target = Reflect.apply) { return target; }
      defaultTarget()(eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a destructured parameter carries Reflect.apply',
    kind: 'direct-eval',
    source: `function identity({ target }) { return target; }
      identity({ target: Reflect.apply })(eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an identity parameter carries Reflect.construct',
    kind: 'lodash-template',
    source: `function identity(target) { return target; }
      identity(Reflect.construct)(_.template, [configuredSource]);`,
  },
  {
    name: 'a function closes over an outer Reflect.construct alias',
    kind: 'lodash-template',
    source: `const reflectiveTarget = Reflect.construct;
      function loadTarget() { return reflectiveTarget; }
      loadTarget()(_.template, [configuredSource]);`,
  },
  {
    name: 'a returned conditional Reflect target retains its unknown alternative',
    kind: 'analysis-limit',
    reason: 'unknown-reflective-callable',
    source: `function loadTarget() { return flag ? Reflect.apply : loadUnknownTarget(); }
      const target = loadTarget();
      target(eval, globalThis, [configuredSource]);`,
  },
];
const returnedLocalAliasCases = [
  {
    name: 'a Reflect.apply parameter survives a local alias before return',
    kind: 'direct-eval',
    source: `function id(target) { const alias = target; return alias; }
      id(Reflect.apply)(eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an outer Reflect.apply binding survives a local alias before return',
    kind: 'direct-eval',
    source: `const target = Reflect.apply;
      function loadTarget() { const alias = target; return alias; }
      loadTarget()(eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an unsafe default parameter survives a local alias before return',
    kind: 'direct-eval',
    source: `function loadTarget(target = Reflect.apply) { const alias = target; return alias; }
      loadTarget()(eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a returned closure preserves its parameter through a local alias',
    kind: 'direct-eval',
    source: `function closeOver(target) { const alias = target; return () => alias; }
      closeOver(Reflect.apply)()(eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a nested function preserves an assigned local alias',
    kind: 'direct-eval',
    source: `function closeOver(target) {
        let alias;
        alias = target;
        function nested() { const returned = alias; return returned; }
        return nested;
      }
      closeOver(Reflect.apply)()(eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a receiver survives a local alias return through call',
    kind: 'direct-eval',
    source: `function returnReceiver() { const alias = this; return alias; }
      returnReceiver.call(Reflect.apply)(eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a conditional local alias keeps unsafe and unknown alternatives',
    kind: 'direct-eval',
    additionalKind: 'analysis-limit',
    reason: 'unknown-reflective-callable',
    source: `function choose(target) {
        let alias;
        alias = flag ? target : loadTarget();
        return alias;
      }
      choose(Reflect.apply)(eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an array carrier preserves an assigned Reflect.apply alias',
    kind: 'direct-eval',
    source: `function carry(target) { let carrier; carrier = [target]; const alias = carrier; return alias; }
      carry(Reflect.apply)[0](eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a returned local Reflect.apply alias composes bind',
    kind: 'direct-eval',
    source: `function id(target) { const alias = target; return alias; }
      id(Reflect.apply.bind(Reflect, eval, globalThis))([configuredSource]);`,
  },
  {
    name: 'a returned local Reflect.apply alias composes call',
    kind: 'direct-eval',
    source: `function id(target) { const alias = target; return alias; }
      id(Reflect.apply).call(Reflect, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a returned local Reflect.apply alias composes apply',
    kind: 'direct-eval',
    source: `function id(target) { const alias = target; return alias; }
      id(Reflect.apply).apply(Reflect, [eval, globalThis, [configuredSource]]);`,
  },
  {
    name: 'a Lodash template parameter survives a local alias before return',
    kind: 'lodash-template',
    source: `import compile from 'lodash/template';
      function id(target) { const alias = target; return alias; }
      id(compile)(configuredSource);`,
  },
  {
    name: 'Reflect.construct survives local and object-carrier aliases',
    kind: 'lodash-template',
    source: `import compile from 'lodash/template';
      function carry(target) {
        const local = target;
        const carrier = { target: local };
        const alias = carrier;
        return alias;
      }
      carry(Reflect.construct).target(compile, [configuredSource]);`,
  },
];
const safeReturnedLocalAliasCases = [
  {
    name: 'Array.of survives a parameter and local alias as a known-safe callable',
    source: `function id(target) { const alias = target; return alias; }
      id(Array.of)(eval, _.template);`,
  },
  {
    name: 'a supplied Array.of override suppresses an unsafe default through a local alias',
    source: `function loadTarget(target = Reflect.apply) { const alias = target; return alias; }
      loadTarget(Array.of)(eval, _.template);`,
  },
  {
    name: 'a closure preserves a supplied Array.of override safely',
    source: `function closeOver(target = Reflect.apply) { const alias = target; return () => alias; }
      closeOver(Array.of)()(eval, _.template);`,
  },
  {
    name: 'object and array aliases remain data-only when they are not invoked',
    source: `function carry(target) {
        const objectCarrier = { target };
        const arrayCarrier = [objectCarrier];
        const alias = arrayCarrier;
        return alias;
      }
      consume(carry(Reflect.apply), eval, _.template);`,
  },
  {
    name: 'a conditional local alias containing only known-safe callables stays clean',
    source: `function choose(target) { const alias = flag ? target : JSON.parse; return alias; }
      choose(Array.of)(eval, _.template);`,
  },
];
const unsafeIntrinsicDeletionCases = [
  {
    name: 'delete exposes an eval-valued Array.of prototype property',
    kind: 'direct-eval',
    source: `Object.setPrototypeOf(Array, { of: eval });
      delete Array.of;
      Array.of(configuredSource);`,
  },
  {
    name: 'Reflect.deleteProperty exposes an eval-valued Array.of prototype property',
    kind: 'direct-eval',
    source: `Object.setPrototypeOf(Array, { of: eval });
      Reflect.deleteProperty(Array, 'of');
      Array.of(configuredSource);`,
  },
  {
    name: 'delete exposes an eval-valued Reflect.apply prototype property',
    kind: 'direct-eval',
    source: `Object.setPrototypeOf(Reflect, { apply: eval });
      delete Reflect.apply;
      Reflect.apply(configuredSource);`,
  },
  {
    name: 'Reflect.deleteProperty exposes a Lodash-valued JSON.parse prototype property',
    kind: 'lodash-template',
    source: `Object.setPrototypeOf(JSON, { parse: _.template });
      Reflect.deleteProperty(JSON, 'parse');
      JSON.parse(configuredSource);`,
  },
];
const unknownDescriptorMapInvocationCases = [
  {
    name: 'an unknown defineProperties map may install a callable',
    source: `const target = {};
      Object.defineProperties(target, loadDescriptors());
      target.run(configuredSource);`,
  },
  {
    name: 'an unknown descriptor-map spread may install a callable',
    source: `const descriptors = { ...loadDescriptors() };
      const target = {};
      Reflect.apply(Object.defineProperties, Object, [target, descriptors]);
      target.run(configuredSource);`,
  },
  {
    name: 'Object.assign from an unknown source is fail closed only when invoked',
    source: `const target = {};
      Object.assign(target, loadData());
      Reflect.apply(target.run, null, [configuredSource]);`,
  },
];
const builtinPrototypeCallableCases = [
  {
    name: 'Object.setPrototypeOf adds an eval method to Array',
    kind: 'direct-eval',
    source: `Object.setPrototypeOf(Array, { run: eval });
      Array.run(configuredSource);`,
  },
  {
    name: 'Reflect.setPrototypeOf adds a multi-hop eval method to Array',
    kind: 'direct-eval',
    source: `const root = { run: eval };
      const hop = Object.create(root);
      Reflect.setPrototypeOf(Array, hop);
      Array.run.call(null, configuredSource);`,
  },
  {
    name: 'a computed prototype method composes apply',
    kind: 'direct-eval',
    source: `const key = 'run';
      Object.setPrototypeOf(globalThis.Array, { [key]: eval });
      globalThis.Array[key].apply(null, [configuredSource]);`,
  },
  {
    name: 'a prototype method composes bind and Reflect.apply',
    kind: 'direct-eval',
    source: `Reflect.setPrototypeOf(Array, { run: eval });
      const run = Array.run.bind(null);
      Reflect.apply(run, null, [configuredSource]);`,
  },
  {
    name: 'a prototype method composes Reflect.construct',
    kind: 'direct-eval',
    source: `Object.setPrototypeOf(Array, { run: eval });
      Reflect.construct(Array.run, [configuredSource]);`,
  },
  {
    name: 'an unknown Array prototype fails closed',
    kind: 'analysis-limit',
    source: `Object.setPrototypeOf(Array, loadPrototype());
      Array.run(configuredSource);`,
  },
  {
    name: 'a conditional Array prototype fails closed',
    kind: 'analysis-limit',
    source: `Reflect.setPrototypeOf(Array, flag ? { run: JSON.parse } : loadPrototype());
      Array.run(configuredSource);`,
  },
  {
    name: 'the borrowed __proto__ setter updates a built-in chain',
    kind: 'direct-eval',
    source: `Object.getOwnPropertyDescriptor(Object.prototype, '__proto__').set.call(
        Array,
        { run: eval }
      );
      Reflect.apply(Array.run, null, [configuredSource]);`,
  },
  {
    name: 'a bound Object.setPrototypeOf updates a built-in chain',
    kind: 'direct-eval',
    source: `Object.setPrototypeOf.bind(Object, Array, { run: eval })();
      Array.run(configuredSource);`,
  },
  {
    name: 'Reflect.apply of Reflect.setPrototypeOf updates a built-in chain',
    kind: 'direct-eval',
    source: `Reflect.apply(Reflect.setPrototypeOf, Reflect, [Date, { run: eval }]);
      Date.run(configuredSource);`,
  },
  {
    name: 'a borrowed Object.setPrototypeOf updates a JSON chain',
    kind: 'direct-eval',
    source: `Object.setPrototypeOf.call(Object, JSON, { run: eval });
      JSON.run(configuredSource);`,
  },
];
const iteratorReceiverMutationCases = [
  {
    name: 'array binding destructuring follows a replacement iterator receiver alias',
    source: `const args = [null];
      args[Symbol.iterator] = function* replacement() {
        const receiver = this;
        receiver[0] = eval;
        receiver[Symbol.iterator] = Array.prototype[Symbol.iterator];
      };
      const [ignored] = args;
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'Array.from follows a replacement iterator receiver alias',
    source: `const args = [null];
      args[Symbol.iterator] = function* replacement() {
        const receiver = this;
        Reflect.set(receiver, '0', eval);
        receiver[Symbol.iterator] = Array.prototype[Symbol.iterator];
      };
      Array.from(args);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'manual iterator advancement follows a replacement iterator receiver alias',
    source: `const args = [null];
      args[Symbol.iterator] = function* replacement() {
        const receiver = this;
        Object.defineProperty(receiver, '0', { value: eval });
        receiver[Symbol.iterator] = Array.prototype[Symbol.iterator];
      };
      const iterator = args[Symbol.iterator]();
      iterator.next();
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'for-of follows a replacement iterator receiver alias',
    source: `const args = [null];
      args[Symbol.iterator] = function* replacement() {
        const receiver = this;
        Object.assign(receiver, { 0: eval });
        receiver[Symbol.iterator] = Array.prototype[Symbol.iterator];
      };
      for (const ignored of args) {}
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'array spread follows a replacement iterator receiver alias',
    source: `const args = [null];
      args[Symbol.iterator] = function* replacement() {
        const receiver = this;
        receiver[0] = eval;
        receiver[Symbol.iterator] = Array.prototype[Symbol.iterator];
      };
      [...args];
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'array binding destructuring executes a receiver-mutating replacement iterator',
    source: `const args = [null];
      const originalIterator = args[Symbol.iterator];
      args[Symbol.iterator] = function* replacement() {
        this[0] = eval;
        this[Symbol.iterator] = originalIterator;
      };
      const [] = args;
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'array assignment destructuring executes a receiver-mutating replacement iterator',
    source: `const args = [null];
      args[Symbol.iterator] = function* replacement() {
        Reflect.set(this, '0', eval);
        this[Symbol.iterator] = Array.prototype[Symbol.iterator];
      };
      ([] = args);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'array spread executes a receiver-mutating replacement iterator',
    source: `const args = [null];
      args[Symbol.iterator] = function* replacement() {
        Object.defineProperty(this, '0', { value: eval });
        this[Symbol.iterator] = Array.prototype[Symbol.iterator];
      };
      [...args];
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'for-of executes a receiver-mutating replacement iterator',
    source: `const args = [null];
      args[Symbol.iterator] = function* replacement() {
        Object.assign(this, { 0: eval });
        this[Symbol.iterator] = Array.prototype[Symbol.iterator];
      };
      for (const ignored of args) {}
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'yield star executes a receiver-mutating replacement iterator',
    source: `const args = [null];
      args[Symbol.iterator] = function* replacement() {
        this[0] = eval;
        this[Symbol.iterator] = Array.prototype[Symbol.iterator];
      };
      function* forward() { yield* args; }
      forward().next();
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'reflective argument spread executes a receiver-mutating replacement iterator',
    source: `const args = [null];
      args[Symbol.iterator] = function* replacement() {
        this[0] = eval;
        this[Symbol.iterator] = Array.prototype[Symbol.iterator];
      };
      Reflect.apply(Array.of, null, [...args]);
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
  {
    name: 'an inherited replacement iterator mutates its array receiver',
    source: `const prototype = {
        *[Symbol.iterator]() {
          this[0] = eval;
          this[Symbol.iterator] = Array.prototype[Symbol.iterator];
        }
      };
      const args = [null];
      Object.setPrototypeOf(args, prototype);
      const [] = args;
      Reflect.apply(...args, globalThis, [configuredSource]);`,
  },
];
const safeAccessorAndBuiltinPrototypeCases = [
  {
    name: 'an inherited descriptor value getter returns Array.of',
    source: `const target = {};
      Object.defineProperty(target, 'run', Object.create({ get value() { return Array.of; } }));
      Reflect.apply(target.run, null, [eval, _.template]);`,
  },
  {
    name: 'an Array.of accessor returns JSON.parse',
    source: `Object.defineProperty(Array, 'of', { get() { return JSON.parse; } });
      Array.of('{}');`,
  },
  {
    name: 'a descriptor-extracted getter returns Array.of',
    source: `const target = { get run() { return Array.of; } };
      Object.getOwnPropertyDescriptors(target).run.get.call(target)(eval, _.template);`,
  },
  {
    name: 'Array.of shadows an unsafe replacement prototype property',
    source: `Object.setPrototypeOf(Array, { of: eval });
      Array.of(eval, _.template);`,
  },
  {
    name: 'singular Array.of descriptor extraction ignores an unsafe replacement prototype property',
    source: `Object.setPrototypeOf(Array, { of: eval });
      const target = Object.getOwnPropertyDescriptor(Array, 'of').value;
      Reflect.apply(target, null, [eval, _.template]);`,
  },
  {
    name: 'a returned known-safe callable stays clean',
    source: `function loadTarget() { return Array.of; }
      const target = loadTarget();
      target(eval, _.template);`,
  },
  {
    name: 'an identity parameter returns Array.of safely',
    source: `function identity(target) { return target; }
      identity(Array.of)(eval, _.template);`,
  },
  {
    name: 'a supplied Array.of argument suppresses an unsafe default',
    source: `function defaultTarget(target = Reflect.apply) { return target; }
      defaultTarget(Array.of)(eval, _.template);`,
  },
  {
    name: 'a returned closure captures Array.of safely',
    source: `function closeOver(target) { return () => target; }
      closeOver(Array.of)()(eval, _.template);`,
  },
  {
    name: 'a higher-order Reflect.apply invokes returned Array.of safely',
    source: `function identity(target) { return target; }
      identity(Reflect.apply)(Array.of, null, [eval, _.template]);`,
  },
  {
    name: 'an own Object descriptor remains safe above an unsafe Array prototype property',
    source: `Object.setPrototypeOf(Array, { of: eval });
      function loadTarget() {
        return Object.getOwnPropertyDescriptor(Array, 'of').value;
      }
      loadTarget()(eval, _.template);`,
  },
  {
    name: 'an own Reflect descriptor remains safe above an unsafe Array prototype property',
    source: `Reflect.setPrototypeOf(Array, { of: _.template });
      const target = Reflect.getOwnPropertyDescriptor(Array, 'of').value;
      Reflect.apply(target, null, [eval, _.template]);`,
  },
  {
    name: 'Reflect.get prefers a known-safe own callable over an unsafe prototype callable',
    source: `const target = { __proto__: { run: eval }, run: Array.of };
      Reflect.get(target, 'run')(eval, _.template);`,
  },
  {
    name: 'Object.getPrototypeOf returns a prototype with a safe own callable',
    source: `const root = { run: eval };
      const prototype = { __proto__: root, run: Array.of };
      const target = { __proto__: prototype };
      Object.getPrototypeOf(target).run(eval, _.template);`,
  },
  {
    name: 'unknown singular reflective values stay clean when used only as data',
    source: `const descriptorValue = Object.getOwnPropertyDescriptor(loadData(), loadKey()).value;
      const reflectedValue = Reflect.get(loadData(), loadKey());
      const prototype = Reflect.getPrototypeOf(loadData());
      consume(descriptorValue, reflectedValue, prototype);`,
  },
  {
    name: 'deleting Array.of may expose a known-safe prototype callable',
    source: `Object.setPrototypeOf(Array, { of: JSON.parse });
      Reflect.deleteProperty(Array, 'of');
      Array.of('{}');`,
  },
  {
    name: 'unknown data and descriptor maps stay clean when used only as data',
    source: `const data = { ...loadData() };
      const descriptors = { ...loadDescriptors() };
      Object.defineProperties({}, descriptors);
      JSON.stringify(data);`,
  },
  {
    name: 'creating a manual iterator does not execute its body before next',
    source: `const args = [null];
      args[Symbol.iterator] = function* replacement() {
        const receiver = this;
        receiver[0] = eval;
      };
      const iterator = args[Symbol.iterator]();
      Reflect.apply(...[Array.of, null, [iterator, eval, _.template]]);`,
  },
  {
    name: 'Array.of shadows an unknown replacement prototype',
    source: `Reflect.setPrototypeOf(Array, loadPrototype());
      Reflect.apply(Array.of, null, [eval, _.template]);`,
  },
  {
    name: 'JSON.parse shadows an unknown replacement prototype',
    source: `Object.setPrototypeOf(JSON, loadPrototype());
      JSON.parse('{}');`,
  },
  {
    name: 'an ordinary unknown callable remains outside reflective fail-closed provenance',
    source: `loadTarget().run(configuredSource);`,
  },
  {
    name: 'a receiver-reading iterator has no mutation side effect',
    source: `const prefix = [null];
      prefix[Symbol.iterator] = function* replacement() {
        const length = this.length;
        yield JSON.parse;
      };
      Reflect.apply(...prefix, null, ['{}']);`,
  },
];
const reviewedReflectiveMutationCases = [
  ...multiHopPrototypeCases,
  ...inheritedDescriptorProvenanceCases,
  ...accessorReceiverMutationCases,
  ...observedAccessorSideEffectCases,
  ...objectAssignPrototypeCases,
  ...legacyAccessorMutationCases,
];
const productionBlockingReviewCases = [
  multiHopPrototypeCases[0],
  inheritedDescriptorProvenanceCases[0],
  accessorReceiverMutationCases[0],
  observedAccessorSideEffectCases[0],
  objectAssignPrototypeCases[0],
  legacyAccessorMutationCases[2],
];
const productionCarrierReviewCases = mutableSpreadPrefixCases.filter(({ name }) =>
  [
    'Reflect.set writes an eval target through its receiver',
    'Object.setPrototypeOf installs an iterator that yields eval',
    'Reflect.defineProperty writes carrier length',
    'Object.getOwnPropertyDescriptors retrieves a carrier mutator',
  ].includes(name)
);
const productionFinalReviewCases = [
  accessorReturnedCallableCases[0],
  unknownPluralDescriptorInvocationCases[0],
  builtinPrototypeCallableCases[0],
  iteratorReceiverMutationCases[0],
  returnedReflectiveTargetCases.find(({ name }) => name === 'an identity parameter carries Reflect.apply'),
  positionalInsertionCases.find(({ name }) => name === 'unshift inserts eval into a Reflect.apply carrier'),
  unknownSingularReflectiveInvocationCases[0],
];

const targetSensitiveUnsafeSpreadCases = [
  {
    name: 'Reflect.apply receives an unknown prefix for a Reflect.apply target',
    source: `const prefix = loadPrefix();
      Reflect.apply(Reflect.apply, null, [...prefix, eval, globalThis, [configuredSource]]);`,
  },
  {
    name: 'Reflect.construct receives an unknown prefix for a Reflect.construct target',
    source: `const prefix = loadPrefix();
      Reflect.construct(Reflect.construct, [...prefix, _.template, [configuredSource]]);`,
  },
];
const unknownReflectTargetCases = [
  {
    name: 'an unknown Reflect.apply target',
    kind: 'direct-eval',
    source: `function loadTarget() { return Reflect.apply; }
      const target = loadTarget();
      Reflect.apply(target, null, [eval, globalThis, [configuredSource]]);`,
  },
  {
    name: 'an unknown Reflect.construct target',
    kind: 'lodash-template',
    source: `function loadTarget() { return Reflect.construct; }
      const target = loadTarget();
      Reflect.apply(target, null, [_.template, [configuredSource]]);`,
  },
  {
    name: 'a conditional target with unknown provenance',
    kind: 'analysis-limit',
    reason: 'unknown-reflect-target',
    source: `const target = flag ? Array.of : loadTarget();
      Reflect.apply(target, null, [eval, globalThis, [configuredSource]]);`,
  },
];
const safeNestedReflectCases = [
  {
    name: 'nested Reflect.apply with Array.of as the final target',
    source: `Reflect.apply(Reflect.apply, null, [Array.of, null, [eval, _.template]]);`,
  },
  {
    name: 'nested Reflect.construct with Array as the final target',
    source: `Reflect.apply(Reflect.construct, null, [Array, [eval, _.template]]);`,
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
    name: 'unsafe callable data follows an unknown spread for a safe Reflect.apply target',
    source: `const prefix = loadPrefix();
      Reflect.apply(Array.of, null, [...prefix, _.template]);`,
  },
  {
    name: 'unsafe callable data follows an unknown spread for a safe Reflect.construct target',
    source: `const prefix = loadPrefix();
      Reflect.construct(Array, [...prefix, _.template]);`,
  },
  {
    name: 'a known safe replacement iterator supplies a safe Reflect.apply target',
    source: `const prefix = [null];
      prefix[Symbol.iterator] = function* replacement() { yield JSON.parse; };
      Reflect.apply(...prefix, null, ['{}']);`,
  },
  {
    name: 'replacement iterators do not affect Reflect.apply array-like arguments for a safe target',
    source: `const argumentsList = ['data'];
      argumentsList[Symbol.iterator] = loadIterator();
      Reflect.apply(Array.of, null, argumentsList);`,
  },
  {
    name: 'an ordinary callee may consume an unknown replacement iterator as data',
    source: `const collect = (...values) => values;
      const values = [null];
      values[Symbol.iterator] = loadIterator();
      collect(...values, eval, _.template);`,
  },
  {
    name: 'ordinary function receiving spread unsafe callable values',
    source: `const collect = (...values) => values; collect(...[eval, _.template]);`,
  },
  {
    name: 'ordinary function receiving builtin eval after an unknown spread',
    source: `const collect = (...values) => values;
      const prefix = loadPrefix();
      collect(...prefix, eval);`,
  },
  {
    name: 'ordinary function receiving a Lodash compiler after an unknown spread',
    source: `import compile from 'lodash/template';
      const collect = (...values) => values;
      const prefix = loadPrefix();
      collect(...prefix, compile);`,
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
const mapperReviewCases = [
  {
    name: 'Array.map returns eval from a supplied mapper receiver',
    kind: 'direct-eval',
    source: `const values = [0].map(function () { return this.execute; }, { execute: eval });
      values[0](configuredSource);`,
  },
  {
    name: 'Array.from returns a Lodash compiler from its mapper',
    kind: 'lodash-template',
    source: `const values = Array.from([0], () => _.template);
      values[0](configuredTemplate)();`,
  },
  {
    name: 'a borrowed Array.map retains mapper return provenance',
    kind: 'direct-eval',
    source: `const values = Array.prototype.map.call([0], () => eval);
      values[0](configuredSource);`,
  },
  {
    name: 'a bound Array.map retains mapper return provenance',
    kind: 'lodash-template',
    source: `const values = Array.prototype.map.bind([0], () => _.template)();
      values[0](configuredTemplate)();`,
  },
  {
    name: 'Reflect.apply invokes Array.map with a provenance mapper',
    kind: 'direct-eval',
    source: `const values = Reflect.apply(Array.prototype.map, [0], [() => eval]);
      values[0](configuredSource);`,
  },
  {
    name: 'a borrowed Array.from retains mapper return provenance',
    kind: 'direct-eval',
    source: `const values = Array.from.call(Array, [0], () => eval);
      values[0](configuredSource);`,
  },
  {
    name: 'a bound Array.from retains mapper return provenance',
    kind: 'lodash-template',
    source: `const values = Array.from.bind(Array, [0], () => _.template)();
      values[0](configuredTemplate)();`,
  },
  {
    name: 'Reflect.apply invokes Array.from with a mapper receiver',
    kind: 'direct-eval',
    source: `const values = Reflect.apply(Array.from, Array, [
        [0],
        function () { return this.execute; },
        { execute: eval }
      ]);
      values[0](configuredSource);`,
  },
  {
    name: 'a map callback mutates a later carrier through its third parameter',
    kind: 'direct-eval',
    source: `const prefix = [null];
      [0].map(function (_value, _index, array) {
        array.push(prefix);
        array[1].pop();
      });
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Array.map reads a later eval element after callback mutation',
    kind: 'direct-eval',
    source: `const input = [0, 1];
      const values = input.map(function (value, index, array) {
        if (index === 0) array[1] = eval;
        return array[index];
      });
      values[1](configuredSource);`,
  },
  {
    name: 'a borrowed Array.map reads a later Lodash element after callback mutation',
    kind: 'lodash-template',
    source: `const input = [0, 1];
      const values = Array.prototype.map.call(input, function (value, index, array) {
        if (index === 0) array[1] = _.template;
        return array[index];
      });
      values[1](configuredTemplate)();`,
  },
  {
    name: 'a bound Array.map reads a later eval element after callback mutation',
    kind: 'direct-eval',
    source: `const input = [0, 1];
      const values = Array.prototype.map.bind(input, function (value, index, array) {
        if (index === 0) array[1] = eval;
        return array[index];
      })();
      values[1](configuredSource);`,
  },
  {
    name: 'Reflect.apply Array.map reads a later Lodash element after callback mutation',
    kind: 'lodash-template',
    source: `const input = [0, 1];
      const values = Reflect.apply(Array.prototype.map, input, [function (value, index, array) {
        if (index === 0) array[1] = _.template;
        return array[index];
      }]);
      values[1](configuredTemplate)();`,
  },
  {
    name: 'an ordinary Array constructor retains eval provenance',
    kind: 'direct-eval',
    source: `new Array(eval)[0](configuredSource);`,
  },
  {
    name: 'an ordinary Array call retains Lodash provenance',
    kind: 'lodash-template',
    source: `Array(_.template)[0](configuredTemplate)();`,
  },
  {
    name: 'nested ordinary Array constructors retain eval provenance',
    kind: 'direct-eval',
    source: `Array(new Array(eval))[0][0](configuredSource);`,
  },
  {
    name: 'a borrowed ordinary Array call retains eval provenance',
    kind: 'direct-eval',
    source: `Array.call(null, eval)[0](configuredSource);`,
  },
  {
    name: 'a bound ordinary Array call retains Lodash provenance',
    kind: 'lodash-template',
    source: `Array.bind(null, _.template)()[0](configuredTemplate)();`,
  },
  {
    name: 'a reflected ordinary Array call retains eval provenance',
    kind: 'direct-eval',
    source: `Reflect.apply(Array, null, [eval])[0](configuredSource);`,
  },
  {
    name: 'Array.map fails closed when a later callback write crosses the tracked position boundary',
    kind: 'analysis-limit',
    reason: 'unknown-reflective-callable',
    source: `const input = [${Array.from({ length: 65 }, (_, index) => index).join(',')}];
      const values = input.map(function (value, index, array) {
        if (index === 0) array[64] = eval;
        return array[index];
      });
      values[64](configuredSource);`,
  },
  {
    name: 'an ordinary array literal fails closed at the tracked position boundary',
    kind: 'analysis-limit',
    reason: 'unknown-reflective-callable',
    source: `const values = [${Array.from({ length: 65 }, (_, index) => (index === 64 ? 'eval' : index)).join(
      ','
    )}]; values[64](configuredSource);`,
  },
  {
    name: 'an ordinary Array call fails closed at the tracked position boundary',
    kind: 'analysis-limit',
    reason: 'unknown-reflective-callable',
    source: `const values = Array(${Array.from({ length: 65 }, (_, index) => (index === 64 ? 'eval' : index)).join(
      ','
    )}); values[64](configuredSource);`,
  },
  {
    name: 'an ordinary Array constructor fails closed at the tracked position boundary',
    kind: 'analysis-limit',
    reason: 'unknown-reflective-callable',
    source: `const values = new Array(${Array.from({ length: 65 }, (_, index) => (index === 64 ? 'eval' : index)).join(
      ','
    )}); values[64](configuredSource);`,
  },
  {
    name: 'Array.of fails closed at the tracked position boundary',
    kind: 'analysis-limit',
    reason: 'unknown-reflective-callable',
    source: `const values = Array.of(${Array.from({ length: 65 }, (_, index) => (index === 64 ? 'eval' : index)).join(
      ','
    )}); values[64](configuredSource);`,
  },
  {
    name: 'an unknown map callback fails closed when its result is invoked',
    kind: 'analysis-limit',
    reason: 'unknown-reflective-callable',
    source: `const values = [0].map(loadMapper()); values[0](configuredSource);`,
  },
  {
    name: 'an ambiguous Array.from callback return fails closed when invoked',
    kind: 'analysis-limit',
    reason: 'unknown-reflective-callable',
    source: `const values = Array.from([0], () => loadCallable()); values[0](configuredSource);`,
  },
];
const collectionIterationReviewCases = [
  {
    name: 'default Map for-of iteration retains eval values',
    kind: 'direct-eval',
    source: `for (const [, execute] of new Map([['x', eval]])) { execute(configuredSource); }`,
  },
  {
    name: 'Set spread retains Lodash compiler values',
    kind: 'lodash-template',
    source: `const values = [...new Set([_.template])]; values[0](configuredTemplate)();`,
  },
  {
    name: 'Array.from retains Set eval values',
    kind: 'direct-eval',
    source: `const values = Array.from(new Set([eval])); values[0](configuredSource);`,
  },
  {
    name: 'destructured Array.from retains Map compiler values',
    kind: 'lodash-template',
    source: `const [[, compile]] = Array.from(new Map([['x', _.template]]));
      compile(configuredTemplate)();`,
  },
  {
    name: 'Map spread retains eval values',
    kind: 'direct-eval',
    source: `const [[, execute]] = [...new Map([['x', eval]])]; execute(configuredSource);`,
  },
  {
    name: 'nested Set and Map constructors retain eval values',
    kind: 'direct-eval',
    source: `const [[, execute]] = new Set(new Map([['x', eval]])); execute(configuredSource);`,
  },
  {
    name: 'nested Map and Set constructors retain Lodash compiler values',
    kind: 'lodash-template',
    source: `const [, compile] = [...new Map(new Set([['x', _.template]]))][0];
      compile(configuredTemplate)();`,
  },
  {
    name: 'default Map manual next retains eval values',
    kind: 'direct-eval',
    source: `const [, execute] = new Map([['x', eval]])[Symbol.iterator]().next().value;
      execute(configuredSource);`,
  },
  {
    name: 'default Set manual next retains Lodash compiler values',
    kind: 'lodash-template',
    source: `new Set([_.template])[Symbol.iterator]().next().value(configuredTemplate)();`,
  },
  {
    name: 'Map key iteration retains callable key provenance',
    kind: 'direct-eval',
    source: `new Map([[eval, 'value']]).keys().next().value(configuredSource);`,
  },
  {
    name: 'Set entries retain callable value provenance',
    kind: 'direct-eval',
    source: `const [, execute] = new Set([eval]).entries().next().value; execute(configuredSource);`,
  },
  {
    name: 'Map set mutation propagates through an explicit values for-of loop',
    kind: 'direct-eval',
    source: `const values = new Map(); values.set('run', eval);
      for (const execute of values.values()) execute(configuredSource);`,
  },
  {
    name: 'Set add mutation propagates through default destructuring',
    kind: 'lodash-template',
    source: `const values = new Set(); values.add(_.template);
      const [compile] = values; compile(configuredTemplate)();`,
  },
  {
    name: 'Map set mutation propagates callable keys through spread',
    kind: 'direct-eval',
    source: `const values = new Map(); values.set(eval, 'value');
      const [execute] = [...values.keys()]; execute(configuredSource);`,
  },
  {
    name: 'Map set mutation propagates through manual values extraction',
    kind: 'lodash-template',
    source: `const values = new Map(); values.set('run', _.template);
      values.values().next().value(configuredTemplate)();`,
  },
  {
    name: 'a borrowed Map iterator observes later set mutations',
    kind: 'direct-eval',
    source: `const values = new Map(); values.set('run', eval);
      Map.prototype.values.call(values).next().value(configuredSource);`,
  },
  {
    name: 'a bound Set iterator observes later add mutations',
    kind: 'lodash-template',
    source: `const values = new Set(); values.add(_.template);
      Set.prototype.values.bind(values)().next().value(configuredTemplate)();`,
  },
  {
    name: 'a reflected Map iterator observes later set mutations',
    kind: 'direct-eval',
    source: `const values = new Map(); values.set('run', eval);
      Reflect.apply(Map.prototype.values, values, []).next().value(configuredSource);`,
  },
  {
    name: 'a borrowed Map set mutation propagates to its values iterator',
    kind: 'direct-eval',
    source: `const values = new Map(); Map.prototype.set.call(values, 'run', eval);
      values.values().next().value(configuredSource);`,
  },
  {
    name: 'a bound Map set mutation propagates through spread',
    kind: 'lodash-template',
    source: `const values = new Map(); Map.prototype.set.bind(values)('run', _.template);
      [...values.values()][0](configuredTemplate)();`,
  },
  {
    name: 'a reflected Set add mutation propagates through its default iterator',
    kind: 'direct-eval',
    source: `const values = new Set(); Reflect.apply(Set.prototype.add, values, [eval]);
      values[Symbol.iterator]().next().value(configuredSource);`,
  },
  {
    name: 'mutable Set entries retain their duplicated Lodash value',
    kind: 'lodash-template',
    source: `const values = new Set(); values.add(_.template);
      values.entries().next().value[1](configuredTemplate)();`,
  },
  {
    name: 'nested collection constructors observe mutable Set values',
    kind: 'lodash-template',
    source: `const source = new Set(); source.add(_.template);
      const [compile] = Array.from(new Set(source)); compile(configuredTemplate)();`,
  },
  {
    name: 'an unknown Set entry value fails closed through manual extraction',
    kind: 'analysis-limit',
    reason: 'unknown-reflective-callable',
    source: `new Set(loadValues()).entries().next().value[1](configuredSource);`,
  },
  {
    name: 'an unknown Map iterable fails closed at invocation',
    kind: 'analysis-limit',
    reason: 'unknown-reflective-callable',
    source: `const [[, execute]] = new Map(loadEntries()); execute(configuredSource);`,
  },
  {
    name: 'an unknown Set iterable fails closed at invocation',
    kind: 'analysis-limit',
    reason: 'unknown-reflective-callable',
    source: `const [execute] = new Set(loadValues()); execute(configuredSource);`,
  },
];
const sideEffectFunctionReviewCases = [
  {
    name: 'a side-effect-only parameter pop conceals eval',
    source: `function mutate(value) { value.pop(); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a side-effect-only parameter pop conceals a Lodash compiler',
    source: `function mutate(value) { value.pop(); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, _.template, _, [configuredTemplate])();`,
  },
  {
    name: 'a returned closure mutates its captured carrier',
    source: `function makeMutator(value) { return () => value.pop(); }
      const prefix = [null]; makeMutator(prefix)();
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a receiver-sensitive local function mutates through call',
    source: `function mutate() { this.pop(); }
      const prefix = [null]; mutate.call(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a direct local function length write changes a carrier',
    source: `function mutate(value) { value.length = 0; }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a borrowed local mutator call changes a carrier',
    source: `function mutate(value) { value.pop(); }
      const prefix = [null]; mutate.call(null, prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a bound local mutator changes a carrier',
    source: `function mutate(value) { value.pop(); }
      const prefix = [null]; mutate.bind(null, prefix)();
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a reflected local mutator changes a carrier',
    source: `function mutate(value) { value.pop(); }
      const prefix = [null]; Reflect.apply(mutate, null, [prefix]);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.assign in a local function changes carrier length',
    source: `function mutate(value) { Object.assign(value, { length: 0 }); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.defineProperty in a local function changes carrier length',
    source: `function mutate(value) { Object.defineProperty(value, 'length', { value: 0 }); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Object.defineProperties in a local function changes carrier length',
    source: `function mutate(value) { Object.defineProperties(value, { length: { value: 0 } }); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, _.template, _, [configuredTemplate])();`,
  },
  {
    name: 'Reflect.set in a local function changes carrier length',
    source: `function mutate(value) { Reflect.set(value, 'length', 0); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.set in a local function writes through a receiver',
    source: `function mutate(value) { Reflect.set({}, '0', eval, value); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.defineProperty in a local function changes carrier length',
    source: `function mutate(value) { Reflect.defineProperty(value, 'length', { value: 0 }); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a descriptor-extracted mutator changes a local function parameter',
    source: `const pop = Object.getOwnPropertyDescriptor(Array.prototype, 'pop').value;
      function mutate(value) { pop.call(value); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: '__defineGetter__ in a local function replaces carrier iteration',
    source: `function mutate(value) {
        value.__defineGetter__(Symbol.iterator, function () {
          return function* replacement() { yield eval; };
        });
      }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, globalThis, [configuredSource]);`,
  },
  {
    name: 'an unknown local function effect fails closed',
    source: `function mutate(value) { loadMutator()(value); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an invoked nested declaration mutates its captured parameter',
    source: `function mutate(value) { function nested() { value.pop(); } nested(); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an invoked nested default captures and mutates its outer parameter',
    source: `function prepare(args) {
        function nested(value = args) { value.pop(); }
        nested();
      }
      const args = [null]; prepare(args);
      Reflect.apply(...args, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an invoked nested arrow mutates its captured parameter',
    source: `function mutate(value) { const nested = () => value.shift(); nested(); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, _.template, _, [configuredTemplate])();`,
  },
  {
    name: 'a returned closure composes an invoked nested effect',
    source: `function makeMutator(value) {
        return function () { function nested() { value.pop(); } nested(); };
      }
      const prefix = [null]; makeMutator(prefix)();
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a returned closure composes a nested default effect',
    source: `function prepare(args) {
        return function () {
          function nested(value = args) { value.pop(); }
          nested();
        };
      }
      const args = [null]; prepare(args)();
      Reflect.apply(...args, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a nested local factory returns an invoked carrier-mutating closure',
    source: `function prepare(args) {
        function makeMutator() {
          return function (value = args) { value.pop(); };
        }
        makeMutator()();
      }
      const args = [null]; prepare(args);
      Reflect.apply(...args, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an ambiguous parameterized local closure factory fails closed',
    source: `function prepare(args) {
        function makeMutator(value) { return function () { value.pop(); }; }
        makeMutator(args)();
      }
      const args = [null]; prepare(args);
      Reflect.apply(...args, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an observed getter read invokes its captured carrier effect',
    source: `const prefix = [null];
      const observed = { get value() { prefix.pop(); return JSON.parse; } };
      observed.value;
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an observed descriptor getter composes a nested captured carrier effect',
    source: `const args = [null];
      const holder = {};
      Object.defineProperty(holder, 'trigger', {
        get() {
          function nested(value = args) { value.pop(); }
          nested();
          return JSON.parse;
        }
      });
      void holder.trigger;
      Reflect.apply(...args, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a defaulted carrier parameter is materialized before effect gating',
    source: `function mutate(value = prefix) { value.pop(); }
      const prefix = [null]; mutate();
      Reflect.apply(...prefix, _.template, _, [configuredTemplate])();`,
  },
  {
    name: 'a default parameter factory mutates a captured invocation carrier',
    source: `const args = [null];
      function prepare(value = (args.pop(), JSON.parse)) { value('{}'); }
      prepare();
      Reflect.apply(...args, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a function-valued default composes its carrier effect',
    source: `function inner(value) { value.pop(); }
      function mutate(value, effect = inner) { effect(value); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a destructured parameter preserves its carrier effect alias',
    source: `function mutate({ value }) { value.shift(); }
      const prefix = [null]; mutate({ value: prefix });
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'for-of preserves a carrier alias used by a nested effect',
    source: `function mutate(values) { for (const value of values) value.pop(); }
      const prefix = [null]; mutate([prefix]);
      Reflect.apply(...prefix, _.template, _, [configuredTemplate])();`,
  },
  {
    name: 'manual iterator extraction preserves a carrier effect alias',
    source: `function mutate(values) { values[Symbol.iterator]().next().value.pop(); }
      const prefix = [null]; mutate([prefix]);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
];
const sideEffectPositionalMutationCases = [
  {
    name: 'push inserts an eval invocation layout',
    source: `function mutate(value) { value.push(eval, globalThis, [configuredSource]); }
      const prefix = []; mutate(prefix); Reflect.apply(...prefix);`,
  },
  {
    name: 'unshift inserts an eval invocation target',
    source: `function mutate(value) { value.unshift(eval); }
      const prefix = [globalThis, [configuredSource]]; mutate(prefix); Reflect.apply(...prefix);`,
  },
  {
    name: 'splice inserts an eval invocation target',
    source: `function mutate(value) { value.splice(0, 0, eval); }
      const prefix = [globalThis, [configuredSource]]; mutate(prefix); Reflect.apply(...prefix);`,
  },
  {
    name: 'pop removes a safe Reflect.apply prefix',
    source: `function mutate(value) { value.pop(); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'shift removes a safe Reflect.apply prefix',
    source: `function mutate(value) { value.shift(); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'copyWithin can move eval into the invocation target',
    source: `function mutate(value) { value.copyWithin(0, 1, 2); }
      const prefix = [null, eval, globalThis, [configuredSource]]; mutate(prefix); Reflect.apply(...prefix);`,
  },
  {
    name: 'fill can replace the invocation target with eval',
    source: `function mutate(value) { value.fill(eval, 0, 1); }
      const prefix = [null, globalThis, [configuredSource]]; mutate(prefix); Reflect.apply(...prefix);`,
  },
  {
    name: 'reverse can move eval into the invocation target',
    source: `function mutate(value) { value.reverse(); }
      const prefix = [[configuredSource], globalThis, eval]; mutate(prefix); Reflect.apply(...prefix);`,
  },
  {
    name: 'sort makes an eval-bearing invocation layout ambiguous',
    source: `function mutate(value) { value.sort(); }
      const prefix = [null, eval, globalThis, [configuredSource]]; mutate(prefix); Reflect.apply(...prefix);`,
  },
  {
    name: 'a borrowed pop mutates a local function parameter',
    source: `function mutate(value) { Array.prototype.pop.call(value); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a bound pop mutates a local function parameter',
    source: `function mutate(value) { Array.prototype.pop.bind(value)(); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'a reflected pop mutates a local function parameter',
    source: `function mutate(value) { Reflect.apply(Array.prototype.pop, value, []); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
  },
];
const safeMapperCollectionAndEffectCases = [
  {
    name: 'ordinary Array.map data callback',
    source: `const values = [0].map(value => value + 1); values[0](configuredSource);`,
  },
  {
    name: 'ordinary Array.from data callback',
    source: `const values = Array.from([0], value => value + 1); values[0](configuredSource);`,
  },
  {
    name: 'known-safe mapper callable result',
    source: `const values = [0].map(() => Array.of); values[0](configuredSource);`,
  },
  {
    name: 'an unsafe overflow value does not taint a known-safe earlier array position',
    source: `const values = [JSON.parse, ${Array.from({ length: 63 }, (_, index) => index).join(',')}, eval];
      values[0]('{}');`,
  },
  {
    name: 'a known-safe ordinary Array boundary value remains precise',
    source: `const values = new Array(${Array.from({ length: 64 }, (_, index) => index).join(',')}, JSON.parse);
      values[64]('{}');`,
  },
  {
    name: 'a known-safe mapper result remains precise at the tracked position boundary',
    source: `const input = [${Array.from({ length: 65 }, (_, index) => index).join(',')}];
      const values = input.map(() => JSON.parse);
      values[64]('{}');`,
  },
  {
    name: 'Map and Set safe data iteration',
    source: `const mapValues = [...new Map([['x', 'value']])];
      const setValues = Array.from(new Set(['value']));
      consume(mapValues, setValues);`,
  },
  {
    name: 'callable collection data is not itself execution',
    source: `consume([...new Set([eval, _.template])], Array.from(new Map([['x', eval]])));`,
  },
  {
    name: 'a side-effect-only mutation preceding a known-safe Reflect target',
    source: `function mutate(value) { value.pop(); }
      const prefix = [null]; mutate(prefix); Reflect.apply(...prefix, JSON.parse, null, ['{}']);`,
  },
  {
    name: 'an unrelated local mutation does not taint another carrier',
    source: `function mutate(value) { value.pop(); }
      const changed = [null]; const prefix = [];
      mutate(changed); Reflect.apply(...prefix, JSON.parse, null, ['{}']);`,
  },
  {
    name: 'a defaulted carrier mutation preserves a known-safe Reflect target',
    source: `function mutate(value = prefix) { value.pop(); }
      const prefix = [null]; mutate();
      Reflect.apply(...prefix, JSON.parse, null, ['{}']);`,
  },
  {
    name: 'a function-valued safe default does not taint a known-safe target',
    source: `function mutate(value, effect = JSON.parse) { value.pop(); effect('{}'); }
      const prefix = [null]; mutate(prefix);
      Reflect.apply(...prefix, JSON.parse, null, ['{}']);`,
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

function invokeGuardWithTrackedSources(root, sources, nodeArguments = []) {
  for (const { relativePath, source } of sources) {
    const absolutePath = path.join(root, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, source);
  }
  execFileSync('git', ['add', '.'], { cwd: root });
  return spawnSync(process.execPath, [...nodeArguments, 'scripts/check-unsafe-expressions.js'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5000,
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

test('variable-length spread prefixes retain every executable positional alternative', () => {
  for (const spreadCase of variableLengthSpreadCases) {
    const findings = scanSource(spreadCase.source, 'packages/example/src/variable-spread.ts');
    assert.ok(
      findings.some(finding => finding.kind === spreadCase.kind),
      `${spreadCase.name} should produce a ${spreadCase.kind} finding: ${JSON.stringify(findings)}`
    );
  }
});

test('mutable spread prefixes fail closed after length-changing writes and mutators', () => {
  for (const mutationCase of mutableSpreadPrefixCases) {
    const findings = scanSource(mutationCase.source, 'packages/example/src/mutable-spread.ts');
    assert.ok(
      findings.some(
        finding =>
          finding.kind === 'direct-eval' ||
          finding.kind === 'lodash-template' ||
          (finding.kind === 'analysis-limit' && finding.reason === 'positional-layout-limit')
      ),
      `${mutationCase.name} should fail closed: ${JSON.stringify(findings)}`
    );
  }
});

test('positional mutators propagate inserted unsafe values through every carrier path', () => {
  for (const insertionCase of positionalInsertionCases) {
    const firstFindings = scanSource(insertionCase.source, 'packages/example/src/positional-insertion.ts');
    const secondFindings = scanSource(insertionCase.source, 'packages/example/src/positional-insertion.ts');
    assert.deepEqual(firstFindings, secondFindings, `${insertionCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(
        finding =>
          finding.kind === 'direct-eval' ||
          finding.kind === 'lodash-template' ||
          (finding.kind === 'analysis-limit' && finding.reason === 'positional-layout-limit')
      ),
      `${insertionCase.name} should propagate the inserted callable or fail closed: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 3, `${insertionCase.name} diagnostics should stay bounded`);
  }
});

test('reviewed prototype, descriptor, accessor, Object.assign, and legacy paths fail closed', () => {
  for (const reviewCase of reviewedReflectiveMutationCases) {
    const firstFindings = scanSource(reviewCase.source, 'packages/example/src/reflective-mutation.ts');
    const secondFindings = scanSource(reviewCase.source, 'packages/example/src/reflective-mutation.ts');
    assert.deepEqual(firstFindings, secondFindings, `${reviewCase.name} should be deterministic`);
    assert.equal(
      firstFindings.filter(finding => finding.kind === 'analysis-limit' && finding.reason === 'positional-layout-limit')
        .length,
      1,
      `${reviewCase.name} should produce one bounded layout finding: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${reviewCase.name} diagnostics should stay bounded`);
  }
});

test('inherited descriptor fields are resolved recursively and fail closed', () => {
  for (const descriptorCase of inheritedDescriptorProvenanceCases) {
    const findings = scanSource(descriptorCase.source, 'packages/example/src/inherited-descriptor.ts');
    assert.deepEqual(
      findings.map(finding => [finding.kind, finding.reason]),
      [['analysis-limit', 'positional-layout-limit']],
      `${descriptorCase.name} should produce one bounded fail-closed finding`
    );
  }
});

test('observed accessor side effects invalidate only their possible carrier receivers', () => {
  for (const accessorCase of observedAccessorSideEffectCases) {
    const findings = scanSource(accessorCase.source, 'packages/example/src/observed-accessor.ts');
    assert.equal(
      findings.filter(finding => finding.kind === 'analysis-limit' && finding.reason === 'positional-layout-limit')
        .length,
      1,
      `${accessorCase.name} should produce one bounded layout finding: ${JSON.stringify(findings)}`
    );
    assert.ok(
      findings.every(
        finding =>
          finding.kind === 'direct-eval' ||
          (finding.kind === 'analysis-limit' && finding.reason === 'positional-layout-limit')
      ),
      `${accessorCase.name} reported an unrelated finding: ${JSON.stringify(findings)}`
    );
    assert.ok(findings.length <= 2, `${accessorCase.name} diagnostics should stay bounded`);
  }
});

test('known-safe reflective carrier operations remain clean', () => {
  for (const safeCase of safeReflectiveCarrierCases) {
    assert.deepEqual(
      scanSource(safeCase.source, 'packages/example/src/safe-reflective-carrier.ts'),
      [],
      `${safeCase.name} should not produce a finding`
    );
  }
});

test('plural descriptor extraction preserves known-safe builtin targets', () => {
  for (const safeCase of safePluralDescriptorTargetCases) {
    assert.deepEqual(
      scanSource(safeCase.source, 'packages/example/src/safe-plural-descriptor.ts'),
      [],
      `${safeCase.name} should not produce a finding`
    );
  }
});

test('plural descriptor targets retain unsafe and unknown alternatives', () => {
  for (const unsafeCase of unsafePluralDescriptorTargetCases) {
    const findings = scanSource(unsafeCase.source, 'packages/example/src/unsafe-plural-descriptor.ts');
    assert.ok(
      findings.some(
        finding => finding.kind === unsafeCase.kind && (!unsafeCase.reason || finding.reason === unsafeCase.reason)
      ),
      `${unsafeCase.name} should preserve unsafe provenance: ${JSON.stringify(findings)}`
    );
  }
});

test('accessor-returned callable provenance survives descriptor definition and invocation composition', () => {
  for (const accessorCase of accessorReturnedCallableCases) {
    const findings = scanSource(accessorCase.source, 'packages/example/src/accessor-callable.ts');
    assert.ok(
      findings.some(finding => finding.kind === 'direct-eval'),
      `${accessorCase.name} should preserve builtin eval provenance: ${JSON.stringify(findings)}`
    );
  }
});

test('unknown plural descriptor callables fail closed without tainting ordinary unknown calls', () => {
  for (const descriptorCase of unknownPluralDescriptorInvocationCases) {
    const firstFindings = scanSource(descriptorCase.source, 'packages/example/src/unknown-descriptor-callable.ts');
    const secondFindings = scanSource(descriptorCase.source, 'packages/example/src/unknown-descriptor-callable.ts');
    assert.deepEqual(firstFindings, secondFindings, `${descriptorCase.name} should be deterministic`);
    assert.deepEqual(
      firstFindings.map(finding => finding.kind),
      ['analysis-limit'],
      `${descriptorCase.name} should produce one bounded fail-closed finding`
    );
    assert.ok(
      ['unknown-reflect-target', 'unknown-reflective-callable'].includes(firstFindings[0].reason),
      `${descriptorCase.name} reported an unexpected reason: ${JSON.stringify(firstFindings)}`
    );
  }
});

test('unknown singular reflective callables fail closed across invocation compositions', () => {
  for (const lookupCase of unknownSingularReflectiveInvocationCases) {
    const firstFindings = scanSource(lookupCase.source, 'packages/example/src/unknown-singular-reflection.ts');
    const secondFindings = scanSource(lookupCase.source, 'packages/example/src/unknown-singular-reflection.ts');
    assert.deepEqual(firstFindings, secondFindings, `${lookupCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(
        finding =>
          finding.kind === 'analysis-limit' &&
          ['unknown-reflect-target', 'unknown-reflective-callable'].includes(finding.reason)
      ),
      `${lookupCase.name} should produce a bounded fail-closed finding: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${lookupCase.name} diagnostics should stay bounded`);
  }
});

test('returned reflective targets retain executable provenance through direct invocation', () => {
  for (const targetCase of returnedReflectiveTargetCases) {
    const firstFindings = scanSource(targetCase.source, 'packages/example/src/returned-reflective-target.ts');
    const secondFindings = scanSource(targetCase.source, 'packages/example/src/returned-reflective-target.ts');
    assert.deepEqual(firstFindings, secondFindings, `${targetCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(
        finding => finding.kind === targetCase.kind && (!targetCase.reason || finding.reason === targetCase.reason)
      ),
      `${targetCase.name} should preserve reflective provenance: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${targetCase.name} diagnostics should stay bounded`);
  }
});

test('the reviewed local-alias bypasses execute only an isolated marker payload', () => {
  const markerKey = '__a12_returned_local_alias_marker__';
  const serializedMarkerKey = JSON.stringify(markerKey);
  const source = `
    globalThis[${serializedMarkerKey}] = [];
    function mark(name) {
      return \`globalThis[${serializedMarkerKey}].push(\${JSON.stringify(name)})\`;
    }
    function id(target) { const alias = target; return alias; }
    id(Reflect.apply)(eval, globalThis, [mark('parameter')]);
    const outer = Reflect.apply;
    function fromOuter() { const alias = outer; return alias; }
    fromOuter()(eval, globalThis, [mark('outer')]);
    function fromDefault(target = Reflect.apply) { const alias = target; return alias; }
    fromDefault()(eval, globalThis, [mark('default')]);
    function closeOver(target) { const alias = target; return () => alias; }
    closeOver(Reflect.apply)()(eval, globalThis, [mark('closure')]);
    const compile = require('lodash/template');
    id(compile)(\`<% globalThis[${serializedMarkerKey}].push('lodash') %>\`)();
    function carry(target) {
      const local = target;
      const carrier = { target: local };
      const alias = carrier;
      return alias;
    }
    carry(Reflect.construct).target(
      compile,
      [\`<% globalThis[${serializedMarkerKey}].push('construct') %>\`]
    )();
    process.stdout.write(JSON.stringify(globalThis[${serializedMarkerKey}]));
    delete globalThis[${serializedMarkerKey}];
  `;
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['parameter', 'outer', 'default', 'closure', 'lodash', 'construct']);
});

test('local return aliases retain unsafe parameter, closure, receiver, carrier, and invocation provenance', () => {
  for (const aliasCase of returnedLocalAliasCases) {
    const firstFindings = scanSource(aliasCase.source, 'packages/example/src/returned-local-alias.ts');
    const secondFindings = scanSource(aliasCase.source, 'packages/example/src/returned-local-alias.ts');
    assert.deepEqual(firstFindings, secondFindings, `${aliasCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(finding => finding.kind === aliasCase.kind),
      `${aliasCase.name} should retain unsafe callable provenance: ${JSON.stringify(firstFindings)}`
    );
    if (aliasCase.additionalKind) {
      assert.ok(
        firstFindings.some(finding => finding.kind === aliasCase.additionalKind && finding.reason === aliasCase.reason),
        `${aliasCase.name} should fail closed for its unknown alternative: ${JSON.stringify(firstFindings)}`
      );
    }
    assert.ok(firstFindings.length <= 2, `${aliasCase.name} diagnostics should stay bounded`);
  }
});

test('known-safe overrides and data-only local return aliases remain clean', () => {
  for (const safeCase of safeReturnedLocalAliasCases) {
    assert.deepEqual(
      scanSource(safeCase.source, 'packages/example/src/safe-returned-local-alias.ts'),
      [],
      `${safeCase.name} should not produce a finding`
    );
  }
});

test('invocation-local carrier mutations retain parameter and receiver callable provenance', () => {
  const invokeEval = '(eval, globalThis, [configuredSource]);';
  const mutationCases = [
    {
      name: 'object property write from a parameter',
      kind: 'direct-eval',
      source: `function carry(target) { const carrier = {}; carrier.run = target; return carrier.run; }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'array destructured parameter',
      kind: 'direct-eval',
      source: `function carry([target]) { const carrier = {}; carrier.run = target; return carrier.run; }
        carry([Reflect.apply])${invokeEval}`,
    },
    {
      name: 'object destructured parameter',
      kind: 'direct-eval',
      source: `function carry({ target }) { const carrier = {}; carrier.run = target; return carrier.run; }
        carry({ target: Reflect.apply })${invokeEval}`,
    },
    {
      name: 'array assignment destructuring',
      kind: 'direct-eval',
      source: `function carry(target) {
          const carrier = {}; let run; [run] = [target]; carrier.run = run; return carrier.run;
        }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'object assignment destructuring',
      kind: 'direct-eval',
      source: `function carry(target) {
          const carrier = {}; let run; ({ run } = { run: target }); carrier.run = run; return carrier.run;
        }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'for-of assignment',
      kind: 'direct-eval',
      source: `function carry(target) {
          const carrier = {}; for (const run of [target]) carrier.run = run; return carrier.run;
        }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'manual iterator assignment',
      kind: 'direct-eval',
      source: `function carry(target) {
          const carrier = {}; const iterator = [target][Symbol.iterator]();
          carrier.run = iterator.next().value; return carrier.run;
        }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'array map identity carrier',
      kind: 'direct-eval',
      source: `function carry(target) { const carrier = [target].map(value => value); return carrier[0]; }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'Map identity carrier',
      kind: 'direct-eval',
      source: `function carry(target) {
          const carrier = new Map(); carrier.set('run', target); return carrier.get('run');
        }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'array index write',
      kind: 'direct-eval',
      source: `function carry(target) { const carrier = []; carrier[0] = target; return carrier[0]; }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'Reflect.set receiver write',
      kind: 'direct-eval',
      source: `function carry(target) {
          const base = {}; const receiver = {};
          Reflect.set(base, 'run', target, receiver); return receiver.run;
        }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'Object.assign write',
      kind: 'direct-eval',
      source: `function carry(target) {
          const carrier = {}; Object.assign(carrier, { run: target }); return carrier.run;
        }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'Object.defineProperty write',
      kind: 'direct-eval',
      source: `function carry(target) {
          const carrier = {}; Object.defineProperty(carrier, 'run', { value: target }); return carrier.run;
        }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'Object.defineProperties write',
      kind: 'direct-eval',
      source: `function carry(target) {
          const carrier = {}; Object.defineProperties(carrier, { run: { value: target } }); return carrier.run;
        }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'Reflect.defineProperty write',
      kind: 'direct-eval',
      source: `function carry(target) {
          const carrier = {}; Reflect.defineProperty(carrier, 'run', { value: target }); return carrier.run;
        }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'descriptor getter closure',
      kind: 'direct-eval',
      source: `function carry(target) {
          const carrier = {}; Object.defineProperty(carrier, 'run', { get() { return target; } });
          return carrier.run;
        }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'legacy __defineGetter__ closure',
      kind: 'direct-eval',
      source: `function carry(target) {
          const carrier = {}; carrier.__defineGetter__('run', () => target); return carrier.run;
        }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'inherited iterator replacement',
      kind: 'direct-eval',
      source: `function carry(target) {
          const carrier = [];
          Object.setPrototypeOf(carrier, { [Symbol.iterator]: function* replacement() { yield target; } });
          return carrier[Symbol.iterator]().next().value;
        }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'conditional carrier mutation',
      kind: 'direct-eval',
      source: `function carry(target, flag) {
          const first = {}; const second = {}; (flag ? first : second).run = target;
          return flag ? first.run : second.run;
        }
        carry(Reflect.apply, flag)${invokeEval}`,
    },
    {
      name: 'returned closure over a mutated carrier',
      kind: 'direct-eval',
      source: `function carry(target) {
          const carrier = {}; carrier.run = target; return () => carrier.run;
        }
        carry(Reflect.apply)()${invokeEval}`,
    },
    {
      name: 'receiver mutation through call',
      kind: 'direct-eval',
      source: `function carry(target) { this.run = target; return this.run; }
        carry.call({}, Reflect.apply)${invokeEval}`,
    },
    {
      name: 'Lodash callable through an object carrier',
      kind: 'lodash-template',
      source: `import lodash from 'lodash';
        function carry(target) { const carrier = {}; carrier.run = target; return carrier.run; }
        carry(Reflect.apply)(lodash.template, globalThis, [configuredSource]);`,
    },
    {
      name: 'Reflect.construct through an array carrier',
      kind: 'lodash-template',
      source: `import compile from 'lodash/template';
        function carry(target) { const carrier = []; carrier.push(target); return carrier[0]; }
        carry(Reflect.construct)(compile, [configuredSource]);`,
    },
    {
      name: 'unknown carrier mutator',
      kind: 'analysis-limit',
      reason: 'unknown-reflective-callable',
      source: `function carry(target) {
          const carrier = []; mutate(carrier, target); return carrier[0];
        }
        carry(Reflect.apply)${invokeEval}`,
    },
  ];
  const mutatorArguments = { push: 'target', splice: '0, 0, target', unshift: 'target' };
  const mutatorInvocations = {
    direct: (method, args) => `carrier.${method}(${args})`,
    borrowed: (method, args) => `Array.prototype.${method}.call(carrier, ${args})`,
    bound: (method, args) => `Array.prototype.${method}.bind(carrier)(${args})`,
    reflected: (method, args) => `Reflect.apply(Array.prototype.${method}, carrier, [${args}])`,
  };
  for (const [method, args] of Object.entries(mutatorArguments)) {
    for (const [form, invocation] of Object.entries(mutatorInvocations)) {
      mutationCases.push({
        name: `${form} ${method} mutation`,
        kind: 'direct-eval',
        source: `function carry(target) {
            const carrier = []; ${invocation(method, args)}; return carrier[0];
          }
          carry(Reflect.apply)${invokeEval}`,
      });
    }
  }
  mutationCases.push(
    {
      name: 'pop return value',
      kind: 'direct-eval',
      source: `function carry(target) { const carrier = [target]; return carrier.pop(); }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'shift return value',
      kind: 'direct-eval',
      source: `function carry(target) { const carrier = [target]; return carrier.shift(); }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'copyWithin mutation',
      kind: 'direct-eval',
      source: `function carry(target) {
          const carrier = [target, null]; carrier.copyWithin(1, 0, 1); return carrier[1];
        }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'fill mutation',
      kind: 'direct-eval',
      source: `function carry(target) { const carrier = [null]; carrier.fill(target); return carrier[0]; }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'reverse mutation',
      kind: 'direct-eval',
      source: `function carry(target) {
          const carrier = [null, target]; carrier.reverse(); return carrier[0];
        }
        carry(Reflect.apply)${invokeEval}`,
    },
    {
      name: 'sort mutation',
      kind: 'direct-eval',
      source: `function carry(target) { const carrier = [target]; carrier.sort(); return carrier[0]; }
        carry(Reflect.apply)${invokeEval}`,
    }
  );

  for (const mutationCase of mutationCases) {
    const relativePath = 'packages/example/src/invocation-local-carrier.ts';
    const firstFindings = scanSource(mutationCase.source, relativePath);
    const secondFindings = scanSource(mutationCase.source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${mutationCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(
        finding =>
          finding.kind === mutationCase.kind && (!mutationCase.reason || finding.reason === mutationCase.reason)
      ),
      `${mutationCase.name} should retain or fail closed on callable provenance: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${mutationCase.name} diagnostics should stay bounded`);
  }
});

test('manual iterator next results retain bounded yielded callable provenance', () => {
  const iteratorCases = [
    {
      name: 'array eval iterator',
      kind: 'direct-eval',
      source: `const iterator = [eval][Symbol.iterator](); iterator.next().value(configuredSource);`,
    },
    {
      name: 'array Lodash iterator',
      kind: 'lodash-template',
      source: `import lodash from 'lodash';
        const iterator = [lodash.template][Symbol.iterator](); iterator.next().value(configuredSource);`,
    },
    {
      name: 'generator eval iterator',
      kind: 'direct-eval',
      source: `function* values() { yield eval; } values().next().value(configuredSource);`,
    },
    {
      name: 'generator Lodash iterator',
      kind: 'lodash-template',
      source: `import lodash from 'lodash';
        function* values() { yield lodash.template; } values().next().value(configuredSource);`,
    },
    {
      name: 'array map identity iterator',
      kind: 'direct-eval',
      source: `[eval].map(value => value)[Symbol.iterator]().next().value(configuredSource);`,
    },
    {
      name: 'Object.values iterator',
      kind: 'direct-eval',
      source: `Object.values({ run: eval })[Symbol.iterator]().next().value(configuredSource);`,
    },
    {
      name: 'Object.entries iterator',
      kind: 'direct-eval',
      source: `Object.entries({ run: eval })[Symbol.iterator]().next().value[1](configuredSource);`,
    },
    {
      name: 'Map values iterator',
      kind: 'direct-eval',
      source: `new Map([['run', eval]]).values().next().value(configuredSource);`,
    },
    {
      name: 'Map entries iterator',
      kind: 'direct-eval',
      source: `new Map([['run', eval]]).entries().next().value[1](configuredSource);`,
    },
    {
      name: 'Set values iterator',
      kind: 'direct-eval',
      source: `new Set([eval]).values().next().value(configuredSource);`,
    },
    {
      name: 'returned iterator',
      kind: 'direct-eval',
      source: `function values(target) { return [target][Symbol.iterator](); }
        values(eval).next().value(configuredSource);`,
    },
    {
      name: 'returned Set Lodash iterator',
      kind: 'lodash-template',
      source: `import lodash from 'lodash';
        function values(target) { return new Set([target]).values(); }
        values(lodash.template).next().value(configuredSource);`,
    },
    {
      name: 'Reflect.construct from Object.values',
      kind: 'lodash-template',
      source: `import compile from 'lodash/template';
        Object.values({ run: Reflect.construct })[Symbol.iterator]().next().value(
          compile,
          [configuredSource]
        );`,
    },
    {
      name: 'unknown returned iterator',
      kind: 'analysis-limit',
      reason: 'unknown-reflective-callable',
      source: `loadIterator().next().value(configuredSource);`,
    },
    {
      name: 'unknown Object.entries iterator',
      kind: 'analysis-limit',
      reason: 'unknown-reflective-callable',
      source: `Object.entries(loadObject())[Symbol.iterator]().next().value[1](configuredSource);`,
    },
  ];

  for (const iteratorCase of iteratorCases) {
    const relativePath = 'packages/example/src/manual-iterator-next.ts';
    const firstFindings = scanSource(iteratorCase.source, relativePath);
    const secondFindings = scanSource(iteratorCase.source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${iteratorCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(
        finding =>
          finding.kind === iteratorCase.kind && (!iteratorCase.reason || finding.reason === iteratorCase.reason)
      ),
      `${iteratorCase.name} should retain or fail closed on yielded provenance: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${iteratorCase.name} diagnostics should stay bounded`);
  }
});

test('known-safe invocation-local carriers and manual iterators remain clean', () => {
  const safeCases = [
    `function carry(target) { const carrier = {}; carrier.run = target; return carrier.run; }
      carry(Array.of)(eval, globalThis, [configuredSource]);`,
    `function carry(target = Reflect.apply) {
        const carrier = {}; carrier.run = target; return carrier.run;
      }
      carry(Array.of)(eval, globalThis, [configuredSource]);`,
    `function carry(target, flag) {
        const first = {}; const second = {}; (flag ? first : second).run = target;
        return flag ? first.run : second.run;
      }
      carry(Array.of, flag)(eval, globalThis, [configuredSource]);`,
    `function carry(target) {
        const carrier = {}; carrier.run = target; return () => carrier.run;
      }
      carry(Array.of)()(configuredSource);`,
    `function carry(target) { this.run = target; return this.run; }
      carry.call({}, Array.of)(configuredSource);`,
    `const collect = (...values) => values; collect(...[eval, _.template]);`,
    `const iterator = Array.of(value => value)[Symbol.iterator]();
      iterator.next().value(configuredSource);`,
    `function* values() { yield Array.of; } values().next().value(configuredSource);`,
    `[Array.of].map(value => value)[Symbol.iterator]().next().value(configuredSource);`,
    `Object.values({ run: Array.of })[Symbol.iterator]().next().value(configuredSource);`,
    `Object.entries({ run: Array.of })[Symbol.iterator]().next().value[1](configuredSource);`,
    `new Map([['run', Array.of]]).values().next().value(configuredSource);`,
    `new Set([Array.of]).values().next().value(configuredSource);`,
    `function values(target) { return [target][Symbol.iterator](); }
      values(Array.of).next().value(configuredSource);`,
    `function carry(target) {
        const carrier = new Map(); carrier.set('run', target); return carrier.get('run');
      }
      consume(carry(Reflect.apply), eval, _.template);`,
  ];

  for (const [index, source] of safeCases.entries()) {
    assert.deepEqual(
      scanSource(source, `packages/example/src/safe-invocation-carrier-${index}.ts`),
      [],
      `safe invocation-local carrier control ${index} should not produce a finding`
    );
  }
});

test('large manual iterator value carriers remain deterministic and bounded', () => {
  const valueCount = 1500;
  const values = Array.from({ length: valueCount }, (_, index) =>
    index === valueCount - 1 ? 'eval' : `() => ${index}`
  ).join(',');
  const source = `const values = [${values}];
    const iterator = new Set(values).values();
    iterator.next().value(configuredSource);`;
  const relativePath = 'packages/example/src/bounded-manual-iterator.ts';
  const startedAt = performance.now();
  const firstFindings = scanSource(source, relativePath);
  const secondFindings = scanSource(source, relativePath);
  const elapsedMilliseconds = performance.now() - startedAt;

  assert.deepEqual(firstFindings, secondFindings);
  assert.ok(
    firstFindings.some(
      finding =>
        finding.kind === 'direct-eval' ||
        (finding.kind === 'analysis-limit' && finding.reason === 'unknown-reflective-callable')
    ),
    `the bounded iterator should retain or fail closed on the overflow eval value: ${JSON.stringify(firstFindings)}`
  );
  assert.ok(firstFindings.length <= 2, 'large iterator diagnostics should stay bounded');
  assert.ok(elapsedMilliseconds < 5000, `two large iterator scans took ${Math.round(elapsedMilliseconds)}ms`);
});

test('truncated collection positions expose one deterministic fail-closed indexed sentinel', () => {
  for (const valueCount of [65, 5000]) {
    const values = Array.from({ length: valueCount }, (_, index) =>
      index === valueCount - 1 ? 'eval' : String(index)
    ).join(',');
    const source = `const values = Array.from(new Set([${values}]));
      values[64](configuredSource);`;
    const relativePath = `packages/example/src/collection-position-${valueCount}.ts`;
    const startedAt = performance.now();
    const firstFindings = scanSource(source, relativePath);
    const secondFindings = scanSource(source, relativePath);
    const elapsedMilliseconds = performance.now() - startedAt;

    assert.deepEqual(firstFindings, secondFindings, `${valueCount} positions should be deterministic`);
    assert.ok(
      firstFindings.some(
        finding =>
          finding.kind === 'direct-eval' ||
          (finding.kind === 'analysis-limit' && finding.reason === 'unknown-reflective-callable')
      ),
      `${valueCount} positions should retain or fail closed on overflow: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${valueCount} positions should keep diagnostics bounded`);
    assert.ok(elapsedMilliseconds < 5000, `two ${valueCount}-position scans took ${Math.round(elapsedMilliseconds)}ms`);
  }

  for (const entryCount of [65, 5000]) {
    const entries = Array.from(
      { length: entryCount },
      (_, index) => `[${index}, ${index === entryCount - 1 ? 'eval' : index}]`
    ).join(',');
    const source = `const entries = Array.from(new Map([${entries}]));
      entries[64][1](configuredSource);`;
    const relativePath = `packages/example/src/map-entry-position-${entryCount}.ts`;
    const startedAt = performance.now();
    const firstFindings = scanSource(source, relativePath);
    const secondFindings = scanSource(source, relativePath);
    const elapsedMilliseconds = performance.now() - startedAt;

    assert.deepEqual(firstFindings, secondFindings, `${entryCount} Map entries should be deterministic`);
    assert.ok(
      firstFindings.some(
        finding =>
          finding.kind === 'direct-eval' ||
          (finding.kind === 'analysis-limit' && finding.reason === 'unknown-reflective-callable')
      ),
      `${entryCount} Map entries should retain or fail closed on overflow: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${entryCount} Map entries should keep diagnostics bounded`);
    assert.ok(
      elapsedMilliseconds < 5000,
      `two ${entryCount}-entry Map scans took ${Math.round(elapsedMilliseconds)}ms`
    );
  }

  const safeValues = Array.from({ length: 5000 }, (_, index) => String(index)).join(',');
  assert.deepEqual(
    scanSource(`consume(Array.from(new Set([${safeValues}])));`, 'packages/example/src/safe-overflow-data.ts'),
    [],
    'large safe collection data should remain clean when it is not executed'
  );
  const safeEntries = Array.from({ length: 5000 }, (_, index) => `[${index}, ${index}]`).join(',');
  assert.deepEqual(
    scanSource(`consume(Array.from(new Map([${safeEntries}])));`, 'packages/example/src/safe-overflow-map.ts'),
    [],
    'large safe Map entries should remain clean when they are not executed'
  );
});

test('Array.map and Array.from mapper invocations retain bounded callable provenance and effects', () => {
  for (const mapperCase of mapperReviewCases) {
    const relativePath = 'packages/example/src/mapper-provenance.ts';
    const firstFindings = scanSource(mapperCase.source, relativePath);
    const secondFindings = scanSource(mapperCase.source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${mapperCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(
        finding => finding.kind === mapperCase.kind && (!mapperCase.reason || finding.reason === mapperCase.reason)
      ),
      `${mapperCase.name} should preserve or fail closed on mapper provenance: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${mapperCase.name} diagnostics should stay bounded`);
  }
});

test('default Map and Set iteration retains bounded stored callable provenance', () => {
  for (const collectionCase of collectionIterationReviewCases) {
    const relativePath = 'packages/example/src/collection-iteration.ts';
    const firstFindings = scanSource(collectionCase.source, relativePath);
    const secondFindings = scanSource(collectionCase.source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${collectionCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(
        finding =>
          finding.kind === collectionCase.kind && (!collectionCase.reason || finding.reason === collectionCase.reason)
      ),
      `${collectionCase.name} should preserve or fail closed on collection provenance: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${collectionCase.name} diagnostics should stay bounded`);
  }
});

test('side-effect-only local functions invalidate eval and Lodash invocation carriers', () => {
  for (const effectCase of [...sideEffectFunctionReviewCases, ...sideEffectPositionalMutationCases]) {
    const relativePath = 'packages/example/src/local-function-effect.ts';
    const firstFindings = scanSource(effectCase.source, relativePath);
    const secondFindings = scanSource(effectCase.source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${effectCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(
        finding =>
          finding.kind === 'direct-eval' ||
          finding.kind === 'lodash-template' ||
          (finding.kind === 'analysis-limit' &&
            [
              'invocation-effect-limit',
              'positional-layout-limit',
              'unknown-reflect-target',
              'unknown-reflective-callable',
            ].includes(finding.reason))
      ),
      `${effectCase.name} should preserve or fail closed on the carrier effect: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${effectCase.name} diagnostics should stay bounded`);
  }
});

test('borrowed, bound, and reflected local mutators preserve every exact positional effect', () => {
  const mutationCases = {
    push: {
      arguments: 'eval, globalThis, [configuredSource]',
      prefix: '[]',
      invoke: 'Reflect.apply(...prefix)',
    },
    unshift: {
      arguments: 'eval',
      prefix: '[globalThis, [configuredSource]]',
      invoke: 'Reflect.apply(...prefix)',
    },
    splice: {
      arguments: '0, 0, eval',
      prefix: '[globalThis, [configuredSource]]',
      invoke: 'Reflect.apply(...prefix)',
    },
    pop: {
      arguments: '',
      prefix: '[null]',
      invoke: 'Reflect.apply(...prefix, eval, globalThis, [configuredSource])',
    },
    shift: {
      arguments: '',
      prefix: '[null]',
      invoke: 'Reflect.apply(...prefix, eval, globalThis, [configuredSource])',
    },
    copyWithin: {
      arguments: '0, 1, 2',
      prefix: '[null, eval, globalThis, [configuredSource]]',
      invoke: 'Reflect.apply(...prefix)',
    },
    fill: {
      arguments: 'eval, 0, 1',
      prefix: '[null, globalThis, [configuredSource]]',
      invoke: 'Reflect.apply(...prefix)',
    },
    reverse: {
      arguments: '',
      prefix: '[[configuredSource], globalThis, eval]',
      invoke: 'Reflect.apply(...prefix)',
    },
  };
  const forms = {
    borrowed: (method, argumentsSource) =>
      `Array.prototype.${method}.call(value${argumentsSource ? `, ${argumentsSource}` : ''})`,
    bound: (method, argumentsSource) => `Array.prototype.${method}.bind(value)(${argumentsSource})`,
    reflected: (method, argumentsSource) => `Reflect.apply(Array.prototype.${method}, value, [${argumentsSource}])`,
  };

  for (const [method, mutationCase] of Object.entries(mutationCases)) {
    for (const [form, invocation] of Object.entries(forms)) {
      const source = `function mutate(value) { ${invocation(method, mutationCase.arguments)}; }
        const prefix = ${mutationCase.prefix}; mutate(prefix); ${mutationCase.invoke};`;
      const relativePath = `packages/example/src/${form}-${method}-effect.ts`;
      const firstFindings = scanSource(source, relativePath);
      const secondFindings = scanSource(source, relativePath);
      assert.deepEqual(firstFindings, secondFindings, `${form} ${method} should be deterministic`);
      assert.ok(
        firstFindings.some(
          finding =>
            finding.kind === 'direct-eval' ||
            finding.kind === 'lodash-template' ||
            (finding.kind === 'analysis-limit' && finding.reason === 'positional-layout-limit')
        ),
        `${form} ${method} should propagate its exact effect or fail closed: ${JSON.stringify(firstFindings)}`
      );
      assert.ok(firstFindings.length <= 2, `${form} ${method} diagnostics should stay bounded`);
    }
  }
});

test('known-safe mapper, collection, and local-effect controls remain clean', () => {
  for (const safeCase of safeMapperCollectionAndEffectCases) {
    assert.deepEqual(
      scanSource(safeCase.source, 'packages/example/src/safe-mapper-collection-effect.ts'),
      [],
      `${safeCase.name} should not produce a finding`
    );
  }
});

test('mapper, collection, and local-effect reproductions execute only isolated marker payloads', () => {
  const markerKey = '__a12_mapper_collection_effect_marker__';
  const serializedMarkerKey = JSON.stringify(markerKey);
  const source = `
    globalThis[${serializedMarkerKey}] = [];
    const mark = name => \`globalThis[${serializedMarkerKey}].push(\${JSON.stringify(name)})\`;
    const mapped = [0].map(function () { return this.execute; }, { execute: eval });
    mapped[0](mark('map'));
    const mutableInput = [0, 1];
    const mutableMapped = mutableInput.map(function (value, index, array) {
      if (index === 0) array[1] = eval;
      return array[index];
    });
    mutableMapped[1](mark('map-later-element'));
    const borrowedInput = [0, 1];
    const borrowedMapped = Array.prototype.map.call(borrowedInput, function (value, index, array) {
      if (index === 0) array[1] = eval;
      return array[index];
    });
    borrowedMapped[1](mark('map-borrowed-later-element'));
    const boundInput = [0, 1];
    const boundMapped = Array.prototype.map.bind(boundInput, function (value, index, array) {
      if (index === 0) array[1] = eval;
      return array[index];
    })();
    boundMapped[1](mark('map-bound-later-element'));
    const boundaryInput = Array.from({ length: 65 }, (_, index) => index);
    const boundaryMapped = boundaryInput.map(function (value, index, array) {
      if (index === 0) array[64] = eval;
      return array[index];
    });
    boundaryMapped[64](mark('map-boundary-later-element'));
    const from = Array.from([0], () => require('lodash/template'));
    from[0](\`<% globalThis[${serializedMarkerKey}].push('from') %>\`)();
    new Array(eval)[0](mark('array-new-constructor'));
    Array.call(null, eval)[0](mark('array-borrowed-constructor'));
    Array.bind(null, eval)()[0](mark('array-bound-constructor'));
    Reflect.apply(Array, null, [eval])[0](mark('array-reflected-constructor'));
    Array(require('lodash/template'))[0](
      \`<% globalThis[${serializedMarkerKey}].push('array-constructor') %>\`
    )();
    for (const [, execute] of new Map([['x', eval]])) execute(mark('map-iteration'));
    const mutableMap = new Map();
    mutableMap.set('run', eval);
    for (const execute of mutableMap.values()) execute(mark('map-mutation'));
    const keyMap = new Map();
    keyMap.set(eval, 'value');
    [...keyMap.keys()][0](mark('map-key-spread'));
    const nextMap = new Map();
    nextMap.set('run', eval);
    nextMap.values().next().value(mark('map-manual-next'));
    const setValues = [...new Set([require('lodash/template')])];
    setValues[0](\`<% globalThis[${serializedMarkerKey}].push('set-spread') %>\`)();
    const mutableSet = new Set();
    mutableSet.add(require('lodash/template'));
    mutableSet.entries().next().value[1](
      \`<% globalThis[${serializedMarkerKey}].push('set-mutation') %>\`
    )();
    const destructuredSet = new Set();
    destructuredSet.add(eval);
    const [setRun] = destructuredSet;
    setRun(mark('set-destructure'));
    const loadValues = () => [eval];
    new Set(loadValues()).entries().next().value[1](mark('set-unknown-source-entry'));
    function mutate(value) { value.pop(); }
    const prefix = [null]; mutate(prefix);
    Reflect.apply(...prefix, eval, globalThis, [mark('effect')]);
    function nestedMutate(value) { function nested() { value.pop(); } nested(); }
    const nestedPrefix = [null]; nestedMutate(nestedPrefix);
    Reflect.apply(...nestedPrefix, eval, globalThis, [mark('nested-effect')]);
    function nestedDefaultMutate(args) {
      function nested(value = args) { value.pop(); }
      nested();
    }
    const nestedDefaultPrefix = [null]; nestedDefaultMutate(nestedDefaultPrefix);
    Reflect.apply(...nestedDefaultPrefix, eval, globalThis, [mark('nested-default-effect')]);
    function localFactoryMutate(args) {
      function makeMutator() {
        return function (value = args) { value.pop(); };
      }
      makeMutator()();
    }
    const localFactoryPrefix = [null]; localFactoryMutate(localFactoryPrefix);
    Reflect.apply(...localFactoryPrefix, eval, globalThis, [mark('local-factory-effect')]);
    function parameterFactoryMutate(args) {
      function makeMutator(value) { return function () { value.pop(); }; }
      makeMutator(args)();
    }
    const parameterFactoryPrefix = [null]; parameterFactoryMutate(parameterFactoryPrefix);
    Reflect.apply(...parameterFactoryPrefix, eval, globalThis, [mark('parameter-factory-effect')]);
    const getterPrefix = [null];
    const holder = {};
    Object.defineProperty(holder, 'trigger', {
      get() {
        function nested(value = getterPrefix) { value.pop(); }
        nested();
        return JSON.parse;
      }
    });
    void holder.trigger;
    Reflect.apply(...getterPrefix, eval, globalThis, [mark('getter-nested-effect')]);
    const defaultPrefix = [null];
    function defaultMutate(value = (defaultPrefix.pop(), JSON.parse)) { value('{}'); }
    defaultMutate();
    Reflect.apply(...defaultPrefix, eval, globalThis, [mark('default-factory-effect')]);
    process.stdout.write(JSON.stringify(globalThis[${serializedMarkerKey}]));
    delete globalThis[${serializedMarkerKey}];
  `;
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    'map',
    'map-later-element',
    'map-borrowed-later-element',
    'map-bound-later-element',
    'map-boundary-later-element',
    'from',
    'array-new-constructor',
    'array-borrowed-constructor',
    'array-bound-constructor',
    'array-reflected-constructor',
    'array-constructor',
    'map-iteration',
    'map-mutation',
    'map-key-spread',
    'map-manual-next',
    'set-spread',
    'set-mutation',
    'set-destructure',
    'set-unknown-source-entry',
    'effect',
    'nested-effect',
    'nested-default-effect',
    'local-factory-effect',
    'parameter-factory-effect',
    'getter-nested-effect',
    'default-factory-effect',
  ]);
});

test('invoked helper effects propagate executable provenance into caller-owned carriers', () => {
  const helperCases = [
    {
      name: 'object property write',
      source: `function arm(value) { value.run = eval; }
        const holder = {}; arm(holder); holder.run(configuredSource);`,
    },
    {
      name: 'array index write',
      source: `function arm(value) { value[0] = eval; }
        const values = [JSON.parse]; arm(values); values[0](configuredSource);`,
    },
    {
      name: 'Map entry write',
      source: `function arm(value) { value.set('run', eval); }
        const values = new Map(); arm(values); values.get('run')(configuredSource);`,
    },
    {
      name: 'Set value write',
      source: `function arm(value) { value.add(eval); }
        const values = new Set(); arm(values); values.values().next().value(configuredSource);`,
    },
    {
      name: 'parameter and local aliases',
      source: `function arm(value) { const alias = value; const run = eval; alias.run = run; }
        const holder = {}; arm(holder); holder.run(configuredSource);`,
    },
    {
      name: 'closure alias',
      source: `const run = eval; function arm(value) { value.run = run; }
        const holder = {}; arm(holder); holder.run(configuredSource);`,
    },
    {
      name: 'nested helper',
      source: `function arm(value) {
          function nested(alias) { alias.run = eval; }
          nested(value);
        }
        const holder = {}; arm(holder); holder.run(configuredSource);`,
    },
    {
      name: 'returned closure',
      source: `function arm(value) { return () => { value.run = eval; }; }
        const holder = {}; arm(holder)(); holder.run(configuredSource);`,
    },
    {
      name: 'bound helper',
      source: `function arm(value) { value.run = eval; }
        const holder = {}; arm.bind(null, holder)(); holder.run(configuredSource);`,
    },
    {
      name: 'Function.prototype.call helper',
      source: `function arm(value) { value.run = eval; }
        const holder = {}; arm.call(null, holder); holder.run(configuredSource);`,
    },
    {
      name: 'Function.prototype.apply helper',
      source: `function arm(value) { value.run = eval; }
        const holder = {}; arm.apply(null, [holder]); holder.run(configuredSource);`,
    },
    {
      name: 'Reflect.apply helper',
      source: `function arm(value) { value.run = eval; }
        const holder = {}; Reflect.apply(arm, null, [holder]); holder.run(configuredSource);`,
    },
    {
      name: 'transitive helper',
      source: `function arm(value) { value.run = eval; }
        function relay(value) { arm(value); }
        const holder = {}; relay(holder); holder.run(configuredSource);`,
    },
  ];

  for (const helperCase of helperCases) {
    const relativePath = 'packages/example/src/invoked-helper-effect.ts';
    const firstFindings = scanSource(helperCase.source, relativePath);
    const secondFindings = scanSource(helperCase.source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${helperCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(finding => finding.kind === 'direct-eval'),
      `${helperCase.name} should report its executed eval: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${helperCase.name} diagnostics should remain bounded`);
  }

  const safeControls = [
    `function arm(value) { value.other = eval; }
      const holder = { run: JSON.parse }; arm(holder); holder.run('{}');`,
    `function arm(value) { value.run = JSON.parse; }
      const holder = {}; arm(holder); consume(holder);`,
    `function arm(value) { value.run = eval; }
      const holder = { run: JSON.parse }; holder.run('{}');`,
  ];
  for (const [index, source] of safeControls.entries()) {
    assert.deepEqual(
      scanSource(source, `packages/example/src/safe-invoked-helper-${index}.ts`),
      [],
      `safe helper control ${index} should remain clean`
    );
  }
});

test('invoked helper reproductions execute isolated runtime markers', () => {
  const markerKey = '__a12_invoked_helper_marker__';
  const serializedMarkerKey = JSON.stringify(markerKey);
  const source = `
    globalThis[${serializedMarkerKey}] = [];
    const mark = name => \`globalThis[${serializedMarkerKey}].push(\${JSON.stringify(name)})\`;
    {
      function arm(value) { value.run = eval; }
      const holder = {}; arm(holder); holder.run(mark('object'));
    }
    {
      function arm(value) { value[0] = eval; }
      const values = [JSON.parse]; arm(values); values[0](mark('array'));
    }
    {
      function arm(value) { value.set('run', eval); }
      const values = new Map(); arm(values); values.get('run')(mark('map'));
    }
    {
      function arm(value) { value.add(eval); }
      const values = new Set(); arm(values); values.values().next().value(mark('set'));
    }
    {
      function arm(value) { return () => { value.run = eval; }; }
      const holder = {}; arm(holder)(); holder.run(mark('returned'));
    }
    {
      function arm(value) { value.run = eval; }
      const holder = {}; Reflect.apply(arm, null, [holder]); holder.run(mark('reflected'));
    }
    process.stdout.write(JSON.stringify(globalThis[${serializedMarkerKey}]));
    delete globalThis[${serializedMarkerKey}];
  `;
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['object', 'array', 'map', 'set', 'returned', 'reflected']);
});

test('array constructors and overflow mutators retain bounded executable provenance', () => {
  const safeValues = Array.from({ length: 65 }, (_, index) => String(index));
  const first64 = safeValues.slice(0, 64).join(',');
  const all65 = safeValues.join(',');
  const overflowCases = [
    {
      name: 'numeric-length Array fill',
      source: `new Array(65).fill(eval)[64](configuredSource);`,
    },
    {
      name: 'ordinary array fill',
      source: `const values = [${all65}]; values.fill(eval); values[64](configuredSource);`,
    },
    {
      name: 'overflow reverse',
      source: `const values = [eval, ${safeValues.slice(1).join(',')}];
        values.reverse(); values[64](configuredSource);`,
    },
    {
      name: 'overflow copyWithin',
      source: `const values = [eval, ${safeValues.slice(1).join(',')}];
        values.copyWithin(64, 0, 1); values[64](configuredSource);`,
    },
    {
      name: 'overflow splice',
      source: `const values = [${first64}];
        values.splice(64, 0, eval); values[64](configuredSource);`,
    },
    {
      name: 'ordinary array overflow',
      source: `const values = [${first64}, eval]; values[64](configuredSource);`,
    },
    {
      name: 'Array call overflow',
      source: `const values = Array(${first64}, eval); values[64](configuredSource);`,
    },
    {
      name: 'Array.of overflow',
      source: `const values = Array.of(${first64}, eval); values[64](configuredSource);`,
    },
    {
      name: 'new Array argument overflow',
      source: `const values = new Array(${first64}, eval); values[64](configuredSource);`,
    },
    {
      name: 'Array.from overflow',
      source: `const values = Array.from([${first64}, eval]); values[64](configuredSource);`,
    },
    {
      name: 'spread overflow',
      source: `const input = [${first64}, eval]; const values = [...input];
        values[64](configuredSource);`,
    },
    {
      name: 'Array.map overflow',
      source: `const input = [${all65}]; const values = input.map(() => eval);
        values[64](configuredSource);`,
    },
  ];

  for (const overflowCase of overflowCases) {
    const relativePath = 'packages/example/src/array-overflow-provenance.ts';
    const firstFindings = scanSource(overflowCase.source, relativePath);
    const secondFindings = scanSource(overflowCase.source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${overflowCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(
        finding => finding.kind === 'analysis-limit' && finding.reason === 'unknown-reflective-callable'
      ),
      `${overflowCase.name} should fail closed at the tracked boundary: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${overflowCase.name} diagnostics should remain bounded`);
  }

  const safeControls = [
    `const values = [JSON.parse, ${safeValues.slice(1, 64).join(',')}, eval]; values[0]('{}');`,
    `const values = Array.of(${first64}, JSON.parse); values[64]('{}');`,
    `const values = [JSON.parse, ${safeValues.slice(1, 64).join(',')}];
      values.splice(64, 0, eval); values[0]('{}');`,
    `const values = new Array(65).fill(eval); consume(values);`,
    `const values = new Array(65).fill(JSON.parse); consume(values);`,
  ];
  for (const [index, source] of safeControls.entries()) {
    assert.deepEqual(
      scanSource(source, `packages/example/src/safe-array-overflow-${index}.ts`),
      [],
      `safe overflow control ${index} should remain clean`
    );
  }
});

test('overflow mutator reproductions execute isolated runtime markers', () => {
  const markerKey = '__a12_overflow_mutator_marker__';
  const serializedMarkerKey = JSON.stringify(markerKey);
  const safeTail = Array.from({ length: 64 }, () => 'null').join(',');
  const source = `
    globalThis[${serializedMarkerKey}] = [];
    const mark = name => \`globalThis[${serializedMarkerKey}].push(\${JSON.stringify(name)})\`;
    new Array(65).fill(eval)[64](mark('fill'));
    { const values = [eval, ${safeTail}]; values.reverse(); values[64](mark('reverse')); }
    { const values = [eval, ${safeTail}]; values.copyWithin(64, 0, 1); values[64](mark('copyWithin')); }
    { const values = [${safeTail}]; values.splice(64, 0, eval); values[64](mark('splice')); }
    process.stdout.write(JSON.stringify(globalThis[${serializedMarkerKey}]));
    delete globalThis[${serializedMarkerKey}];
  `;
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['fill', 'reverse', 'copyWithin', 'splice']);
});

test('deterministic safe overwrites kill stale executable provenance', () => {
  const safeCases = [
    `const values = new Map([['run', eval]]);
      values.set('run', JSON.parse); values.get('run')('{}');`,
    `const value = { run: eval }; value.run = JSON.parse; value.run('{}');`,
    `const values = [eval]; values[0] = JSON.parse; values[0]('{}');`,
    `const values = new Set([eval]); values.clear(); values.add(JSON.parse);
      values.values().next().value('{}');`,
    `const values = new Map([['run', eval]]); values.clear(); values.set('run', JSON.parse);
      values.get('run')('{}');`,
    `function disarm(value) { value.run = JSON.parse; }
      const value = { run: eval }; disarm(value); value.run('{}');`,
  ];
  for (const [index, source] of safeCases.entries()) {
    assert.deepEqual(
      scanSource(source, `packages/example/src/safe-strong-overwrite-${index}.ts`),
      [],
      `deterministic safe overwrite ${index} should kill stale provenance`
    );
  }

  const ambiguousCases = [
    `const value = { run: eval }; if (flag) value.run = JSON.parse; value.run(configuredSource);`,
    `const value = { run: eval }; value[loadKey()] = JSON.parse; value.run(configuredSource);`,
    `const first = { run: eval }; const second = {};
      (flag ? first : second).run = JSON.parse; first.run(configuredSource);`,
    `const values = new Map([['run', eval]]);
      if (flag) values.set('run', JSON.parse); values.get('run')(configuredSource);`,
    `const values = new Map([['run', eval]]);
      values.set(loadKey(), JSON.parse); values.get('run')(configuredSource);`,
    `const values = new Set([eval]); if (flag) values.clear(); values.add(JSON.parse);
      values.values().next().value(configuredSource);`,
  ];
  for (const [index, source] of ambiguousCases.entries()) {
    const findings = scanSource(source, `packages/example/src/ambiguous-overwrite-${index}.ts`);
    assert.ok(
      findings.some(finding => finding.kind === 'direct-eval'),
      `ambiguous overwrite ${index} should preserve eval provenance: ${JSON.stringify(findings)}`
    );
    assert.ok(findings.length <= 2, `ambiguous overwrite ${index} diagnostics should remain bounded`);
  }
});

test('safe overwrite controls execute only JSON.parse', () => {
  const markerKey = '__a12_safe_overwrite_marker__';
  const serializedMarkerKey = JSON.stringify(markerKey);
  const source = `
    globalThis[${serializedMarkerKey}] = [];
    const parse = JSON.parse;
    JSON.parse = source => {
      globalThis[${serializedMarkerKey}].push('safe');
      return parse(source);
    };
    const map = new Map([['run', eval]]);
    map.set('run', JSON.parse);
    map.get('run')('{}');
    const object = { run: eval };
    object.run = JSON.parse;
    object.run('{}');
    const array = [eval];
    array[0] = JSON.parse;
    array[0]('{}');
    const set = new Set([eval]);
    set.clear();
    set.add(JSON.parse);
    set.values().next().value('{}');
    JSON.parse = parse;
    process.stdout.write(JSON.stringify(globalThis[${serializedMarkerKey}]));
    delete globalThis[${serializedMarkerKey}];
  `;
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['safe', 'safe', 'safe', 'safe']);
});

test('later writes never erase evidence of an earlier unsafe invocation', () => {
  const temporalCases = [
    {
      name: 'object property',
      source: `const holder = { run: eval }; holder.run(configuredSource); holder.run = JSON.parse;`,
    },
    {
      name: 'array position',
      source: `const values = [eval]; values[0](configuredSource); values[0] = JSON.parse;`,
    },
    {
      name: 'tracked array fill',
      source: `const values = [eval]; values[0](configuredSource); values.fill(JSON.parse);`,
    },
    {
      name: 'overflow array fill',
      source: `const values = Array(64).fill(JSON.parse); values.push(eval);
        values[64](configuredSource); values.fill(JSON.parse, -1);`,
    },
    {
      name: 'overflow array shift',
      source: `const values = Array(64).fill(JSON.parse); values.unshift(eval);
        values[0](configuredSource); values.shift();`,
    },
    {
      name: 'Map entry',
      source: `const values = new Map([['run', eval]]); values.get('run')(configuredSource);
        values.set('run', JSON.parse);`,
    },
    {
      name: 'Set clear and repopulation',
      source: `const values = new Set([eval]); values.values().next().value(configuredSource);
        values.clear(); values.add(JSON.parse);`,
    },
    {
      name: 'later helper write',
      source: `function disarm(value) { value.run = JSON.parse; }
        const holder = { run: eval }; holder.run(configuredSource); disarm(holder);`,
    },
    {
      name: 'logical-or assignment',
      source: `const holder = { run: eval }; holder.run(configuredSource); holder.run ||= JSON.parse;`,
    },
    {
      name: 'nullish assignment',
      source: `const holder = { run: eval }; holder.run(configuredSource); holder.run ??= JSON.parse;`,
    },
    {
      name: 'conditional early-return helper',
      source: `function disarm(value) { if (configuredFlag) return; value.run = JSON.parse; }
        const holder = { run: eval }; disarm(holder); holder.run(configuredSource);`,
    },
    {
      name: 'deferred async helper write',
      source: `async function disarm(value) { await later(); value.run = JSON.parse; }
        const holder = { run: eval }; disarm(holder); holder.run(configuredSource);`,
    },
    {
      name: 'Lodash template compiler',
      kind: 'lodash-template',
      source: `import compile from 'lodash/template'; const holder = { run: compile };
        holder.run(configuredTemplate); holder.run = JSON.parse;`,
    },
  ];

  for (const temporalCase of temporalCases) {
    const relativePath = 'packages/example/src/temporal-overwrite.ts';
    const firstFindings = scanSource(temporalCase.source, relativePath);
    const secondFindings = scanSource(temporalCase.source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${temporalCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(finding => finding.kind === (temporalCase.kind ?? 'direct-eval')),
      `${temporalCase.name} should preserve the earlier unsafe call: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${temporalCase.name} diagnostics should remain bounded`);
  }

  const logicalControls = [
    `const holder = { run: eval }; holder.run ||= JSON.parse; holder.run(configuredSource);`,
    `const holder = { run: eval }; holder.run ??= JSON.parse; holder.run(configuredSource);`,
  ];
  for (const [index, source] of logicalControls.entries()) {
    assert.ok(
      scanSource(source, `packages/example/src/conditional-overwrite-${index}.ts`).some(
        finding => finding.kind === 'direct-eval'
      ),
      `conditional overwrite ${index} should retain the existing eval value`
    );
  }
});

test('temporal overwrite reproductions execute the unsafe marker before later writes', () => {
  const markerKey = '__a12_temporal_overwrite_marker__';
  const serializedMarkerKey = JSON.stringify(markerKey);
  const source = `
    (async () => {
      globalThis[${serializedMarkerKey}] = [];
      const mark = name => \`globalThis[${serializedMarkerKey}].push(\${JSON.stringify(name)})\`;
      { const value = { run: eval }; value.run(mark('object')); value.run = JSON.parse; }
      { const value = [eval]; value[0](mark('array')); value[0] = JSON.parse; }
      { const value = new Map([['run', eval]]); value.get('run')(mark('map'));
        value.set('run', JSON.parse); }
      { const value = new Set([eval]); value.values().next().value(mark('set'));
        value.clear(); value.add(JSON.parse); }
      { function disarm(value) { if (true) return; value.run = JSON.parse; }
        const value = { run: eval }; disarm(value); value.run(mark('early-return')); }
      { async function disarm(value) { await Promise.resolve(); value.run = JSON.parse; }
        const value = { run: eval }; const pending = disarm(value); value.run(mark('async')); await pending; }
      process.stdout.write(JSON.stringify(globalThis[${serializedMarkerKey}]));
      delete globalThis[${serializedMarkerKey}];
    })().catch(error => { throw error; });
  `;
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['object', 'array', 'map', 'set', 'early-return', 'async']);
});

test('helper-installed callable provenance survives extraction, forwarding, prototypes, and method overrides', () => {
  const dependencyCases = [
    {
      name: 'property extraction through a carrier alias',
      source: `function arm(value) { value.run = eval; }
        const holder = {}; const alias = holder; arm(alias); const run = holder.run; run(configuredSource);`,
    },
    {
      name: 'object binding destructuring',
      source: `function arm(value) { value.run = eval; }
        const holder = {}; arm(holder); const { run } = holder; run(configuredSource);`,
    },
    {
      name: 'array binding destructuring',
      source: `function arm(value) { value[0] = eval; }
        const holder = []; arm(holder); const [run] = holder; run(configuredSource);`,
    },
    {
      name: 'object assignment destructuring',
      source: `function arm(value) { value.run = eval; }
        const holder = {}; let run; arm(holder); ({ run } = holder); run(configuredSource);`,
    },
    {
      name: 'array assignment destructuring',
      source: `function arm(value) { value[0] = eval; }
        const holder = []; let run; arm(holder); [run] = holder; run(configuredSource);`,
    },
    {
      name: 'forwarded extracted callable',
      source: `function arm(value) { value.run = eval; }
        function invoke(run) { run(configuredSource); }
        const holder = {}; arm(holder); invoke(holder.run);`,
    },
    {
      name: 'returned installer closure followed by extraction',
      source: `function arm(value) { return () => { value.run = eval; }; }
        const holder = {}; const install = arm(holder); install(); const run = holder.run;
        run(configuredSource);`,
    },
    {
      name: 'inherited helper-installed property',
      source: `function arm(value) { value.run = eval; }
        const prototype = {}; arm(prototype); const holder = Object.create(prototype);
        const run = holder.run; run(configuredSource);`,
    },
    {
      name: 'Array map override',
      source: `function arm(value) { value.map = eval; }
        const values = []; const alias = values; arm(alias); const run = values.map; run(configuredSource);`,
    },
    {
      name: 'Map set override',
      source: `function arm(value) { value.set = eval; }
        const values = new Map(); const alias = values; arm(alias); const { set: run } = values;
        run(configuredSource);`,
    },
    {
      name: 'Set add override',
      source: `function arm(value) { value.add = eval; }
        const values = new Set(); const alias = values; arm(alias); const run = values.add;
        run(configuredSource);`,
    },
    {
      name: 'helper logical assignment',
      source: `function arm(value) { value.run ??= eval; }
        const holder = {}; arm(holder); const run = holder.run; run(configuredSource);`,
    },
    {
      name: 'Array.prototype method installed by a helper',
      source: `function arm(value) { value.map = eval; }
        arm(Array.prototype); [].map(configuredSource);`,
    },
    {
      name: 'Map.prototype method installed by a helper',
      source: `function arm(value) { value.set = eval; }
        arm(Map.prototype); new Map().set(configuredSource);`,
    },
    {
      name: 'Set.prototype method installed by a helper',
      source: `function arm(value) { value.add = eval; }
        arm(Set.prototype); new Set().add(configuredSource);`,
    },
    {
      name: 'aliased Array prototype helper and inherited destructuring',
      source: `function arm(value) { value.map = eval; }
        const install = arm; const prototype = Array.prototype; install(prototype);
        const { map: run } = []; run(configuredSource);`,
    },
    {
      name: 'forwarded Map prototype helper and inherited extraction',
      source: `function arm(value) { value.set = eval; }
        function relay(value) { arm(value); }
        relay(Map.prototype); const run = new Map().set; run(configuredSource);`,
    },
    {
      name: 'returned Set prototype installer closure',
      source: `function arm(value) { return () => { value.add = eval; }; }
        arm(Set.prototype)(); const { add: run } = new Set(); run(configuredSource);`,
    },
  ];

  for (const dependencyCase of dependencyCases) {
    const relativePath = 'packages/example/src/helper-carrier-dependency.ts';
    const firstFindings = scanSource(dependencyCase.source, relativePath);
    const secondFindings = scanSource(dependencyCase.source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${dependencyCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(finding => finding.kind === 'direct-eval'),
      `${dependencyCase.name} should retain helper-installed eval: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${dependencyCase.name} diagnostics should remain bounded`);
  }
});

test('helper carrier dependency reproductions execute isolated runtime markers', () => {
  const markerKey = '__a12_helper_dependency_marker__';
  const serializedMarkerKey = JSON.stringify(markerKey);
  const source = `
    globalThis[${serializedMarkerKey}] = [];
    const mark = name => \`globalThis[${serializedMarkerKey}].push(\${JSON.stringify(name)})\`;
    function arm(value, property = 'run') { value[property] = eval; }
    { const value = {}; arm(value); const { run } = value; run(mark('object')); }
    { const value = []; arm(value, '0'); const [run] = value; run(mark('array')); }
    { const value = {}; arm(value); const invoke = run => run(mark('forwarded')); invoke(value.run); }
    { const value = {}; const install = target => () => arm(target); install(value)();
      const run = value.run; run(mark('closure')); }
    { const prototype = {}; arm(prototype); const value = Object.create(prototype);
      value.run(mark('prototype')); }
    { const value = []; arm(value, 'map'); const run = value.map; run(mark('array-map')); }
    { const value = new Map(); arm(value, 'set'); const run = value.set; run(mark('map-set')); }
    { const value = new Set(); arm(value, 'add'); const run = value.add; run(mark('set-add')); }
    process.stdout.write(JSON.stringify(globalThis[${serializedMarkerKey}]));
    delete globalThis[${serializedMarkerKey}];
  `;
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    'object',
    'array',
    'forwarded',
    'closure',
    'prototype',
    'array-map',
    'map-set',
    'set-add',
  ]);
});

test('helper-installed builtin prototype methods execute isolated runtime markers', () => {
  const markerKey = '__a12_builtin_prototype_helper_marker__';
  const serializedMarkerKey = JSON.stringify(markerKey);
  const source = `
    globalThis[${serializedMarkerKey}] = [];
    const mark = name => \`globalThis[${serializedMarkerKey}].push(\${JSON.stringify(name)})\`;
    const originalArrayMap = Array.prototype.map;
    const originalMapSet = Map.prototype.set;
    const originalSetAdd = Set.prototype.add;
    try {
      { function arm(value) { value.map = eval; } arm(Array.prototype); [].map(mark('array')); }
      Array.prototype.map = originalArrayMap;
      { function arm(value) { value.set = eval; } const install = arm;
        install(Map.prototype); new Map().set(mark('map')); }
      Map.prototype.set = originalMapSet;
      { function arm(value) { return () => { value.add = eval; }; }
        arm(Set.prototype)(); new Set().add(mark('set')); }
    } finally {
      Array.prototype.map = originalArrayMap;
      Map.prototype.set = originalMapSet;
      Set.prototype.add = originalSetAdd;
    }
    process.stdout.write(JSON.stringify(globalThis[${serializedMarkerKey}]));
    delete globalThis[${serializedMarkerKey}];
  `;
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['array', 'map', 'set']);
});

function saturatedMutationAlternatives(safe, unsafe, trailing) {
  let expression = trailing === undefined ? unsafe : `choice===64?${unsafe}:(${trailing})`;
  for (let index = 63; index >= 0; index -= 1) {
    expression = `choice===${index}?${safe}:(${expression})`;
  }
  return expression;
}

const saturatedMutationLayoutCases = [
  {
    name: 'direct fill retains the first discarded unsafe layout',
    kind: 'direct-eval',
    source: `const choice=64;const v=Array(65).fill(JSON.parse);
      const args=${saturatedMutationAlternatives('[JSON.parse,-1]', '[eval,-1]')};
      v.fill(...args);v[64](configuredSource);`,
  },
  {
    name: 'borrowed fill retains the first discarded unsafe layout',
    kind: 'direct-eval',
    source: `const choice=64;const v=Array(65).fill(JSON.parse);
      const args=${saturatedMutationAlternatives('[v,JSON.parse,-1]', '[v,eval,-1]')};
      Array.prototype.fill.call(...args);v[64](configuredSource);`,
  },
  {
    name: 'helper fill retains the first discarded unsafe layout',
    kind: 'direct-eval',
    source: `function fill(value,...args){value.fill(...args)}
      const choice=64;const v=Array(65).fill(JSON.parse);
      const args=${saturatedMutationAlternatives('[v,JSON.parse,-1]', '[v,eval,-1]')};
      fill(...args);v[64](configuredSource);`,
  },
  {
    name: 'Lodash fill retains the first discarded unsafe layout',
    kind: 'lodash-template',
    source: `const choice=64;const v=Array(65).fill(JSON.parse);const lodash=require('lodash');
      const args=${saturatedMutationAlternatives('[JSON.parse,-1]', '[lodash.template,-1]')};
      v.fill(...args);v[64](configuredSource);`,
  },
];

test('saturated mutation alternatives fold discarded receiver and argument provenance', () => {
  for (const [index, mutationCase] of saturatedMutationLayoutCases.entries()) {
    const relativePath = `packages/example/src/saturated-mutation-layout-${index}.ts`;
    const firstFindings = scanSource(mutationCase.source, relativePath);
    const secondFindings = scanSource(mutationCase.source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${mutationCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(finding => finding.kind === mutationCase.kind),
      `${mutationCase.name} should retain discarded provenance: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${mutationCase.name} diagnostics should remain bounded`);
  }
});

test('saturated mutation summaries preserve safe overwrite and safe-tail precision', () => {
  const safeCases = [
    `const choice=64;const v=Array(64).fill(JSON.parse);v.push(eval);
      const args=${saturatedMutationAlternatives('[JSON.parse,-1]', '[JSON.stringify,-1]')};
      v.fill(...args);v[64]('{}');`,
    `const choice=64;const v=Array(65).fill(JSON.parse);
      const args=${saturatedMutationAlternatives('[JSON.parse,-1]', '[eval,-1]')};
      v.fill(...args);v[0]('{}');`,
  ];
  for (const [index, source] of safeCases.entries()) {
    assert.deepEqual(
      scanSource(source, `packages/example/src/safe-saturated-mutation-layout-${index}.ts`),
      [],
      `safe saturated mutation control ${index} should remain precise`
    );
  }
});

test('saturated unsafe mutation layouts execute isolated runtime markers', () => {
  const markerKey = '__a12_saturated_mutation_marker__';
  const serializedMarkerKey = JSON.stringify(markerKey);
  const directAlternatives = saturatedMutationAlternatives('[JSON.parse,-1]', '[eval,-1]');
  const forwardedAlternatives = saturatedMutationAlternatives('[v,JSON.parse,-1]', '[v,eval,-1]');
  const lodashAlternatives = saturatedMutationAlternatives('[JSON.parse,-1]', '[lodash.template,-1]');
  const source = `
    globalThis[${serializedMarkerKey}] = [];
    const mark = name => \`globalThis[${serializedMarkerKey}].push(\${JSON.stringify(name)})\`;
    { const choice=64;const v=Array(65).fill(JSON.parse);const args=${directAlternatives};
      v.fill(...args);v[64](mark('direct')); }
    { const choice=64;const v=Array(65).fill(JSON.parse);const args=${forwardedAlternatives};
      Array.prototype.fill.call(...args);v[64](mark('borrowed')); }
    { function fill(value,...args){value.fill(...args)}
      const choice=64;const v=Array(65).fill(JSON.parse);const args=${forwardedAlternatives};
      fill(...args);v[64](mark('helper')); }
    { const choice=64;const v=Array(65).fill(JSON.parse);const lodash=require('lodash');
      const args=${lodashAlternatives};v.fill(...args);
      v[64](\`<% globalThis[${serializedMarkerKey}].push('lodash') %>\`)(); }
    process.stdout.write(JSON.stringify(globalThis[${serializedMarkerKey}]));
    delete globalThis[${serializedMarkerKey}];
  `;
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['direct', 'borrowed', 'helper', 'lodash']);
});

const omittedBoundSaturatedMutationLayoutCases = [
  {
    name: 'direct fill retains a discarded full-array layout',
    kind: 'direct-eval',
    source: `const choice=64;const v=Array(65).fill(JSON.parse);
      const args=${saturatedMutationAlternatives('[JSON.parse,0,0]', '[eval]')};
      v.fill(...args);v[64](configuredSource);`,
  },
  {
    name: 'borrowed fill retains a discarded full-array layout',
    kind: 'direct-eval',
    source: `const choice=64;const v=Array(65).fill(JSON.parse);
      const args=${saturatedMutationAlternatives('[v,JSON.parse,0,0]', '[v,eval]')};
      Array.prototype.fill.call(...args);v[64](configuredSource);`,
  },
  {
    name: 'helper fill retains a discarded full-array layout',
    kind: 'direct-eval',
    source: `function fill(value,...args){value.fill(...args)}
      const choice=64;const v=Array(65).fill(JSON.parse);
      const args=${saturatedMutationAlternatives('[v,JSON.parse,0,0]', '[v,eval]')};
      fill(...args);v[64](configuredSource);`,
  },
  {
    name: 'Lodash fill retains a discarded full-array layout',
    kind: 'lodash-template',
    source: `const choice=64;const v=Array(65).fill(JSON.parse);const lodash=require('lodash');
      const args=${saturatedMutationAlternatives('[JSON.parse,0,0]', '[lodash.template]')};
      v.fill(...args);v[64](configuredSource);`,
  },
  {
    name: 'a discarded unsafe full-array layout remains visible before a safe fallback',
    kind: 'direct-eval',
    source: `const choice=64;const v=Array(65).fill(JSON.parse);
      const args=${saturatedMutationAlternatives('[JSON.parse,0,0]', '[eval]', '[JSON.stringify,0,0]')};
      v.fill(...args);v[64](configuredSource);`,
  },
];

test('saturated mutation summaries retain omitted-bound arity and provenance', () => {
  for (const [index, mutationCase] of omittedBoundSaturatedMutationLayoutCases.entries()) {
    const relativePath = `packages/example/src/omitted-bound-saturated-mutation-layout-${index}.ts`;
    const firstFindings = scanSource(mutationCase.source, relativePath);
    const secondFindings = scanSource(mutationCase.source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${mutationCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(finding => finding.kind === mutationCase.kind),
      `${mutationCase.name} should retain discarded provenance and arity: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${mutationCase.name} diagnostics should remain bounded`);
  }
});

test('discarded omitted-bound mutation layouts execute isolated runtime markers', () => {
  const markerKey = '__a12_omitted_bound_saturation_marker__';
  const serializedMarkerKey = JSON.stringify(markerKey);
  const directAlternatives = saturatedMutationAlternatives('[JSON.parse,0,0]', '[eval]');
  const forwardedAlternatives = saturatedMutationAlternatives('[v,JSON.parse,0,0]', '[v,eval]');
  const lodashAlternatives = saturatedMutationAlternatives('[JSON.parse,0,0]', '[lodash.template]');
  const unsafeNotLastAlternatives = saturatedMutationAlternatives('[JSON.parse,0,0]', '[eval]', '[JSON.stringify,0,0]');
  const source = `
    globalThis[${serializedMarkerKey}] = [];
    const mark = name => \`globalThis[${serializedMarkerKey}].push(\${JSON.stringify(name)})\`;
    { const choice=64;const v=Array(65).fill(JSON.parse);const args=${directAlternatives};
      v.fill(...args);v[64](mark('direct')); }
    { const choice=64;const v=Array(65).fill(JSON.parse);const args=${forwardedAlternatives};
      Array.prototype.fill.call(...args);v[64](mark('borrowed')); }
    { function fill(value,...args){value.fill(...args)}
      const choice=64;const v=Array(65).fill(JSON.parse);const args=${forwardedAlternatives};
      fill(...args);v[64](mark('helper')); }
    { const choice=64;const v=Array(65).fill(JSON.parse);const lodash=require('lodash');
      const args=${lodashAlternatives};v.fill(...args);
      v[64](\`<% globalThis[${serializedMarkerKey}].push('lodash') %>\`)(); }
    { const choice=64;const v=Array(65).fill(JSON.parse);const args=${unsafeNotLastAlternatives};
      v.fill(...args);v[64](mark('unsafe-not-last')); }
    process.stdout.write(JSON.stringify(globalThis[${serializedMarkerKey}]));
    delete globalThis[${serializedMarkerKey}];
  `;
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['direct', 'borrowed', 'helper', 'lodash', 'unsafe-not-last']);
});

const conditionalSpreadMutationCases = [
  {
    name: 'direct fill preserves the unsafe conditional argument layout from the review',
    kind: 'direct-eval',
    source: `const v=Array(64).fill(JSON.parse);v.push(eval);
      const args=flag?[JSON.parse,-1]:[eval,-1];v.fill(...args);
      v[64](configuredSource);`,
  },
  {
    name: 'borrowed fill preserves the unmodified conditional receiver from the review',
    kind: 'direct-eval',
    source: `const first=Array(64).fill(JSON.parse);first.push(eval);
      const second=Array(65).fill(JSON.parse);
      const args=flag?[first,JSON.parse,-1]:[second,JSON.parse,-1];
      Array.prototype.fill.call(...args);first[64](configuredSource);`,
  },
  {
    name: 'helper fill preserves the unmodified conditional receiver from the review',
    kind: 'direct-eval',
    source: `function fill(value,...args){value.fill(...args)}
      const first=Array(64).fill(JSON.parse);first.push(eval);
      const second=Array(65).fill(JSON.parse);
      const args=flag?[first,JSON.parse,-1]:[second,JSON.parse,-1];
      fill(...args);first[64](configuredSource);`,
  },
  {
    name: 'direct fill preserves a conditional Lodash template carrier',
    kind: 'lodash-template',
    source: `const v=Array(64).fill(JSON.parse);v.push(require('lodash').template);
      const args=flag?[JSON.parse,-1]:[require('lodash').template,-1];v.fill(...args);
      v[64](configuredSource);`,
  },
  {
    name: 'direct spread fill applies an unsafe second argument layout',
    kind: 'direct-eval',
    source: `const v=Array(65).fill(JSON.parse);
      const args=flag?[JSON.parse,-1]:[eval,-1];v.fill(...args);
      v[64](configuredSource);`,
  },
  {
    name: 'borrowed spread fill applies an unsafe second argument layout',
    kind: 'direct-eval',
    source: `const v=Array(65).fill(JSON.parse);
      const args=flag?[v,JSON.parse,-1]:[v,eval,-1];
      Array.prototype.fill.call(...args);v[64](configuredSource);`,
  },
  {
    name: 'helper spread fill applies an unsafe second argument layout',
    kind: 'direct-eval',
    source: `function fill(value,...args){value.fill(...args)}
      const v=Array(65).fill(JSON.parse);
      const args=flag?[v,JSON.parse,-1]:[v,eval,-1];
      fill(...args);v[64](configuredSource);`,
  },
  {
    name: 'direct fill applies a distinct variable-length argument layout',
    kind: 'direct-eval',
    source: `const v=Array(65).fill(JSON.parse);
      const args=flag?[JSON.parse,-1]:[eval];v.fill(...args);
      v[64](configuredSource);`,
  },
  {
    name: 'borrowed fill applies a distinct variable-length receiver layout',
    kind: 'direct-eval',
    source: `const v=Array(65).fill(JSON.parse);
      const args=flag?[v,JSON.parse,-1]:[v,eval];
      Array.prototype.fill.call(...args);v[64](configuredSource);`,
  },
  {
    name: 'helper fill applies a distinct variable-length forwarded layout',
    kind: 'direct-eval',
    source: `function fill(value,...args){value.fill(...args)}
      const v=Array(65).fill(JSON.parse);
      const args=flag?[v,JSON.parse,-1]:[v,eval];
      fill(...args);v[64](configuredSource);`,
  },
  {
    name: 'a direct call preserves both conditional receiver and spread argument alternatives',
    kind: 'direct-eval',
    source: `const first=Array(64).fill(JSON.parse);first.push(eval);
      const second=Array(65).fill(JSON.parse);
      const args=flag?[JSON.parse,-1]:[eval,-1];
      (choice?first:second).fill(...args);first[64](configuredSource);`,
  },
  {
    name: 'a borrowed crossing mutation correlates spread receiver and argument alternatives',
    kind: 'direct-eval',
    source: `const first=Array(64).fill(JSON.parse);const second=Array(64).fill(JSON.parse);
      const args=flag?[second,JSON.parse]:[first,eval];
      Array.prototype.push.call(...args);first[64](configuredSource);`,
  },
  {
    name: 'a helper crossing mutation correlates spread receiver and argument alternatives',
    kind: 'direct-eval',
    source: `function push(value,...args){value.push(...args)}
      const first=Array(64).fill(JSON.parse);const second=Array(64).fill(JSON.parse);
      const args=flag?[second,JSON.parse]:[first,eval];
      push(...args);first[64](configuredSource);`,
  },
  {
    name: 'conditional spread push crosses the tracking boundary with eval',
    kind: 'direct-eval',
    source: `const v=Array(64).fill(JSON.parse);const args=flag?[JSON.parse]:[eval];
      v.push(...args);v[64](configuredSource);`,
  },
  {
    name: 'conditional spread splice crosses the tracking boundary with eval',
    kind: 'direct-eval',
    source: `const v=Array(64).fill(JSON.parse);
      const args=flag?[64,0,JSON.parse]:[64,0,eval];
      v.splice(...args);v[64](configuredSource);`,
  },
  {
    name: 'conditional copyWithin cannot erase the untouched unsafe layout',
    kind: 'direct-eval',
    source: `const v=[eval,JSON.parse];const args=flag?[0,1,2]:[1,0,1];
      v.copyWithin(...args);v[0](configuredSource);`,
  },
];

test('conditional spread mutations retain every receiver and argument provenance layout', () => {
  for (const [index, mutationCase] of conditionalSpreadMutationCases.entries()) {
    const relativePath = `packages/example/src/conditional-spread-mutation-${index}.ts`;
    const firstFindings = scanSource(mutationCase.source, relativePath);
    const secondFindings = scanSource(mutationCase.source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${mutationCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(finding => finding.kind === mutationCase.kind),
      `${mutationCase.name} should retain executable provenance: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${mutationCase.name} diagnostics should remain bounded`);
  }
});

test('deterministic direct, borrowed, and helper spread overwrites remain precise', () => {
  const safeCases = [
    `const v=Array(64).fill(JSON.parse);v.push(eval);
      const args=[JSON.parse,-1];v.fill(...args);v[64]('{}');`,
    `const v=Array(64).fill(JSON.parse);v.push(eval);
      const args=[v,JSON.parse,-1];Array.prototype.fill.call(...args);v[64]('{}');`,
    `function fill(value,...args){value.fill(...args)}
      const v=Array(64).fill(JSON.parse);v.push(eval);
      const args=[v,JSON.parse,-1];fill(...args);v[64]('{}');`,
    `const v=Array(64).fill(JSON.parse);v.push(eval);
      const args=flag?[JSON.parse,-1]:[JSON.stringify,-1];v.fill(...args);v[64]('{}');`,
    `const v=Array(64).fill(JSON.parse);v.push(eval);
      const args=flag?[v,JSON.parse,-1]:[v,JSON.stringify,-1];
      Array.prototype.fill.call(...args);v[64]('{}');`,
    `function fill(value,...args){value.fill(...args)}
      const v=Array(64).fill(JSON.parse);v.push(eval);
      const args=flag?[v,JSON.parse,-1]:[v,JSON.stringify,-1];fill(...args);v[64]('{}');`,
  ];
  for (const [index, source] of safeCases.entries()) {
    assert.deepEqual(
      scanSource(source, `packages/example/src/safe-deterministic-spread-overwrite-${index}.ts`),
      [],
      `deterministic spread overwrite ${index} should replace stale provenance`
    );
  }
});

test('equivalent normalized fill bounds preserve deterministic safe overwrites', () => {
  const saturatedArguments = saturatedMutationAlternatives('[JSON.parse,-1]', '[JSON.stringify,64]');
  const safeCases = [
    `const v=Array(64).fill(JSON.parse);v.push(eval);
      const args=flag?[JSON.parse,-1]:[JSON.stringify,64];v.fill(...args);v[64]('{}');`,
    `const v=Array(64).fill(JSON.parse);v.push(eval);
      const args=flag?[v,JSON.parse,-1]:[v,JSON.stringify,64];
      Array.prototype.fill.call(...args);v[64]('{}');`,
    `const v=Array(64).fill(JSON.parse);v.push(eval);
      const args=flag?[JSON.parse,-1]:[JSON.stringify,64];
      Reflect.apply(Array.prototype.fill,v,args);v[64]('{}');`,
    `function fill(value,...args){value.fill(...args)}
      const v=Array(64).fill(JSON.parse);v.push(eval);
      const args=flag?[v,JSON.parse,-1]:[v,JSON.stringify,64];fill(...args);v[64]('{}');`,
    `const choice=64;const v=Array(64).fill(JSON.parse);v.push(eval);
      const args=${saturatedArguments};v.fill(...args);v[64]('{}');`,
    `function fill(value,...args){value.fill(...args)}
      const choice=64;const v=Array(64).fill(JSON.parse);v.push(eval);
      const args=${saturatedMutationAlternatives(
        '[v,JSON.parse,-1]',
        '[v,JSON.stringify,64]'
      )};fill(...args);v[64]('{}');`,
  ];

  for (const [index, source] of safeCases.entries()) {
    assert.deepEqual(
      scanSource(source, `packages/example/src/safe-equivalent-fill-bound-${index}.ts`),
      [],
      `equivalent safe fill bound ${index} should replace stale provenance`
    );
  }
});

test('conditional spread review sources execute isolated runtime markers', () => {
  const markerKey = '__a12_conditional_spread_marker__';
  const serializedMarkerKey = JSON.stringify(markerKey);
  const source = `
    globalThis[${serializedMarkerKey}] = [];
    const mark = name => \`globalThis[${serializedMarkerKey}].push(\${JSON.stringify(name)})\`;
    { const flag=false;const configuredSource=mark('direct');
      const v=Array(64).fill(JSON.parse);v.push(eval);
      const args=flag?[JSON.parse,-1]:[eval,-1];v.fill(...args);v[64](configuredSource); }
    { const flag=false;const configuredSource=mark('borrowed');
      const first=Array(64).fill(JSON.parse);first.push(eval);const second=Array(65).fill(JSON.parse);
      const args=flag?[first,JSON.parse,-1]:[second,JSON.parse,-1];
      Array.prototype.fill.call(...args);first[64](configuredSource); }
    { const flag=false;const configuredSource=mark('helper');
      function fill(value,...args){value.fill(...args)}
      const first=Array(64).fill(JSON.parse);first.push(eval);const second=Array(65).fill(JSON.parse);
      const args=flag?[first,JSON.parse,-1]:[second,JSON.parse,-1];
      fill(...args);first[64](configuredSource); }
    { const flag=false;const lodash=require('lodash');
      const configuredSource=\`<% globalThis[${serializedMarkerKey}].push('lodash') %>\`;
      const v=Array(64).fill(JSON.parse);v.push(lodash.template);
      const args=flag?[JSON.parse,-1]:[lodash.template,-1];v.fill(...args);v[64](configuredSource)(); }
    { const parse=JSON.parse;
      JSON.parse=value=>{globalThis[${serializedMarkerKey}].push('safe-overwrite');return parse(value)};
      const v=Array(64).fill(JSON.parse);v.push(eval);v.fill(JSON.parse,-1);v[64]('{}');
      JSON.parse=parse; }
    process.stdout.write(JSON.stringify(globalThis[${serializedMarkerKey}]));
    delete globalThis[${serializedMarkerKey}];
  `;
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['direct', 'borrowed', 'helper', 'lodash', 'safe-overwrite']);
});

test('the guard CLI rejects the conditional spread review sources', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = conditionalSpreadMutationCases.slice(0, 4).map((mutationCase, index) => ({
    relativePath: `packages/example/src/conditional-spread-review-${index}.ts`,
    source: mutationCase.source,
  }));
  const result = invokeGuardWithTrackedSources(root, sources);

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  for (const { relativePath } of sources) {
    assert.ok(result.stderr.includes(`Unexpected unsafe execution: ${relativePath}:`), result.stderr);
  }
});

test('exact array lengths remain synchronized when ordinary mutations cross the tracking boundary', () => {
  const unsafeCases = [
    {
      name: 'push followed by negative tail replacement',
      source: `const v=Array(64).fill(JSON.parse);v.push(JSON.parse);
        v.splice(-1,1,eval);v[64](configuredSource);`,
    },
    {
      name: 'tail insertion copied into the tracked prefix',
      source: `const v=Array(64).fill(JSON.parse);v.splice(64,0,eval);
        v.copyWithin(0,-1);v[0](configuredSource);`,
    },
    {
      name: 'unsafe overflow tail shifted below the boundary',
      source: `const v=Array(64).fill(JSON.parse);v.push(eval);
        v.splice(0,1);v[63](configuredSource);`,
    },
  ];

  for (const unsafeCase of unsafeCases) {
    const relativePath = 'packages/example/src/exact-length-boundary-crossing.ts';
    const firstFindings = scanSource(unsafeCase.source, relativePath);
    const secondFindings = scanSource(unsafeCase.source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${unsafeCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(finding => finding.kind === 'direct-eval'),
      `${unsafeCase.name} should retain eval provenance: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${unsafeCase.name} diagnostics should remain bounded`);
  }

  const safeOverwrite = `const v=Array(64).fill(JSON.parse);v.push(eval);
    v.fill(JSON.parse,-1);v[64]('{}');`;
  assert.deepEqual(
    scanSource(safeOverwrite, 'packages/example/src/safe-exact-length-boundary-overwrite.ts'),
    [],
    'a deterministic safe tail overwrite should replace stale overflow provenance'
  );
});

test('array boundary crossings preserve mutation provenance in both directions', () => {
  const unsafeCases = [
    {
      name: 'two pushes cross upward from 63 slots',
      source: `const v=Array(63).fill(JSON.parse);v.push(JSON.parse);v.push(eval);
        v[64](configuredSource);`,
    },
    {
      name: 'pop exposes the preceding unsafe overflow value',
      source: `const v=Array(64).fill(JSON.parse);v.push(eval);v.push(JSON.parse);v.pop();
        v[64](configuredSource);`,
    },
    {
      name: 'unshift crosses upward into overflow',
      source: `const v=Array(64).fill(JSON.parse);v.unshift(eval);v[0](configuredSource);`,
    },
    {
      name: 'shift crosses downward with an unsafe tail',
      source: `const v=Array(64).fill(JSON.parse);v.push(eval);v.shift();v[63](configuredSource);`,
    },
    {
      name: 'negative splice inserts before the overflow tail',
      source: `const v=Array(64).fill(JSON.parse);v.push(JSON.parse);v.splice(-1,0,eval);
        v[64](configuredSource);`,
    },
    {
      name: 'omitted splice count retains an unsafe prefix',
      source: `const v=Array(64).fill(JSON.parse);v.unshift(eval);v.splice(1);
        v[0](configuredSource);`,
    },
    {
      name: 'fill writes eval into the overflow tail',
      source: `const v=Array(64).fill(JSON.parse);v.push(JSON.parse);v.fill(eval,-1);
        v[64](configuredSource);`,
    },
    {
      name: 'an array alias shifts an unsafe tail below the boundary',
      source: `const v=Array(64).fill(JSON.parse);const alias=v;alias.push(eval);alias.shift();
        v[63](configuredSource);`,
    },
    {
      name: 'a borrowed push remains fail closed across a later deletion',
      source: `const v=Array(64).fill(JSON.parse);Array.prototype.push.call(v,eval);
        v.splice(0,1);v[63](configuredSource);`,
    },
    {
      name: 'a helper mutation shifts an unsafe tail below the boundary',
      source: `function mutate(value){value.push(eval);value.shift();}
        const v=Array(64).fill(JSON.parse);mutate(v);v[63](configuredSource);`,
    },
    {
      name: 'a conditional receiver cannot strongly overwrite both possible tails',
      source: `const first=Array(64).fill(JSON.parse);first.push(eval);
        const second=Array(65).fill(JSON.parse);(flag?first:second).fill(JSON.parse,-1);
        first[64](configuredSource);`,
    },
    {
      name: 'a conditional safe overwrite cannot erase the unsafe tail',
      source: `const v=Array(64).fill(JSON.parse);v.push(eval);
        if(flag)v.fill(JSON.parse,-1);v[64](configuredSource);`,
    },
  ];

  for (const unsafeCase of unsafeCases) {
    const relativePath = 'packages/example/src/array-boundary-mutation-matrix.ts';
    const findings = scanSource(unsafeCase.source, relativePath);
    assert.ok(
      findings.some(finding => finding.kind === 'direct-eval'),
      `${unsafeCase.name} should retain eval provenance: ${JSON.stringify(findings)}`
    );
    assert.ok(findings.length <= 2, `${unsafeCase.name} diagnostics should remain bounded`);
  }

  const safeCases = [
    `const v=Array(64).fill(JSON.parse);v.push(eval);v.pop();v[63]('{}');`,
    `const v=Array(64).fill(JSON.parse);v.unshift(eval);v.shift();v[0]('{}');`,
    `const v=Array(64).fill(JSON.parse);v.push(eval);v.splice(-1,1,JSON.parse);v[64]('{}');`,
    `const v=Array(64).fill(JSON.parse);v.push(eval);v.copyWithin(-1,0,1);v[64]('{}');`,
    `const v=Array(64).fill(JSON.parse);v.push(eval);v.splice(-1);v[63]('{}');`,
    `const v=Array(63).fill(JSON.parse);v.push(JSON.parse);v.push(eval);v.pop();v[63]('{}');`,
    `const v=[eval];v.fill(JSON.parse);v[0]('{}');`,
    `const v=[eval,JSON.parse];v.copyWithin(0,1);v[0]('{}');`,
    `const v=[eval];v.splice(0,1,JSON.parse);v[0]('{}');`,
    `const v=Array(64).fill(JSON.parse);const alias=v;alias.push(eval);
      alias.fill(JSON.parse,-1);v[64]('{}');`,
  ];
  for (const [index, source] of safeCases.entries()) {
    assert.deepEqual(
      scanSource(source, `packages/example/src/safe-array-boundary-mutation-${index}.ts`),
      [],
      `safe boundary mutation ${index} should replace or remove stale provenance`
    );
  }
});

test('reviewed array boundary crossings execute isolated runtime markers', () => {
  const markerKey = '__a12_exact_length_boundary_marker__';
  const serializedMarkerKey = JSON.stringify(markerKey);
  const source = `
    globalThis[${serializedMarkerKey}] = [];
    const mark = name => \`globalThis[${serializedMarkerKey}].push(\${JSON.stringify(name)})\`;
    const parse = JSON.parse;
    JSON.parse = value => {
      globalThis[${serializedMarkerKey}].push('safe-overwrite');
      return parse(value);
    };
    try {
      { const v=Array(64).fill(JSON.parse);v.push(JSON.parse);v.splice(-1,1,eval);
        v[64](mark('push-splice')); }
      { const v=Array(64).fill(JSON.parse);v.splice(64,0,eval);v.copyWithin(0,-1);
        v[0](mark('splice-copyWithin')); }
      { const v=Array(64).fill(JSON.parse);v.push(eval);v.splice(0,1);
        v[63](mark('push-delete')); }
      { const v=Array(64).fill(JSON.parse);v.push(eval);v.fill(JSON.parse,-1);v[64]('{}'); }
    } finally {
      JSON.parse = parse;
    }
    process.stdout.write(JSON.stringify(globalThis[${serializedMarkerKey}]));
    delete globalThis[${serializedMarkerKey}];
  `;
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['push-splice', 'splice-copyWithin', 'push-delete', 'safe-overwrite']);
});

test('boundary deletions expose inherited unsafe callables through direct and forwarded mutations', () => {
  const unsafeCases = [
    {
      name: 'direct pop',
      mutation: 'values.pop();',
    },
    {
      name: 'borrowed pop',
      mutation: 'Array.prototype.pop.call(values);',
    },
    {
      name: 'reflected pop',
      mutation: 'Reflect.apply(Array.prototype.pop,values,[]);',
    },
    {
      name: 'helper-forwarded pop',
      prefix: 'function removeLast(value){value.pop()}',
      mutation: 'removeLast(values);',
    },
    {
      name: 'helper-forwarded reflected pop',
      prefix: 'function removeLast(value){Reflect.apply(Array.prototype.pop,value,[])}',
      mutation: 'removeLast(values);',
    },
  ];

  for (const [index, unsafeCase] of unsafeCases.entries()) {
    const source = `${unsafeCase.prefix ?? ''}
      const prototype=[];prototype[64]=eval;
      const values=Array(65).fill(JSON.parse);Object.setPrototypeOf(values,prototype);
      ${unsafeCase.mutation}values[64](configuredSource);`;
    const relativePath = `packages/example/src/inherited-boundary-pop-${index}.ts`;
    const firstFindings = scanSource(source, relativePath);
    const secondFindings = scanSource(source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${unsafeCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(finding => finding.kind === 'direct-eval'),
      `${unsafeCase.name} should expose inherited eval: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${unsafeCase.name} diagnostics should remain bounded`);
  }

  const sparseOverflowCases = [
    `const prototype=[];prototype[64]=eval;
      const values=Array(66);values[65]=JSON.parse;Object.setPrototypeOf(values,prototype);
      values[64](configuredSource);`,
    `const prototype=[];prototype[64]=eval;
      const values=Array(66);values[65]=JSON.parse;Object.setPrototypeOf(values,prototype);
      values.shift();values[63](configuredSource);`,
    `function shift(value){value.shift()}
      const prototype=[];prototype[64]=eval;
      const values=Array(66);values[65]=JSON.parse;Object.setPrototypeOf(values,prototype);
      shift(values);values[63](configuredSource);`,
  ];
  for (const [index, source] of sparseOverflowCases.entries()) {
    const findings = scanSource(source, `packages/example/src/sparse-inherited-overflow-${index}.ts`);
    assert.ok(
      findings.some(finding => finding.kind === 'direct-eval'),
      `sparse inherited overflow ${index} should retain eval: ${JSON.stringify(findings)}`
    );
    assert.ok(findings.length <= 2, `sparse inherited overflow ${index} diagnostics should remain bounded`);
  }

  const safeCases = [
    `const prototype=[];prototype[64]=eval;
      const values=Array(65).fill(JSON.parse);Object.setPrototypeOf(values,prototype);values[64]('{}');`,
    `const prototype=[];prototype[64]=JSON.parse;
      const values=Array(65).fill(JSON.stringify);Object.setPrototypeOf(values,prototype);
      values.pop();values[64]('{}');`,
    `function removeLast(value){value.pop()}
      const prototype=[];prototype[63]=eval;
      const values=Array(65).fill(JSON.parse);Object.setPrototypeOf(values,prototype);
      removeLast(values);values[63]('{}');`,
    `function removeLast(value){value.pop()}
      const prototype=[];prototype[64]=eval;
      const values=Array(65).fill(JSON.parse);Object.setPrototypeOf(values,prototype);
      removeLast(values);values.push(JSON.parse);values[64]('{}');`,
    `const prototype=[];prototype[64]=eval;
      const values=[${Array.from({ length: 65 }, () => 'JSON.parse').join(',')}];
      Object.setPrototypeOf(values,prototype);values[64]('{}');`,
    `const prototype=[];prototype[64]=eval;
      const values=Array(66).fill(JSON.parse);Object.setPrototypeOf(values,prototype);
      values.shift();values[63]('{}');`,
  ];
  for (const [index, source] of safeCases.entries()) {
    assert.deepEqual(
      scanSource(source, `packages/example/src/safe-inherited-boundary-pop-${index}.ts`),
      [],
      `safe inherited boundary control ${index} should remain precise`
    );
  }
});

test('inherited boundary pop reproductions execute isolated runtime markers', () => {
  const markerKey = '__a12_inherited_boundary_pop_marker__';
  const serializedMarkerKey = JSON.stringify(markerKey);
  const source = `
    globalThis[${serializedMarkerKey}] = [];
    const mark = name => \`globalThis[${serializedMarkerKey}].push(\${JSON.stringify(name)})\`;
    const createValues = () => {
      const prototype=[];prototype[64]=eval;
      const values=Array(65).fill(JSON.parse);Object.setPrototypeOf(values,prototype);
      return values;
    };
    { const values=createValues();values.pop();values[64](mark('direct')); }
    { const values=createValues();Array.prototype.pop.call(values);values[64](mark('borrowed')); }
    { const values=createValues();Reflect.apply(Array.prototype.pop,values,[]);
      values[64](mark('reflected')); }
    { function removeLast(value){value.pop()}const values=createValues();removeLast(values);
      values[64](mark('helper')); }
    { function removeLast(value){Reflect.apply(Array.prototype.pop,value,[])}
      const values=createValues();removeLast(values);values[64](mark('helper-reflected')); }
    process.stdout.write(JSON.stringify(globalThis[${serializedMarkerKey}]));
    delete globalThis[${serializedMarkerKey}];
  `;
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['direct', 'borrowed', 'reflected', 'helper', 'helper-reflected']);
});

test('deterministic length truncation exposes inherited callables and clears stale own provenance', () => {
  const unsafeCases = [
    {
      name: 'direct length assignment',
      mutation: 'values.length=1;',
    },
    {
      name: 'tracked-boundary length assignment',
      prefix: 'const prototype=[];prototype[64]=eval;const values=Array(65).fill(JSON.parse);',
      mutation: 'values.length=64;',
      invocation: 'values[64](configuredSource);',
    },
    {
      name: 'helper-forwarded length assignment',
      prefix: 'function truncate(value){value.length=1}',
      mutation: 'truncate(values);',
    },
    {
      name: 'Reflect.set length assignment',
      mutation: "Reflect.set(values,'length',1);",
    },
    {
      name: 'Object.assign length assignment',
      mutation: 'Object.assign(values,{length:1});',
    },
    {
      name: 'Object.defineProperty length assignment',
      mutation: "Object.defineProperty(values,'length',{value:1});",
    },
    {
      name: 'Reflect.defineProperty length assignment',
      mutation: "Reflect.defineProperty(values,'length',{value:1});",
    },
    {
      name: 'Object.defineProperties length assignment',
      mutation: 'Object.defineProperties(values,{length:{value:1}});',
    },
  ];

  for (const [index, unsafeCase] of unsafeCases.entries()) {
    const source =
      unsafeCase.prefix && unsafeCase.name === 'tracked-boundary length assignment'
        ? `${unsafeCase.prefix}Object.setPrototypeOf(values,prototype);
          ${unsafeCase.mutation}${unsafeCase.invocation}`
        : `${unsafeCase.prefix ?? ''}const prototype=[];prototype[1]=eval;
          const values=[JSON.parse,JSON.parse];Object.setPrototypeOf(values,prototype);
          ${unsafeCase.mutation}values[1](configuredSource);`;
    const relativePath = `packages/example/src/length-truncation-${index}.ts`;
    const firstFindings = scanSource(source, relativePath);
    const secondFindings = scanSource(source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${unsafeCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(finding => finding.kind === 'direct-eval'),
      `${unsafeCase.name} should expose inherited eval: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${unsafeCase.name} diagnostics should remain bounded`);
  }

  const safeCases = [
    `const prototype=[];prototype[1]=eval;
      const values=[JSON.parse,JSON.parse,JSON.parse];Object.setPrototypeOf(values,prototype);
      values.length=2;values[1]('{}');`,
    `const prototype=[];prototype[1]=eval;
      const values=[JSON.parse,JSON.parse];Object.setPrototypeOf(values,prototype);
      const nextLength=flag?1:2;values.length=nextLength;values[0]('{}');`,
    `const prototype=[];prototype[1]=eval;
      const values=[JSON.parse,JSON.parse];Object.setPrototypeOf(values,prototype);
      values.length=2;values[1]('{}');`,
    `const prototype=[];prototype[1]=JSON.parse;
      const values=[JSON.parse,eval];Object.setPrototypeOf(values,prototype);
      values.length=1;values[1]('{}');`,
    `const prototype=[];prototype[1]=eval;
      const values=[JSON.parse,JSON.parse];Object.setPrototypeOf(values,prototype);
      values.length=1;values[1]=JSON.parse;values[1]('{}');`,
    `const prototype=[];prototype[64]=JSON.parse;
      const values=Array(65).fill(JSON.parse);values[64]=eval;Object.setPrototypeOf(values,prototype);
      values.length=64;values[64]('{}');`,
    `const prototype=[];prototype[64]=eval;
      const values=Array(65).fill(JSON.parse);Object.setPrototypeOf(values,prototype);
      values.length=66;values[64]('{}');`,
  ];
  for (const [index, source] of safeCases.entries()) {
    assert.deepEqual(
      scanSource(source, `packages/example/src/safe-length-update-${index}.ts`),
      [],
      `safe length update ${index} should retain bounded precision`
    );
  }
});

test('conditional length truncation exposes inherited callables through every supported write mechanism', () => {
  const mutationCases = [
    {
      name: 'direct assignment',
      mutation: 'values.length=nextLength;',
    },
    {
      name: 'helper-forwarded assignment',
      prefix: 'function setLength(value,length){value.length=length}',
      mutation: 'setLength(values,nextLength);',
    },
    {
      name: 'Reflect.set',
      mutation: "Reflect.set(values,'length',nextLength);",
    },
    {
      name: 'Object.assign',
      mutation: 'Object.assign(values,{length:nextLength});',
    },
    {
      name: 'Object.defineProperty',
      mutation: "Object.defineProperty(values,'length',{value:nextLength});",
    },
    {
      name: 'Reflect.defineProperty',
      mutation: "Reflect.defineProperty(values,'length',{value:nextLength});",
    },
    {
      name: 'Object.defineProperties',
      mutation: 'Object.defineProperties(values,{length:{value:nextLength}});',
    },
  ];
  const scenarios = [
    {
      name: 'index 1 across lengths 1/2',
      setup: `const prototype=[];prototype[1]=eval;
        const values=[JSON.parse,JSON.parse];Object.setPrototypeOf(values,prototype);`,
      length: 'const nextLength=flag?1:2;',
      invocation: 'values[1](configuredSource);',
    },
    {
      name: 'index 64 across lengths 64/65',
      setup: `const prototype=[];prototype[64]=eval;
        const values=Array(65).fill(JSON.parse);Object.setPrototypeOf(values,prototype);`,
      length: 'const nextLength=flag?64:65;',
      invocation: 'values[64](configuredSource);',
    },
    {
      name: 'index 65 across lengths 64/65',
      setup: `const prototype=[];prototype[65]=eval;
        const values=Array(66).fill(JSON.parse);Object.setPrototypeOf(values,prototype);`,
      length: 'const nextLength=flag?64:65;',
      invocation: 'values[65](configuredSource);',
    },
  ];

  for (const [scenarioIndex, scenario] of scenarios.entries()) {
    for (const [mutationIndex, mutationCase] of mutationCases.entries()) {
      const source = `${mutationCase.prefix ?? ''}${scenario.setup}${scenario.length}
        ${mutationCase.mutation}${scenario.invocation}`;
      const relativePath = `packages/example/src/conditional-length-truncation-${scenarioIndex}-${mutationIndex}.ts`;
      const firstFindings = scanSource(source, relativePath);
      const secondFindings = scanSource(source, relativePath);
      assert.deepEqual(firstFindings, secondFindings, `${mutationCase.name}, ${scenario.name} should be deterministic`);
      assert.ok(
        firstFindings.some(finding => finding.kind === 'direct-eval'),
        `${mutationCase.name}, ${scenario.name} should expose inherited eval: ${JSON.stringify(firstFindings)}`
      );
      assert.ok(firstFindings.length <= 2, `${mutationCase.name}, ${scenario.name} diagnostics should remain bounded`);
    }
  }

  const safeCases = [
    `const prototype=[];prototype[1]=eval;
      const values=[JSON.parse,JSON.parse];Object.setPrototypeOf(values,prototype);
      const nextLength=flag?1:2;values.length=nextLength;values[0]('{}');`,
    `const prototype=[];prototype[1]=eval;
      const values=[JSON.parse,JSON.parse];Object.setPrototypeOf(values,prototype);
      const nextLength=flag?2:3;values.length=nextLength;values[1]('{}');`,
    `const prototype=[];prototype[1]=JSON.parse;
      const values=[JSON.parse,JSON.parse];Object.setPrototypeOf(values,prototype);
      const nextLength=flag?1:2;values.length=nextLength;values[1]('{}');`,
    `const prototype=[];prototype[1]=eval;
      const values=[JSON.parse,JSON.parse];Object.setPrototypeOf(values,prototype);
      const nextLength=flag?1:2;values.length=nextLength;values[1]=JSON.parse;values[1]('{}');`,
    `const prototype=[];prototype[63]=eval;
      const values=Array(64).fill(JSON.parse);Object.setPrototypeOf(values,prototype);
      const nextLength=flag?64:65;values.length=nextLength;values[63]('{}');`,
    `const prototype=[];prototype[1]=eval;
      const values=[JSON.parse,JSON.parse];Object.setPrototypeOf(values,prototype);
      const nextValue=flag?1:2;values.size=nextValue;values[1]('{}');`,
  ];
  for (const [index, source] of safeCases.entries()) {
    assert.deepEqual(
      scanSource(source, `packages/example/src/safe-conditional-length-update-${index}.ts`),
      [],
      `safe conditional length control ${index} should retain bounded precision`
    );
  }

  const unknownScenarios = [
    {
      name: 'index 1',
      setup: `const prototype=[];prototype[1]=eval;
        const values=[JSON.parse,JSON.parse];Object.setPrototypeOf(values,prototype);`,
      invocation: 'values[1](configuredSource);',
    },
    {
      name: 'index 64',
      setup: `const prototype=[];prototype[64]=eval;
        const values=Array(65).fill(JSON.parse);Object.setPrototypeOf(values,prototype);`,
      invocation: 'values[64](configuredSource);',
    },
    {
      name: 'index 65',
      setup: `const prototype=[];prototype[65]=eval;
        const values=Array(66).fill(JSON.parse);Object.setPrototypeOf(values,prototype);`,
      invocation: 'values[65](configuredSource);',
    },
  ];
  for (const [scenarioIndex, scenario] of unknownScenarios.entries()) {
    for (const [mutationIndex, mutationCase] of mutationCases.entries()) {
      const source = `${mutationCase.prefix ?? ''}${scenario.setup}const nextLength=loadLength();
        ${mutationCase.mutation}${scenario.invocation}`;
      const relativePath = `packages/example/src/unknown-length-truncation-${scenarioIndex}-${mutationIndex}.ts`;
      const firstFindings = scanSource(source, relativePath);
      const secondFindings = scanSource(source, relativePath);
      assert.deepEqual(
        firstFindings,
        secondFindings,
        `${mutationCase.name}, unknown ${scenario.name} should be deterministic`
      );
      assert.ok(
        firstFindings.some(finding => finding.kind === 'direct-eval'),
        `${mutationCase.name}, unknown ${scenario.name} should retain inherited eval: ${JSON.stringify(firstFindings)}`
      );
      assert.ok(
        firstFindings.length <= 2,
        `${mutationCase.name}, unknown ${scenario.name} diagnostics should remain bounded`
      );
    }
  }
});

test('failed reflective indexed replacements preserve inherited callable provenance', () => {
  const failureModes = [
    {
      name: 'Reflect.set blocked by an inherited non-writable slot',
      prototype: index => `Object.defineProperty(prototype,'${index}',{value:eval,writable:false});`,
      mutation: (target, index) => `Reflect.set(${target},'${index}',JSON.parse)`,
    },
    {
      name: 'Reflect.set blocked by non-extensibility',
      prototype: index => `prototype[${index}]=eval;`,
      beforeMutation: 'Object.preventExtensions(values);',
      mutation: (target, index) => `Reflect.set(${target},'${index}',JSON.parse)`,
    },
    {
      name: 'Reflect.defineProperty blocked by non-extensibility',
      prototype: index => `prototype[${index}]=eval;`,
      beforeMutation: 'Object.preventExtensions(values);',
      mutation: (target, index) => `Reflect.defineProperty(${target},'${index}',{value:JSON.parse})`,
    },
  ];
  const paths = [
    {
      name: 'direct',
      prefix: () => '',
      mutation: (mode, index) => `${mode.mutation('values', index)};`,
    },
    {
      name: 'helper',
      prefix: (mode, index) => `function replace(value){${mode.mutation('value', index)}}`,
      mutation: () => 'replace(values);',
    },
  ];
  const failureCases = [1, 64, 65].flatMap(index =>
    failureModes.flatMap(mode =>
      paths.map(path => ({
        name: `${path.name} ${mode.name} at index ${index}`,
        index,
        prefix: path.prefix(mode, index),
        prototype: mode.prototype(index),
        beforeMutation: mode.beforeMutation ?? '',
        mutation: path.mutation(mode, index),
      }))
    )
  );

  for (const [caseIndex, failureCase] of failureCases.entries()) {
    const source = `${failureCase.prefix}const prototype=[];${failureCase.prototype}
      const values=Array(${failureCase.index}).fill(JSON.parse);Object.setPrototypeOf(values,prototype);
      ${failureCase.beforeMutation}${failureCase.mutation}
      values[${failureCase.index}](configuredSource);`;
    const relativePath = `packages/example/src/failed-reflective-indexed-replacement-${caseIndex}.ts`;
    const firstFindings = scanSource(source, relativePath);
    const secondFindings = scanSource(source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${failureCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(finding => finding.kind === 'direct-eval'),
      `${failureCase.name} should preserve inherited eval: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(
      firstFindings.some(
        finding => finding.kind === 'analysis-limit' && finding.reason === 'unknown-reflective-callable'
      ),
      `${failureCase.name} should retain reflective uncertainty: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${failureCase.name} diagnostics should remain bounded`);
  }
});

test('failed reflective indexed replacements execute isolated runtime markers', () => {
  const markerKey = '__a12_failed_reflective_replacement_marker__';
  const failureModes = [
    {
      name: 'set-inherited',
      prototype: index => `Object.defineProperty(prototype,'${index}',{value:eval,writable:false});`,
      mutation: (target, index) => `Reflect.set(${target},'${index}',JSON.parse)`,
    },
    {
      name: 'set-prevent',
      prototype: index => `prototype[${index}]=eval;`,
      beforeMutation: 'Object.preventExtensions(values);',
      mutation: (target, index) => `Reflect.set(${target},'${index}',JSON.parse)`,
    },
    {
      name: 'define-prevent',
      prototype: index => `prototype[${index}]=eval;`,
      beforeMutation: 'Object.preventExtensions(values);',
      mutation: (target, index) => `Reflect.defineProperty(${target},'${index}',{value:JSON.parse})`,
    },
  ];
  const paths = [
    {
      name: 'direct',
      prefix: () => '',
      mutation: (mode, index) => mode.mutation('values', index),
    },
    {
      name: 'helper',
      prefix: (mode, index) => `function replace(value){return ${mode.mutation('value', index)}}`,
      mutation: () => 'replace(values)',
    },
  ];
  const cases = [1, 64, 65].flatMap(index =>
    failureModes.flatMap(mode =>
      paths.map(path => ({
        name: `${mode.name}-${path.name}-${index}`,
        index,
        prefix: path.prefix(mode, index),
        prototype: mode.prototype(index),
        beforeMutation: mode.beforeMutation ?? '',
        mutation: path.mutation(mode, index),
      }))
    )
  );
  const branches = cases.map(
    failureCase => `{${failureCase.prefix}const prototype=[];${failureCase.prototype}
      const values=Array(${failureCase.index}).fill(JSON.parse);Object.setPrototypeOf(values,prototype);
      ${failureCase.beforeMutation}
      const succeeded=${failureCase.mutation};globalThis.${markerKey}.push('${failureCase.name}-write-'+succeeded);
      values[${failureCase.index}](mark('${failureCase.name}-eval'));}`
  );
  const source = [
    `globalThis.${markerKey}=[];`,
    `const mark=name=>"globalThis.${markerKey}.push("+JSON.stringify(name)+")";`,
    ...branches,
    `process.stdout.write(JSON.stringify(globalThis.${markerKey}));delete globalThis.${markerKey};`,
  ].join('\n');
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    JSON.parse(result.stdout),
    cases.flatMap(failureCase => [`${failureCase.name}-write-false`, `${failureCase.name}-eval`])
  );
});

test('provably successful reflective indexed replacements stay precise', () => {
  const successModes = [
    {
      name: 'Reflect.set on a fresh extensible target',
      setup: index => `const values=Array(${index});`,
      mutation: (target, index) => `Reflect.set(${target},'${index}',JSON.parse)`,
    },
    {
      name: 'Reflect.defineProperty on a fresh extensible target',
      setup: index => `const values=Array(${index});`,
      mutation: (target, index) => `Reflect.defineProperty(${target},'${index}',{value:JSON.parse})`,
    },
    {
      name: 'Reflect.set above a writable inherited descriptor',
      setup: index => `const prototype=[];
        Object.defineProperty(prototype,'${index}',{value:eval,writable:true});
        const values=Array(${index});Object.setPrototypeOf(values,prototype);`,
      mutation: (target, index) => `Reflect.set(${target},'${index}',JSON.parse)`,
    },
    {
      name: 'Reflect.defineProperty above a non-writable inherited descriptor',
      setup: index => `const prototype=[];
        Object.defineProperty(prototype,'${index}',{value:eval,writable:false});
        const values=Array(${index});Object.setPrototypeOf(values,prototype);`,
      mutation: (target, index) => `Reflect.defineProperty(${target},'${index}',{value:JSON.parse})`,
    },
  ];
  const paths = [
    {
      name: 'direct',
      prefix: () => '',
      mutation: (mode, index) => `${mode.mutation('values', index)};`,
    },
    {
      name: 'helper',
      prefix: (mode, index) => `function replace(value){${mode.mutation('value', index)}}`,
      mutation: () => 'replace(values);',
    },
  ];

  for (const [caseIndex, successCase] of [1, 64, 65]
    .flatMap(index =>
      successModes.flatMap(mode =>
        paths.map(path => ({
          name: `${path.name} ${mode.name} at index ${index}`,
          index,
          source: `${path.prefix(mode, index)}${mode.setup(index)}${path.mutation(mode, index)}
            values[${index}]('{}');`,
        }))
      )
    )
    .entries()) {
    assert.deepEqual(
      scanSource(successCase.source, `packages/example/src/safe-reflective-indexed-write-${caseIndex}.ts`),
      [],
      `${successCase.name} should retain a proven safe replacement`
    );
  }

  for (const [indexIndex, index] of [1, 64, 65].entries()) {
    for (const [modeIndex, mode] of successModes.slice(0, 2).entries()) {
      for (const [pathIndex, path] of paths.entries()) {
        const source = `${path.prefix(mode, index)}const prototype=[];prototype[${index}]=eval;
          const values=Array(${index + 1}).fill(JSON.parse);Object.setPrototypeOf(values,prototype);
          values.length=loadLength();${path.mutation(mode, index)}values[${index}]('{}');`;
        assert.deepEqual(
          scanSource(
            source,
            `packages/example/src/safe-unknown-length-reflective-write-${indexIndex}-${modeIndex}-${pathIndex}.ts`
          ),
          [],
          `${path.name} ${mode.name}, unknown length, index ${index} should clear only the proven slot`
        );
      }
    }
  }
});

test('provably successful reflective indexed replacements execute isolated runtime markers', () => {
  const markerKey = '__a12_successful_reflective_replacement_marker__';
  const modes = [
    {
      name: 'set-compatible',
      prototype: index => `Object.defineProperty(prototype,'${index}',{value:eval,writable:true});`,
      mutation: (target, index) => `Reflect.set(${target},'${index}',JSON.parse)`,
    },
    {
      name: 'define-compatible',
      prototype: index => `Object.defineProperty(prototype,'${index}',{value:eval,writable:false});`,
      mutation: (target, index) => `Reflect.defineProperty(${target},'${index}',{value:JSON.parse})`,
    },
  ];
  const paths = [
    {
      name: 'direct',
      prefix: () => '',
      mutation: (mode, index) => mode.mutation('values', index),
    },
    {
      name: 'helper',
      prefix: (mode, index) => `function replace(value){return ${mode.mutation('value', index)}}`,
      mutation: () => 'replace(values)',
    },
  ];
  const cases = [1, 64, 65].flatMap(index =>
    modes.flatMap(mode =>
      paths.map(path => ({
        name: `${mode.name}-${path.name}-${index}`,
        source: `{${path.prefix(mode, index)}const prototype=[];${mode.prototype(index)}
          const values=Array(${index});Object.setPrototypeOf(values,prototype);
          const succeeded=${path.mutation(mode, index)};
          globalThis.${markerKey}.push('${mode.name}-${path.name}-${index}-write-'+succeeded);
          values[${index}]('{}');
          globalThis.${markerKey}.push('${mode.name}-${path.name}-${index}-safe-'+
            (Object.hasOwn(values,'${index}')&&values[${index}]===JSON.parse));}`,
      }))
    )
  );
  const source = [
    `globalThis.${markerKey}=[];`,
    ...cases.map(successCase => successCase.source),
    `process.stdout.write(JSON.stringify(globalThis.${markerKey}));delete globalThis.${markerKey};`,
  ].join('\n');
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    JSON.parse(result.stdout),
    cases.flatMap(successCase => [`${successCase.name}-write-true`, `${successCase.name}-safe-true`])
  );
});

test('opaque length writes are superseded by later strong indexed replacements', () => {
  const mutationCases = [
    ['direct assignment', '', 'values.length=nextLength;'],
    [
      'helper-forwarded assignment',
      'function setLength(value,length){value.length=length}',
      'setLength(values,nextLength);',
    ],
    ['Reflect.set', '', "Reflect.set(values,'length',nextLength);"],
    ['Object.assign', '', 'Object.assign(values,{length:nextLength});'],
    ['Object.defineProperty', '', "Object.defineProperty(values,'length',{value:nextLength});"],
    ['Reflect.defineProperty', '', "Reflect.defineProperty(values,'length',{value:nextLength});"],
    ['Object.defineProperties', '', 'Object.defineProperties(values,{length:{value:nextLength}});'],
  ];
  const replacementCases = [
    ['direct replacement', '', 'values[replacementIndex]=JSON.parse;'],
    [
      'helper-forwarded replacement',
      'function replaceIndex(value,index){value[index]=JSON.parse}',
      'replaceIndex(values,replacementIndex);',
    ],
  ];
  const scenarios = [
    ['index 1', 1],
    ['index 64', 64],
    ['index 65', 65],
  ];

  for (const [scenarioIndex, [scenarioName, replacementIndex]] of scenarios.entries()) {
    for (const [mutationIndex, [mutationName, mutationPrefix, mutation]] of mutationCases.entries()) {
      for (const [
        replacementCaseIndex,
        [replacementName, replacementPrefix, replacement],
      ] of replacementCases.entries()) {
        const source = `${mutationPrefix}${replacementPrefix}const replacementIndex=${replacementIndex};
          const prototype=[];prototype[replacementIndex]=eval;
          const values=Array(replacementIndex+1).fill(JSON.parse);Object.setPrototypeOf(values,prototype);
          const nextLength=loadLength();${mutation}${replacement}values[replacementIndex]('{}');`;
        const relativePath = `packages/example/src/safe-opaque-length-replacement-${scenarioIndex}-${mutationIndex}-${replacementCaseIndex}.ts`;
        const firstFindings = scanSource(source, relativePath);
        const secondFindings = scanSource(source, relativePath);
        assert.deepEqual(
          firstFindings,
          secondFindings,
          `${mutationName}, ${replacementName}, ${scenarioName} should be deterministic`
        );
        assert.deepEqual(
          firstFindings,
          [],
          `${mutationName}, ${replacementName}, ${scenarioName} should retain only the later definite slot replacement`
        );
      }
    }
  }

  const unresolvedScenarios = [
    [1, 2],
    [64, 65],
    [65, 64],
  ];
  for (const [scenarioIndex, [replacementIndex, unresolvedIndex]] of unresolvedScenarios.entries()) {
    const source = `const prototype=[];prototype[${replacementIndex}]=eval;prototype[${unresolvedIndex}]=eval;
      const values=Array(${Math.max(replacementIndex, unresolvedIndex) + 1}).fill(JSON.parse);
      Object.setPrototypeOf(values,prototype);values.length=loadLength();
      values[${replacementIndex}]=JSON.parse;values[${unresolvedIndex}](configuredSource);`;
    const relativePath = `packages/example/src/unresolved-opaque-length-replacement-control-${scenarioIndex}.ts`;
    const firstFindings = scanSource(source, relativePath);
    const secondFindings = scanSource(source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `unresolved slot control ${scenarioIndex} should be deterministic`);
    assert.ok(firstFindings.some(finding => finding.kind === 'direct-eval'));
    assert.ok(
      firstFindings.some(
        finding => finding.kind === 'analysis-limit' && finding.reason === 'unknown-reflective-callable'
      )
    );
    assert.ok(firstFindings.length <= 2, `unresolved slot control ${scenarioIndex} should remain bounded`);
  }
});

test('later strong replacements supersede earlier conditional length-write uncertainty', () => {
  const mutationCases = [
    ['conditional direct write', '', 'if(flag)values.length=loadLength();'],
    ['conditional helper call', 'function setLength(value){value.length=loadLength()}', 'if(flag)setLength(values);'],
    ['conditional helper body', 'function setLength(value){if(flag)value.length=loadLength()}', 'setLength(values);'],
  ];
  const replacementCases = [
    ['direct replacement', '', 'values[replacementIndex]=JSON.parse;'],
    [
      'helper-forwarded replacement',
      'function replaceIndex(value,index){value[index]=JSON.parse}',
      'replaceIndex(values,replacementIndex);',
    ],
  ];

  for (const [scenarioIndex, replacementIndex] of [1, 64, 65].entries()) {
    for (const [mutationIndex, [mutationName, mutationPrefix, mutation]] of mutationCases.entries()) {
      for (const [
        replacementCaseIndex,
        [replacementName, replacementPrefix, replacement],
      ] of replacementCases.entries()) {
        const source = `${mutationPrefix}${replacementPrefix}const replacementIndex=${replacementIndex};
          const prototype=[];prototype[replacementIndex]=eval;
          const values=Array(replacementIndex+1).fill(JSON.parse);Object.setPrototypeOf(values,prototype);
          ${mutation}${replacement}values[replacementIndex]('{}');`;
        const relativePath = `packages/example/src/safe-conditional-length-replacement-${scenarioIndex}-${mutationIndex}-${replacementCaseIndex}.ts`;
        const firstFindings = scanSource(source, relativePath);
        const secondFindings = scanSource(source, relativePath);
        assert.deepEqual(
          firstFindings,
          secondFindings,
          `${mutationName}, ${replacementName}, index ${replacementIndex} should be deterministic`
        );
        assert.deepEqual(
          firstFindings,
          [],
          `${mutationName}, ${replacementName}, index ${replacementIndex} should retain the later strong write`
        );
      }
    }
  }

  for (const [scenarioIndex, replacementIndex] of [1, 64, 65].entries()) {
    for (const [mutationIndex, [mutationName, mutationPrefix, mutation]] of mutationCases.entries()) {
      const source = `${mutationPrefix}const replacementIndex=${replacementIndex};
        const prototype=[];prototype[replacementIndex]=eval;
        const values=Array(replacementIndex+1).fill(JSON.parse);Object.setPrototypeOf(values,prototype);
        ${mutation}values[replacementIndex](configuredSource);`;
      const relativePath = `packages/example/src/unresolved-conditional-length-control-${scenarioIndex}-${mutationIndex}.ts`;
      const firstFindings = scanSource(source, relativePath);
      const secondFindings = scanSource(source, relativePath);
      assert.deepEqual(
        firstFindings,
        secondFindings,
        `${mutationName}, unresolved index ${replacementIndex} should be deterministic`
      );
      assert.ok(
        firstFindings.some(finding => finding.kind === 'direct-eval'),
        `${mutationName}, unresolved index ${replacementIndex} should retain eval: ${JSON.stringify(firstFindings)}`
      );
      assert.ok(
        firstFindings.some(
          finding => finding.kind === 'analysis-limit' && finding.reason === 'unknown-reflective-callable'
        ),
        `${mutationName}, unresolved index ${replacementIndex} should retain uncertainty: ${JSON.stringify(firstFindings)}`
      );
      assert.ok(firstFindings.length <= 2, `${mutationName}, unresolved index ${replacementIndex} should be bounded`);
    }
  }
});

test('Object.defineProperties applies integer-index descriptors before a later length descriptor', () => {
  const cases = [
    {
      name: 'index 1',
      source: `const prototype=[];prototype[1]=eval;
        const values=[JSON.parse,JSON.parse];Object.setPrototypeOf(values,prototype);
        Object.defineProperties(values,{
          length:{value:flag?1:2},
          1:{value:JSON.parse,configurable:true,writable:true}
        });
        values[1](configuredSource);`,
    },
    {
      name: 'index 64',
      source: `const prototype=[];prototype[64]=eval;
        const values=Array(65).fill(JSON.parse);Object.setPrototypeOf(values,prototype);
        Object.defineProperties(values,{
          length:{value:flag?64:65},
          64:{value:JSON.parse,configurable:true,writable:true}
        });
        values[64](configuredSource);`,
    },
  ];

  for (const [index, descriptorCase] of cases.entries()) {
    const relativePath = `packages/example/src/define-properties-own-key-order-${index}.ts`;
    const firstFindings = scanSource(descriptorCase.source, relativePath);
    const secondFindings = scanSource(descriptorCase.source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${descriptorCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(finding => finding.kind === 'direct-eval'),
      `${descriptorCase.name} should expose inherited eval: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${descriptorCase.name} diagnostics should remain bounded`);
  }
});

test('opaque length replacements and descriptor own-key ordering execute isolated runtime markers', () => {
  const markerKey = '__a12_length_replacement_and_order_marker__';
  const mutationCases = [
    ['direct', '', 'values.length=nextLength;'],
    ['helper', 'function setLength(value,length){value.length=length}', 'setLength(values,nextLength);'],
    ['reflect-set', '', "Reflect.set(values,'length',nextLength);"],
    ['assign', '', 'Object.assign(values,{length:nextLength});'],
    ['define', '', "Object.defineProperty(values,'length',{value:nextLength});"],
    ['reflect-define', '', "Reflect.defineProperty(values,'length',{value:nextLength});"],
    ['defines', '', 'Object.defineProperties(values,{length:{value:nextLength}});'],
  ];
  const replacementBranches = [1, 64, 65].flatMap(index =>
    mutationCases.map(
      ([name, prefix, mutation]) => `{${prefix}const prototype=[];prototype[${index}]=eval;
        const values=Array(${index + 1}).fill(JSON.parse);Object.setPrototypeOf(values,prototype);
        const nextLength=loadLength();${mutation}values[${index}]=JSON.parse;values[${index}]('{}');
        globalThis.${markerKey}.push('${name}-${index}-safe')}`
    )
  );
  const descriptorOrderBranches = [
    [1, 2],
    [64, 65],
  ].flatMap(([index, retainedLength]) =>
    [true, false].map(
      flag => `{const flag=${flag};const prototype=[];prototype[${index}]=eval;
        const values=Array(${retainedLength}).fill(JSON.parse);Object.setPrototypeOf(values,prototype);
        Object.defineProperties(values,{
          length:{value:flag?${index}:${retainedLength}},
          ${index}:{value:JSON.parse,configurable:true,writable:true}
        });
        if(flag)values[${index}](mark('index-${index}-unsafe'));
        else{values[${index}]('{}');globalThis.${markerKey}.push('index-${index}-safe')}}`
    )
  );
  const source = [
    `globalThis.${markerKey}=[];`,
    'const loadLength=()=>1;',
    `const mark=name=>"globalThis.${markerKey}.push("+JSON.stringify(name)+")";`,
    ...replacementBranches,
    ...descriptorOrderBranches,
    `process.stdout.write(JSON.stringify(globalThis.${markerKey}));delete globalThis.${markerKey};`,
  ].join('\n');
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    ...[1, 64, 65].flatMap(index => mutationCases.map(([name]) => `${name}-${index}-safe`)),
    'index-1-unsafe',
    'index-1-safe',
    'index-64-unsafe',
    'index-64-safe',
  ]);
});

test('conditional length alternatives execute vulnerable and safe runtime branches', () => {
  const markerKey = '__a12_conditional_length_truncation_marker__';
  const mutationCases = [
    ['direct', '', 'values.length=nextLength;'],
    ['helper', 'function setLength(value,length){value.length=length}', 'setLength(values,nextLength);'],
    ['reflect-set', '', "Reflect.set(values,'length',nextLength);"],
    ['assign', '', 'Object.assign(values,{length:nextLength});'],
    ['define', '', "Object.defineProperty(values,'length',{value:nextLength});"],
    ['reflect-define', '', "Reflect.defineProperty(values,'length',{value:nextLength});"],
    ['defines', '', 'Object.defineProperties(values,{length:{value:nextLength}});'],
  ];
  const branches = mutationCases.flatMap(([name, prefix, mutation]) =>
    [true, false].map(
      flag => `{${prefix}const flag=${flag};const prototype=[];prototype[1]=eval;
        const values=[JSON.parse,JSON.parse];Object.setPrototypeOf(values,prototype);
        const nextLength=flag?1:2;${mutation}
        if(flag)values[1](mark('${name}-unsafe'));
        else{values[1]('{}');globalThis.${markerKey}.push('${name}-safe')}}`
    )
  );
  branches.push(`{for(const flag of [true,false]){const prototype=[];prototype[64]=eval;
    const values=Array(65).fill(JSON.parse);Object.setPrototypeOf(values,prototype);
    const nextLength=flag?64:65;values.length=nextLength;
    if(flag)values[64](mark('index-64-unsafe'));
    else{values[64]('{}');globalThis.${markerKey}.push('index-64-safe')}}}`);
  branches.push(`{for(const flag of [true,false]){const prototype=[];prototype[65]=eval;
    const values=Array(66).fill(JSON.parse);Object.setPrototypeOf(values,prototype);
    const nextLength=flag?64:65;values.length=nextLength;
    if(flag)values[65](mark('index-65-unsafe'));
    else{values[64]('{}');globalThis.${markerKey}.push('index-65-safe')}}}`);
  const source = [
    `globalThis.${markerKey}=[];`,
    `const mark=name=>"globalThis.${markerKey}.push("+JSON.stringify(name)+")";`,
    ...branches,
    `process.stdout.write(JSON.stringify(globalThis.${markerKey}));delete globalThis.${markerKey};`,
  ].join('\n');
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    ...mutationCases.flatMap(([name]) => [`${name}-unsafe`, `${name}-safe`]),
    'index-64-unsafe',
    'index-64-safe',
    'index-65-unsafe',
    'index-65-safe',
  ]);
});

test('deterministic length truncation mechanisms execute isolated runtime markers', () => {
  const markerKey = '__a12_length_truncation_marker__';
  const source = [
    `globalThis.${markerKey}=[];`,
    `const mark=name=>"globalThis.${markerKey}.push("+JSON.stringify(name)+")";`,
    "{const p=[];p[1]=eval;const v=[JSON.parse,JSON.parse];Object.setPrototypeOf(v,p);v.length=1;v[1](mark('direct'));}",
    "{const p=[];p[64]=eval;const v=Array(65).fill(JSON.parse);Object.setPrototypeOf(v,p);v.length=64;v[64](mark('index-64'));}",
    "{function truncate(v){v.length=1}const p=[];p[1]=eval;const v=[JSON.parse,JSON.parse];Object.setPrototypeOf(v,p);truncate(v);v[1](mark('helper'));}",
    "{const p=[];p[1]=eval;const v=[JSON.parse,JSON.parse];Object.setPrototypeOf(v,p);Reflect.set(v,'length',1);v[1](mark('reflect-set'));}",
    "{const p=[];p[1]=eval;const v=[JSON.parse,JSON.parse];Object.setPrototypeOf(v,p);Object.assign(v,{length:1});v[1](mark('assign'));}",
    "{const p=[];p[1]=eval;const v=[JSON.parse,JSON.parse];Object.setPrototypeOf(v,p);Object.defineProperty(v,'length',{value:1});v[1](mark('define'));}",
    "{const p=[];p[1]=eval;const v=[JSON.parse,JSON.parse];Object.setPrototypeOf(v,p);Reflect.defineProperty(v,'length',{value:1});v[1](mark('reflect-define'));}",
    "{const p=[];p[1]=eval;const v=[JSON.parse,JSON.parse];Object.setPrototypeOf(v,p);Object.defineProperties(v,{length:{value:1}});v[1](mark('defines'));}",
    `process.stdout.write(JSON.stringify(globalThis.${markerKey}));delete globalThis.${markerKey};`,
  ].join('\n');
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    'direct',
    'index-64',
    'helper',
    'reflect-set',
    'assign',
    'define',
    'reflect-define',
    'defines',
  ]);
});

test('sparse inherited values materialize as bounded own properties across array mutations', () => {
  const safeCases = [
    `const prototype=[];prototype[64]=eval;prototype[65]=JSON.parse;
      const values=Array(66);Object.setPrototypeOf(values,prototype);
      values.shift();values[64]('{}');`,
    `const prototype=[];prototype[64]=eval;prototype[65]=JSON.parse;
      const values=Array(66);Object.setPrototypeOf(values,prototype);
      Array.prototype.splice.call(values,64,1);values[64]('{}');`,
    `const prototype=[];prototype[0]=JSON.parse;prototype[64]=eval;
      const values=Array(65);Object.setPrototypeOf(values,prototype);
      Reflect.apply(Array.prototype.copyWithin,values,[64,0,1]);values[64]('{}');`,
    `function move(value){value.reverse()}const prototype=[];prototype[0]=JSON.parse;prototype[64]=eval;
      const values=Array(65);const alias=values;Object.setPrototypeOf(alias,prototype);
      move(alias);values[64]('{}');`,
    `function move(value,...args){value.splice(...args)}
      const prototype=[];prototype[64]=eval;prototype[65]=JSON.parse;
      const values=Array(66);Object.setPrototypeOf(values,prototype);
      const args=flag?[64,1]:[64,1];move(values,...args);values[64]('{}');`,
  ];
  for (const [index, source] of safeCases.entries()) {
    const relativePath = `packages/example/src/safe-inherited-materialization-${index}.ts`;
    const firstFindings = scanSource(source, relativePath);
    const secondFindings = scanSource(source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `safe materialization ${index} should be deterministic`);
    assert.deepEqual(firstFindings, [], `safe materialization ${index} should invoke only JSON.parse`);
  }

  const unsafeCases = [
    `const prototype=[];prototype[64]=JSON.parse;prototype[65]=eval;
      const values=Array(66);Object.setPrototypeOf(values,prototype);
      values.shift();values[64](configuredSource);`,
    `const prototype=[];prototype[64]=JSON.parse;prototype[65]=eval;
      const values=Array(66);Object.setPrototypeOf(values,prototype);
      Array.prototype.splice.call(values,64,1);values[64](configuredSource);`,
    `const prototype=[];prototype[0]=eval;prototype[64]=JSON.parse;
      const values=Array(65);Object.setPrototypeOf(values,prototype);
      Reflect.apply(Array.prototype.copyWithin,values,[64,0,1]);values[64](configuredSource);`,
    `function move(value){value.reverse()}const prototype=[];prototype[0]=eval;
      const values=Array(65);Object.setPrototypeOf(values,prototype);
      move(values);values[64](configuredSource);`,
    `const prototype=[];prototype[64]=eval;prototype[65]=JSON.parse;
      const values=Array(66);Object.setPrototypeOf(values,prototype);
      const other=Array(66).fill(JSON.parse);(flag?values:other).shift();
      values[64](configuredSource);`,
    `const prototype=[];prototype[64]=eval;prototype[65]=JSON.parse;
      const values=Array(66);Object.setPrototypeOf(values,prototype);
      const args=flag?[64,1]:[64,0];values.splice(...args);values[64](configuredSource);`,
  ];
  for (const [index, source] of unsafeCases.entries()) {
    const findings = scanSource(source, `packages/example/src/unsafe-inherited-materialization-${index}.ts`);
    assert.ok(
      findings.some(finding => finding.kind === 'direct-eval'),
      `unsafe materialization ${index} should retain inherited eval: ${JSON.stringify(findings)}`
    );
    assert.ok(findings.length <= 2, `unsafe materialization ${index} diagnostics should remain bounded`);
  }
});

test('sparse inherited safe materializations execute only JSON.parse', () => {
  const markerKey = '__a12_inherited_materialization_marker__';
  const source = [
    `globalThis.${markerKey}=[];const parse=JSON.parse;`,
    `JSON.parse=value=>{globalThis.${markerKey}.push('safe');return parse(value)};`,
    "{const p=[];p[64]=eval;p[65]=JSON.parse;const v=Array(66);Object.setPrototypeOf(v,p);v.shift();v[64]('{}');}",
    "{const p=[];p[64]=eval;p[65]=JSON.parse;const v=Array(66);Object.setPrototypeOf(v,p);Array.prototype.splice.call(v,64,1);v[64]('{}');}",
    "{const p=[];p[0]=JSON.parse;p[64]=eval;const v=Array(65);Object.setPrototypeOf(v,p);Reflect.apply(Array.prototype.copyWithin,v,[64,0,1]);v[64]('{}');}",
    "{function move(v){v.reverse()}const p=[];p[0]=JSON.parse;p[64]=eval;const v=Array(65);Object.setPrototypeOf(v,p);move(v);v[64]('{}');}",
    `JSON.parse=parse;process.stdout.write(JSON.stringify(globalThis.${markerKey}));
      delete globalThis.${markerKey};`,
  ].join('\n');
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['safe', 'safe', 'safe', 'safe']);
});

test('bounded overflow mutations preserve precise known tracked positions', () => {
  const safeTail = Array.from({ length: 63 }, (_, index) => String(index + 1)).join(',');
  const safeCases = [
    `const values = [JSON.parse, ${safeTail}, eval];
      values.copyWithin(1, 0, 1); values[0]('{}');`,
    `const values = [JSON.parse, ${safeTail}, eval];
      values.fill(eval, 1, 2); values[0]('{}');`,
    `const values = [JSON.parse, ${safeTail}, eval];
      values.splice(1, 0, eval); values[0]('{}');`,
    `const values = [eval, JSON.parse, ${safeTail}, eval];
      values.copyWithin(0, 1, 2); values[0]('{}');`,
    `const values = [eval, ${safeTail}, eval];
      values.fill(JSON.parse, 0, 1); values[0]('{}');`,
    `const values = [eval, ${safeTail}, eval];
      values.splice(0, 1, JSON.parse); values[0]('{}');`,
    `const values = [JSON.parse, ${safeTail}, eval];
      values.fill(eval, -1); values[0]('{}');`,
    `const values = [JSON.parse, ${safeTail}, eval];
      values.copyWithin(-1, 64, 65); values[0]('{}');`,
    `const values = [JSON.parse, ${safeTail}, eval];
      values.copyWithin(-1, 0, 1); values[0]('{}');`,
    `const values = [JSON.parse, ${safeTail}, eval];
      values.splice(-1, 0, eval); values[0]('{}');`,
    `const values = [JSON.parse, ${safeTail}, eval];
      values.splice(64); values[0]('{}');`,
    `const values = [JSON.parse, ${safeTail}, eval];
      values.splice(1); values[0]('{}');`,
    `const values = [JSON.parse, ${safeTail}, eval];
      values.copyWithin(-1, 0, 1); values[64]('{}');`,
  ];
  for (const [index, source] of safeCases.entries()) {
    const relativePath = `packages/example/src/safe-bounded-overflow-${index}.ts`;
    const firstFindings = scanSource(source, relativePath);
    const secondFindings = scanSource(source, relativePath);
    assert.deepEqual(firstFindings, secondFindings, `bounded safe position ${index} should be deterministic`);
    assert.deepEqual(firstFindings, [], `bounded safe position ${index} should remain precise`);
  }

  const failClosedCases = [
    `const values = [JSON.parse, ${safeTail}, eval];
      values.copyWithin(0, 64, 65); values[0](configuredSource);`,
    `const values = [JSON.parse, ${safeTail}, eval];
      values.fill(eval, 64); values[64](configuredSource);`,
    `const values = [JSON.parse, ${safeTail}, eval];
      values.splice(64, 0, eval); values[64](configuredSource);`,
    `const values = [JSON.parse, ${safeTail}, eval];
      values.fill(eval, -1); values[64](configuredSource);`,
    `const values = [JSON.parse, ${safeTail}, eval];
      values.copyWithin(-1, 64, 65); values[64](configuredSource);`,
    `const values = [JSON.parse, ${safeTail}, eval];
      values.splice(-1, 0, eval); values[64](configuredSource);`,
  ];
  for (const [index, source] of failClosedCases.entries()) {
    const findings = scanSource(source, `packages/example/src/fail-closed-overflow-${index}.ts`);
    assert.ok(
      findings.some(finding => finding.kind === 'analysis-limit' && finding.reason === 'unknown-reflective-callable'),
      `overflow position ${index} should remain fail closed: ${JSON.stringify(findings)}`
    );
    assert.ok(findings.length <= 2, `overflow position ${index} diagnostics should remain bounded`);
  }
});

test('bounded overflow safe positions execute only JSON.parse', () => {
  const markerKey = '__a12_bounded_overflow_marker__';
  const serializedMarkerKey = JSON.stringify(markerKey);
  const safeTail = Array.from({ length: 63 }, () => 'null').join(',');
  const source = `
    globalThis[${serializedMarkerKey}] = [];
    const parse = JSON.parse;
    JSON.parse = source => { globalThis[${serializedMarkerKey}].push('safe'); return parse(source); };
    { const values = [JSON.parse, ${safeTail}, eval]; values.copyWithin(1, 0, 1); values[0]('{}'); }
    { const values = [JSON.parse, ${safeTail}, eval]; values.fill(eval, 1, 2); values[0]('{}'); }
    { const values = [JSON.parse, ${safeTail}, eval]; values.splice(1, 0, eval); values[0]('{}'); }
    { const values = [JSON.parse, ${safeTail}, eval]; values.fill(eval, -1); values[0]('{}'); }
    { const values = [JSON.parse, ${safeTail}, eval]; values.copyWithin(-1, 64, 65); values[0]('{}'); }
    { const values = [JSON.parse, ${safeTail}, eval]; values.copyWithin(-1, 0, 1); values[0]('{}'); }
    { const values = [JSON.parse, ${safeTail}, eval]; values.splice(-1, 0, eval); values[0]('{}'); }
    { const values = [JSON.parse, ${safeTail}, eval]; values.splice(64); values[0]('{}'); }
    { const values = [JSON.parse, ${safeTail}, eval]; values.splice(1); values[0]('{}'); }
    { const values = [JSON.parse, ${safeTail}, eval]; values.copyWithin(-1, 0, 1); values[64]('{}'); }
    JSON.parse = parse;
    process.stdout.write(JSON.stringify(globalThis[${serializedMarkerKey}]));
    delete globalThis[${serializedMarkerKey}];
  `;
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    'safe',
    'safe',
    'safe',
    'safe',
    'safe',
    'safe',
    'safe',
    'safe',
    'safe',
    'safe',
  ]);
});

test('negative overflow mutations execute unsafe tail values without touching the safe prefix', () => {
  const markerKey = '__a12_negative_overflow_marker__';
  const serializedMarkerKey = JSON.stringify(markerKey);
  const safeTail = Array.from({ length: 63 }, () => 'null').join(',');
  const source = `
    globalThis[${serializedMarkerKey}] = [];
    const mark = name => \`globalThis[${serializedMarkerKey}].push(\${JSON.stringify(name)})\`;
    { const values = [JSON.parse, ${safeTail}, eval]; values.fill(eval, -1);
      values[64](mark('fill')); }
    { const values = [JSON.parse, ${safeTail}, eval]; values.copyWithin(-1, 64, 65);
      values[64](mark('copyWithin')); }
    { const values = [JSON.parse, ${safeTail}, eval]; values.splice(-1, 0, eval);
      values[64](mark('splice')); }
    process.stdout.write(JSON.stringify(globalThis[${serializedMarkerKey}]));
    delete globalThis[${serializedMarkerKey}];
  `;
  const result = spawnSync(process.execPath, ['--eval', source], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['fill', 'copyWithin', 'splice']);
});

test('invocation-local effect summaries stop at one deterministic bounded diagnostic', t => {
  const source = [
    'function mutate(value) {',
    ...Array.from({ length: 8500 }, () => 'value;'),
    'value.pop();',
    '}',
    'const prefix = [null]; mutate(prefix);',
    'Reflect.apply(...prefix, eval, globalThis, [configuredSource]);',
  ].join('\n');
  const relativePath = 'packages/example/src/invocation-effect-limit.ts';
  const startedAt = performance.now();
  const firstFindings = scanSource(source, relativePath);
  const secondFindings = scanSource(source, relativePath);
  const elapsedMilliseconds = performance.now() - startedAt;

  assert.deepEqual(firstFindings, secondFindings);
  assert.deepEqual(
    firstFindings.map(finding => [finding.kind, finding.reason]),
    [['analysis-limit', 'invocation-effect-limit']]
  );
  assert.ok(elapsedMilliseconds < 3000, `two bounded effect-summary scans took ${Math.round(elapsedMilliseconds)}ms`);

  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = invokeGuardWithTrackedSources(root, [{ relativePath, source }], ['--max-old-space-size=128']);
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /analysis-limit .*\(invocation-effect-limit\)/);
  assert.doesNotMatch(result.stderr, /heap out of memory|SIGABRT|allocation failure|RangeError/i);
  assert.ok(Buffer.byteLength(result.stderr) < 4096, `effect diagnostics were ${result.stderr.length} bytes`);
});

test('the guard CLI rejects mapper, collection-iteration, and local-effect review cases', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const reviewCases = [
    mapperReviewCases[0],
    mapperReviewCases[1],
    collectionIterationReviewCases[0],
    collectionIterationReviewCases[1],
    sideEffectFunctionReviewCases[0],
    sideEffectFunctionReviewCases[1],
  ];
  const sources = reviewCases.map((reviewCase, index) => ({
    relativePath: `packages/example/src/final-review-${index}.ts`,
    source: reviewCase.source,
  }));
  const result = invokeGuardWithTrackedSources(root, sources);

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  for (const { relativePath } of sources) {
    assert.ok(result.stderr.includes(`Unexpected unsafe execution: ${relativePath}:`), result.stderr);
  }
  assert.ok(Buffer.byteLength(result.stderr) < 8192, `review diagnostics were ${result.stderr.length} bytes`);
});

test('the production npm lint path rejects the minimal eval and Lodash review cases', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const reviewCases = [mapperReviewCases[0], collectionIterationReviewCases[1], sideEffectFunctionReviewCases[0]];
  const sources = reviewCases.map((reviewCase, index) => ({
    relativePath: `packages/example/src/production-final-review-${index}.ts`,
    source: reviewCase.source,
  }));
  const result = invokeNpmLintWithTrackedSources(root, sources);

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  for (const { relativePath } of sources) {
    assert.ok(result.stderr.includes(`Unexpected unsafe execution: ${relativePath}:`), result.stderr);
  }
});

test('the guard CLI accepts safe mapper, collection, and local-effect controls', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = safeMapperCollectionAndEffectCases.map((safeCase, index) => ({
    relativePath: `packages/example/src/safe-final-review-${index}.ts`,
    source: safeCase.source,
  }));
  const result = invokeGuardWithTrackedSources(root, sources);

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

test('deleting safe intrinsic own properties exposes tracked prototype callables', () => {
  for (const deletionCase of unsafeIntrinsicDeletionCases) {
    const findings = scanSource(deletionCase.source, 'packages/example/src/intrinsic-deletion.ts');
    assert.ok(
      findings.some(finding => finding.kind === deletionCase.kind),
      `${deletionCase.name} should expose unsafe prototype provenance: ${JSON.stringify(findings)}`
    );
  }
});

test('unknown plural descriptor maps and data spreads fail closed only at invocation', () => {
  for (const descriptorCase of unknownDescriptorMapInvocationCases) {
    const firstFindings = scanSource(descriptorCase.source, 'packages/example/src/unknown-descriptor-map.ts');
    const secondFindings = scanSource(descriptorCase.source, 'packages/example/src/unknown-descriptor-map.ts');
    assert.deepEqual(firstFindings, secondFindings, `${descriptorCase.name} should be deterministic`);
    assert.deepEqual(
      firstFindings.map(finding => finding.kind),
      ['analysis-limit'],
      `${descriptorCase.name} should produce one fail-closed finding`
    );
    assert.ok(
      ['unknown-reflect-target', 'unknown-reflective-callable'].includes(firstFindings[0].reason),
      `${descriptorCase.name} reported an unexpected reason: ${JSON.stringify(firstFindings)}`
    );
  }
});

test('built-in callable lookup follows bounded effective prototype chains', () => {
  for (const prototypeCase of builtinPrototypeCallableCases) {
    const findings = scanSource(prototypeCase.source, 'packages/example/src/builtin-prototype.ts');
    assert.ok(
      findings.some(finding => finding.kind === prototypeCase.kind),
      `${prototypeCase.name} should preserve callable provenance: ${JSON.stringify(findings)}`
    );
    if (prototypeCase.kind === 'analysis-limit') {
      assert.ok(findings.some(finding => finding.reason === 'unknown-reflective-callable'));
    }
  }
});

test('replacement iterator execution propagates receiver mutations at every iteration boundary', () => {
  for (const iteratorCase of iteratorReceiverMutationCases) {
    const firstFindings = scanSource(iteratorCase.source, 'packages/example/src/iterator-receiver.ts');
    const secondFindings = scanSource(iteratorCase.source, 'packages/example/src/iterator-receiver.ts');
    assert.deepEqual(firstFindings, secondFindings, `${iteratorCase.name} should be deterministic`);
    assert.ok(
      firstFindings.some(
        finding =>
          finding.kind === 'direct-eval' ||
          (finding.kind === 'analysis-limit' && finding.reason === 'positional-layout-limit')
      ),
      `${iteratorCase.name} should propagate mutation or fail closed: ${JSON.stringify(firstFindings)}`
    );
    assert.ok(firstFindings.length <= 2, `${iteratorCase.name} diagnostics should stay bounded`);
  }
});

test('known-safe accessor, built-in own-property, and iterator cases remain clean', () => {
  for (const safeCase of safeAccessorAndBuiltinPrototypeCases) {
    assert.deepEqual(
      scanSource(safeCase.source, 'packages/example/src/safe-accessor-prototype.ts'),
      [],
      `${safeCase.name} should not produce a finding`
    );
  }
});

test('the guard CLI rejects returned reflection, inserted carriers, and unknown reflective lookups', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = [
    ...returnedReflectiveTargetCases,
    ...returnedLocalAliasCases,
    ...positionalInsertionCases,
    ...unknownSingularReflectiveInvocationCases,
    ...unsafeIntrinsicDeletionCases,
    ...unknownDescriptorMapInvocationCases,
  ].map((reviewCase, index) => ({
    relativePath: `packages/example/src/focused-security-fix-${index}.ts`,
    source: reviewCase.source,
  }));
  const result = invokeGuardWithTrackedSources(root, sources);

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  for (const { relativePath } of sources) {
    assert.ok(result.stderr.includes(`Unexpected unsafe execution: ${relativePath}:`), result.stderr);
  }
  assert.ok(
    Buffer.byteLength(result.stderr) <= maximumDiagnosticOutputBytes,
    `focused security diagnostics were ${Buffer.byteLength(result.stderr)} bytes`
  );
});

test('the guard CLI rejects the reviewed reflective mutation paths', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = reviewedReflectiveMutationCases.map((reviewCase, index) => ({
    relativePath: `packages/example/src/reflective-mutation-${index}.ts`,
    source: reviewCase.source,
  }));
  const result = invokeGuardWithTrackedSources(root, sources);

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /analysis-limit .*\(positional-layout-limit\)/);
  for (const { relativePath } of sources) {
    assert.ok(result.stderr.includes(`Unexpected unsafe execution: ${relativePath}:`), result.stderr);
  }
});

test('the guard CLI accepts known-safe reflective carrier operations', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = safeReflectiveCarrierCases.map((safeCase, index) => ({
    relativePath: `packages/example/src/safe-reflective-carrier-${index}.ts`,
    source: safeCase.source,
  }));
  const result = invokeGuardWithTrackedSources(root, sources);

  assert.equal(result.status, 0, result.stderr);
});

test('the guard CLI accepts known-safe plural descriptor targets', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = safePluralDescriptorTargetCases.map((safeCase, index) => ({
    relativePath: `packages/example/src/safe-plural-descriptor-${index}.ts`,
    source: safeCase.source,
  }));
  const result = invokeGuardWithTrackedSources(root, sources);

  assert.equal(result.status, 0, result.stderr);
});

test('the production lint path rejects every final accessor, descriptor, prototype, and iterator review class', t => {
  assert.equal(productionFinalReviewCases.length, 7);
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = productionFinalReviewCases.map((reviewCase, index) => ({
    relativePath: `packages/example/src/final-security-review-${index}.ts`,
    source: reviewCase.source,
  }));
  const result = invokeNpmLintWithTrackedSources(root, sources);

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  for (const { relativePath } of sources) {
    assert.ok(result.stderr.includes(`Unexpected unsafe execution: ${relativePath}:`), result.stderr);
  }
  assert.ok(result.stderr.length < 8192, `final-review diagnostics were ${result.stderr.length} bytes`);
});

test('the guard CLI rejects tracked mutable spread prefixes without executing them', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = mutableSpreadPrefixCases.map((mutationCase, index) => ({
    relativePath: `packages/example/src/mutable-spread-${index}.ts`,
    source: mutationCase.source,
  }));
  const result = invokeGuardWithTrackedSources(root, sources);

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /analysis-limit .*\(positional-layout-limit\)/);
  for (const { relativePath } of sources) {
    assert.ok(result.stderr.includes(`Unexpected unsafe execution: ${relativePath}:`), result.stderr);
  }
});

test('the production npm lint path rejects every focused carrier review mechanism', t => {
  assert.equal(productionCarrierReviewCases.length, 4);
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = productionCarrierReviewCases.map((reviewCase, index) => ({
    relativePath: `packages/example/src/production-carrier-review-${index}.ts`,
    source: reviewCase.source,
  }));
  const result = invokeNpmLintWithTrackedSources(root, sources);

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /analysis-limit .*\(positional-layout-limit\)/);
  for (const { relativePath } of sources) {
    assert.ok(result.stderr.includes(`Unexpected unsafe execution: ${relativePath}:`), result.stderr);
  }
});

test('the production npm lint path rejects all blocking review classes', t => {
  assert.equal(productionBlockingReviewCases.length, 6);
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = productionBlockingReviewCases.map((reviewCase, index) => ({
    relativePath: `packages/example/src/production-blocking-review-${index}.ts`,
    source: reviewCase.source,
  }));
  const result = invokeNpmLintWithTrackedSources(root, sources);

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /analysis-limit .*\(positional-layout-limit\)/);
  for (const { relativePath } of sources) {
    assert.ok(result.stderr.includes(`Unexpected unsafe execution: ${relativePath}:`), result.stderr);
  }
});

test('known safe nested Reflect targets remain accepted', () => {
  for (const safeCase of safeNestedReflectCases) {
    assert.deepEqual(
      scanSource(safeCase.source, 'packages/example/src/safe-nested-reflect.ts'),
      [],
      `${safeCase.name} should not produce a finding`
    );
  }
});

test('the guard CLI accepts known safe nested Reflect targets', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = safeNestedReflectCases.map((safeCase, index) => ({
    relativePath: `packages/example/src/safe-nested-reflect-${index}.ts`,
    source: safeCase.source,
  }));
  const result = invokeGuardWithTrackedSources(root, sources);

  assert.equal(result.status, 0, result.stderr);
});

test('unknown-length spread prefixes fail closed when a tracked callable can shift position', () => {
  for (const source of [
    `const prefix = loadPrefix();
     Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
    `const prefix = flag ? [] : loadPrefix();
     Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
    `let prefix = [];
     prefix = loadPrefix();
     Reflect.apply(...prefix, eval, globalThis, [configuredSource]);`,
    `const carriers = { selected: loadPrefix() };
     Reflect.construct(...carriers[key], _.template, [configuredSource]);`,
    `let prefix;
     const invoke = Reflect.apply.bind.call(Reflect.apply, ...prefix, Reflect, eval, globalThis);
     invoke([configuredSource]);`,
  ]) {
    const findings = scanSource(source, 'packages/example/src/unknown-spread.ts');
    assert.ok(
      findings.some(finding => finding.kind === 'analysis-limit' && finding.reason === 'positional-layout-limit'),
      `unknown positional provenance should fail closed: ${JSON.stringify(findings)}`
    );
  }
});

test('nested Reflect expansion limits remain gated to unsafe targets', () => {
  for (const unsafeCase of targetSensitiveUnsafeSpreadCases) {
    const findings = scanSource(unsafeCase.source, 'packages/example/src/unsafe-reflect-target.ts');
    assert.ok(
      findings.some(finding => finding.kind === 'analysis-limit' && finding.reason === 'positional-layout-limit'),
      `${unsafeCase.name} should fail closed: ${JSON.stringify(findings)}`
    );
  }
});

test('the guard CLI rejects unknown positional layouts for tracked unsafe Reflect targets', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = targetSensitiveUnsafeSpreadCases.map((unsafeCase, index) => ({
    relativePath: `packages/example/src/unsafe-reflect-target-${index}.ts`,
    source: unsafeCase.source,
  }));
  const result = invokeGuardWithTrackedSources(root, sources);

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /analysis-limit .*\(positional-layout-limit\)/);
  for (const { relativePath } of sources) {
    assert.ok(result.stderr.includes(`Unexpected unsafe execution: ${relativePath}:`), result.stderr);
  }
});

test('unknown or conditional Reflect target provenance fails closed', () => {
  for (const unsafeCase of unknownReflectTargetCases) {
    const findings = scanSource(unsafeCase.source, 'packages/example/src/unknown-reflect-target.ts');
    assert.deepEqual(
      findings.map(finding => [finding.kind, finding.reason]),
      [[unsafeCase.kind, unsafeCase.reason]],
      `${unsafeCase.name} should produce one bounded fail-closed diagnostic`
    );
  }
});

test('the guard CLI rejects unknown or conditional Reflect target provenance', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = unknownReflectTargetCases.map((unsafeCase, index) => ({
    relativePath: `packages/example/src/unknown-reflect-target-${index}.ts`,
    source: unsafeCase.source,
  }));
  const result = invokeGuardWithTrackedSources(root, sources);

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /analysis-limit .*\(unknown-reflect-target\)/);
  assert.ok(result.stderr.length < 4096, `unknown-target diagnostics were ${result.stderr.length} bytes`);
  for (const { relativePath } of sources) {
    assert.ok(result.stderr.includes(`Unexpected unsafe execution: ${relativePath}:`), result.stderr);
  }
});

test('flat callable composition exhausts a deterministic global work budget', t => {
  const rebindings = Array.from({ length: 10 }, () => 'callable = callable.bind(null);').join('\n');
  const source = `let callable = eval;\n${rebindings}\ncallable(configuredSource);`;
  const startedAt = performance.now();
  const firstFindings = scanSource(source, 'packages/example/src/flat-composition.ts');
  const secondFindings = scanSource(source, 'packages/example/src/flat-composition.ts');
  const elapsedMilliseconds = performance.now() - startedAt;

  assert.deepEqual(firstFindings, secondFindings);
  assert.deepEqual(
    firstFindings.map(finding => [finding.kind, finding.reason]),
    [['analysis-limit', 'dependency-composition-limit']]
  );
  assert.ok(elapsedMilliseconds < 2000, `two bounded flat-composition scans took ${Math.round(elapsedMilliseconds)}ms`);
  assert.deepEqual(
    scanSource(
      `let callable = eval;
       callable = callable.bind(null);
       callable = callable.bind(null);
       callable(configuredSource);`,
      'packages/example/src/ordinary-composition.ts'
    ).map(finding => finding.kind),
    ['direct-eval']
  );

  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = invokeGuardWithTrackedSource(root, source);
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /analysis-limit .*\(dependency-composition-limit\)/);
  assert.doesNotMatch(result.stderr, /RangeError|Maximum call stack size exceeded/);
});

test('large flat callable composition stops promptly after the global work limit', t => {
  const rebindings = Array.from({ length: 5000 }, () => 'callable = callable.bind(null);').join('\n');
  const source = `let callable = eval;\n${rebindings}\ncallable(configuredSource);`;
  const startedAt = performance.now();
  const firstFindings = scanSource(source, 'packages/example/src/large-flat-composition.ts');
  const secondFindings = scanSource(source, 'packages/example/src/large-flat-composition.ts');
  const elapsedMilliseconds = performance.now() - startedAt;

  assert.deepEqual(firstFindings, secondFindings);
  assert.deepEqual(
    firstFindings.map(finding => [finding.kind, finding.reason]),
    [['analysis-limit', 'analysis-work-limit']]
  );
  assert.ok(
    elapsedMilliseconds < 8000,
    `two bounded large flat-composition scans took ${Math.round(elapsedMilliseconds)}ms`
  );

  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = invokeGuardWithTrackedSource(root, source);
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /analysis-limit .*\(analysis-work-limit\)/);
  assert.doesNotMatch(result.stderr, /RangeError|Maximum call stack size exceeded/);
  assert.ok(result.stderr.length < 4096, `large-composition diagnostics were ${result.stderr.length} bytes`);
});

test('set merges and propagation subscribers share a deterministic analysis budget', t => {
  const assignmentCount = 1200;
  const source = [
    'let source = {};',
    ...Array.from({ length: assignmentCount }, (_, index) => `source = { v${index}: null };`),
    ...Array.from({ length: assignmentCount }, (_, index) => `let target${index} = source;`),
  ].join('\n');
  const startedAt = performance.now();
  const firstFindings = scanSource(source, 'packages/example/src/bounded-set-propagation.ts');
  const secondFindings = scanSource(source, 'packages/example/src/bounded-set-propagation.ts');
  const elapsedMilliseconds = performance.now() - startedAt;

  assert.deepEqual(firstFindings, secondFindings);
  assert.deepEqual(
    firstFindings.map(finding => [finding.kind, finding.reason]),
    [['analysis-limit', 'analysis-work-limit']]
  );
  assert.ok(elapsedMilliseconds < 5000, `two bounded set-propagation scans took ${Math.round(elapsedMilliseconds)}ms`);

  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = invokeGuardWithTrackedSources(
    root,
    [{ relativePath: 'packages/example/src/bounded-set-propagation.ts', source }],
    ['--max-old-space-size=256']
  );

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /analysis-limit .*\(analysis-work-limit\)/);
  assert.doesNotMatch(result.stderr, /heap out of memory|SIGABRT|allocation failure/i);
  assert.ok(result.stderr.length < 4096, `set-propagation diagnostics were ${result.stderr.length} bytes`);
});

test('large descriptor dependencies, callable composition, and accessor fan-out stay bounded under low heap', t => {
  const stressCases = [
    {
      relativePath: 'packages/example/src/descriptor-prototype-3000.ts',
      source: [
        'let descriptor = { set(value) { this[0] = eval; } };',
        ...Array.from({ length: 3000 }, () => 'descriptor = Object.create(descriptor);'),
        "const target = {}; Object.defineProperty(target, 'x', descriptor);",
        "const args = [null]; Reflect.set(target, 'x', 1, args);",
        'Reflect.apply(...args, globalThis, [configuredSource]);',
      ].join('\n'),
    },
    {
      relativePath: 'packages/example/src/callable-composition-5000.ts',
      source: [
        'let callable = eval;',
        ...Array.from({ length: 5000 }, () => 'callable = callable.bind(null);'),
        'callable(configuredSource);',
      ].join('\n'),
    },
    {
      relativePath: 'packages/example/src/accessor-carrier-fanout-8000.ts',
      source: [
        'const args = [null];',
        ...Array.from({ length: 8000 }, (_, index) => `const observed${index} = args.x;`),
        "Object.defineProperty(args, 'x', { get() { this[0] = eval; return true; } });",
        'args.x;',
        'Reflect.apply(...args, globalThis, [configuredSource]);',
      ].join('\n'),
    },
  ];

  for (const stressCase of stressCases) {
    const firstFindings = scanSource(stressCase.source, stressCase.relativePath);
    const secondFindings = scanSource(stressCase.source, stressCase.relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${stressCase.relativePath} should be deterministic`);
    assert.deepEqual(
      firstFindings.map(finding => [finding.kind, finding.reason]),
      [['analysis-limit', 'analysis-work-limit']],
      `${stressCase.relativePath} should stop at one global work sentinel`
    );
  }

  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = invokeGuardWithTrackedSources(root, stressCases, ['--max-old-space-size=128']);

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /analysis-limit .*\(analysis-work-limit\)/);
  assert.doesNotMatch(result.stderr, /heap out of memory|SIGABRT|allocation failure|RangeError/i);
  assert.ok(result.stderr.length < 4096, `large-stress diagnostics were ${result.stderr.length} bytes`);
  for (const { relativePath } of stressCases) {
    assert.ok(result.stderr.includes(`Unexpected unsafe execution: ${relativePath}:`), result.stderr);
  }
});

test('local return alias chains, nested compositions, and carrier fan-out stay bounded under low heap', t => {
  const aliasCount = 2000;
  const aliasChain = [
    'function id(target) {',
    ...Array.from(
      { length: aliasCount },
      (_, index) => `const alias${index} = ${index === 0 ? 'target' : `alias${index - 1}`};`
    ),
    `return alias${aliasCount - 1};`,
    '}',
    'id(Reflect.apply)(eval, globalThis, [configuredSource]);',
  ].join('\n');
  const startedAt = performance.now();
  assert.deepEqual(
    scanSource(aliasChain, 'packages/example/src/returned-local-alias-chain.ts').map(finding => finding.kind),
    ['direct-eval']
  );
  assert.ok(performance.now() - startedAt < 2500, 'a 2,000-hop local return alias chain should remain linear');

  const exhaustedAliasCount = 9000;
  const exhaustedAliasChain = [
    'function id(target) {',
    ...Array.from(
      { length: exhaustedAliasCount },
      (_, index) => `const alias${index} = ${index === 0 ? 'target' : `alias${index - 1}`};`
    ),
    `return alias${exhaustedAliasCount - 1};`,
    '}',
    'id(Reflect.apply)(eval, globalThis, [configuredSource]);',
  ].join('\n');
  const exhaustedFindings = scanSource(
    exhaustedAliasChain,
    'packages/example/src/exhausted-returned-local-alias-chain.ts'
  );
  assert.deepEqual(
    exhaustedFindings.map(finding => [finding.kind, finding.reason]),
    [['analysis-limit', 'return-provenance-limit']]
  );

  const nestedComposition = [
    'function id(value) { const alias = value; return alias; }',
    'let target = Reflect.apply;',
    ...Array.from({ length: 2000 }, () => 'target = id(target);'),
    'target(eval, globalThis, [configuredSource]);',
  ].join('\n');
  const carrierFanOut = [
    'function carry(target) {',
    '  const local = target;',
    '  const object = { target: local };',
    '  const alias = [object];',
    '  return [...alias];',
    '}',
    ...Array.from(
      { length: 1500 },
      (_, index) => `const carrier${index} = carry(${index === 1499 ? 'Reflect.apply' : 'Array.of'});`
    ),
    'carrier1499[0].target(eval, globalThis, [configuredSource]);',
  ].join('\n');
  const stressCases = [
    {
      relativePath: 'packages/example/src/exhausted-returned-local-alias-chain.ts',
      source: exhaustedAliasChain,
    },
    {
      relativePath: 'packages/example/src/nested-returned-local-alias-composition.ts',
      source: nestedComposition,
    },
    {
      relativePath: 'packages/example/src/returned-local-alias-carrier-fanout.ts',
      source: carrierFanOut,
    },
  ];
  for (const stressCase of stressCases.slice(1)) {
    const findings = scanSource(stressCase.source, stressCase.relativePath);
    assert.ok(findings.length > 0, `${stressCase.relativePath} should fail closed`);
    assert.ok(findings.length <= 2, `${stressCase.relativePath} diagnostics should stay bounded`);
  }

  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = invokeGuardWithTrackedSources(root, stressCases, ['--max-old-space-size=128']);

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /heap out of memory|SIGABRT|allocation failure|RangeError/i);
  assert.ok(
    Buffer.byteLength(result.stderr) <= maximumDiagnosticOutputBytes,
    `local return stress diagnostics were ${Buffer.byteLength(result.stderr)} bytes`
  );
  for (const { relativePath } of stressCases) {
    assert.ok(result.stderr.includes(`Unexpected unsafe execution: ${relativePath}:`), result.stderr);
  }
});

test('higher-order closures, mutator fan-out, and singular reflection stay bounded under low heap', t => {
  const stressCases = [
    {
      relativePath: 'packages/example/src/higher-order-closure-2000.ts',
      source: [
        'function closeOver(target) { return () => target; }',
        'let target = Reflect.apply;',
        ...Array.from({ length: 2000 }, () => 'target = closeOver(target)();'),
        'target(eval, globalThis, [configuredSource]);',
      ].join('\n'),
    },
    {
      relativePath: 'packages/example/src/positional-insertion-3000.ts',
      source: [
        'const args = [globalThis, [configuredSource]];',
        ...Array.from({ length: 3000 }, () => 'args.unshift(eval);'),
        'Reflect.apply(...args);',
      ].join('\n'),
    },
    {
      relativePath: 'packages/example/src/singular-reflection-1000.ts',
      source: Array.from({ length: 1000 }, () => 'Reflect.get(loadTarget(), loadKey())(configuredSource);').join('\n'),
    },
  ];
  const startedAt = performance.now();

  for (const stressCase of stressCases) {
    const firstFindings = scanSource(stressCase.source, stressCase.relativePath);
    const secondFindings = scanSource(stressCase.source, stressCase.relativePath);
    assert.deepEqual(firstFindings, secondFindings, `${stressCase.relativePath} should be deterministic`);
    assert.ok(firstFindings.length > 0, `${stressCase.relativePath} should fail closed`);
    assert.ok(
      firstFindings.length <= maximumFindingsPerFile + 1,
      `${stressCase.relativePath} should respect the per-file finding cap`
    );
  }

  assert.ok(
    performance.now() - startedAt < 5000,
    'two scans of each fresh security stress class should stop within five seconds'
  );

  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = invokeGuardWithTrackedSources(root, stressCases, ['--max-old-space-size=128']);

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /heap out of memory|SIGABRT|allocation failure|RangeError/i);
  assert.ok(
    Buffer.byteLength(result.stderr) <= maximumDiagnosticOutputBytes,
    `fresh security diagnostics were ${Buffer.byteLength(result.stderr)} bytes`
  );
  for (const { relativePath } of stressCases) {
    assert.ok(result.stderr.includes(`Unexpected unsafe execution: ${relativePath}:`), result.stderr);
  }
});

test('deep call composition returns one bounded fail-closed diagnostic without a RangeError', t => {
  const callDepth = 4000;
  const source = `${'Reflect.apply.call('.repeat(callDepth)}null${', null)'.repeat(callDepth)};`;
  const findings = scanSource(source, 'packages/example/src/deep-composition.ts');

  assert.deepEqual(
    findings.map(finding => [finding.kind, finding.reason]),
    [['analysis-limit', 'syntactic-nesting-limit']]
  );

  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = invokeGuardWithTrackedSource(root, source);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /analysis-limit .*\(syntactic-nesting-limit\)/);
  assert.doesNotMatch(result.stderr, /RangeError|Maximum call stack size exceeded/);
  assert.ok(result.stderr.length < 4096, `deep-composition diagnostics were ${result.stderr.length} bytes`);
});

test('per-file unsafe-site findings and CLI diagnostics are explicitly capped', t => {
  const source = Array.from({ length: 5000 }, () => 'eval(configuredSource);').join('\n');
  const findings = scanSource(source, 'packages/example/src/many-unsafe-sites.ts');

  assert.equal(findings.length, maximumFindingsPerFile + 1);
  assert.ok(findings.slice(0, maximumFindingsPerFile).every(finding => finding.kind === 'direct-eval'));
  assert.deepEqual([findings.at(-1).kind, findings.at(-1).reason], ['analysis-limit', 'per-file-finding-limit']);

  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = invokeGuardWithTrackedSource(root, source);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /analysis-limit .*\(per-file-finding-limit\)/);
  assert.ok(
    Buffer.byteLength(result.stderr) <= maximumDiagnosticOutputBytes,
    `unsafe-site diagnostics were ${Buffer.byteLength(result.stderr)} bytes`
  );
});

test('repository findings stop at an explicit overall cap', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = Array.from({ length: maximumFindingsPerFile + 32 }, () => 'eval(configuredSource);').join('\n');
  const sources = Array.from({ length: 5 }, (_, index) => ({
    relativePath: `packages/example/src/many-unsafe-sites-${index}.ts`,
    source,
  }));
  for (const fixture of sources) {
    const absolutePath = path.join(root, ...fixture.relativePath.split('/'));
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, fixture.source);
  }
  execFileSync('git', ['add', '.'], { cwd: root });

  const findings = scanRepository(root, new Set());
  assert.equal(findings.length, maximumRepositoryFindings + 1);
  assert.equal(
    findings.filter(finding => finding.kind === 'analysis-limit' && finding.reason === 'repository-finding-limit')
      .length,
    1
  );

  const result = spawnSync(process.execPath, [path.join(root, 'scripts/check-unsafe-expressions.js')], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.ok(
    Buffer.byteLength(result.stderr) <= maximumDiagnosticOutputBytes,
    `repository diagnostics were ${Buffer.byteLength(result.stderr)} bytes`
  );
  assert.match(result.stderr, /Unsafe-expression diagnostics truncated at 65536 bytes\./);
  assert.doesNotMatch(result.stderr, /RangeError|heap out of memory|SIGABRT/i);
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
