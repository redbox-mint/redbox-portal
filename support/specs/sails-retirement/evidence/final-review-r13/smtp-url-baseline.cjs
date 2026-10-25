// Actual baseline method and pinned Nodemailer. Only sendMail is replaced; no network I/O.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const fromCore = createRequire(require('node:path').resolve('packages/redbox-core/package.json'));
const ts = fromCore('typescript');
require('ts-node').register({ transpileOnly: true, project: 'packages/redbox-core/test/tsconfig.json' });
const { loadPortalConfiguration } = require(process.cwd() + '/packages/redbox-core/src/configuration/portal');
const nodemailer = fromCore('nodemailer');
const _ = fromCore('lodash');
const url = 'smtp://mail.example.invalid:2525?secure=false';
const source = execFileSync('git', ['show', 'a49366803:packages/redbox-core/src/services/EmailService.ts'], {
  encoding: 'utf8',
});
const ast = ts.createSourceFile('baseline.ts', source, ts.ScriptTarget.Latest, true);
let method;
function walk(n) {
  if (ts.isMethodDeclaration(n) && n.name.getText(ast) === 'sendMessageAsync') method = n.getText(ast);
  ts.forEachChild(n, walk);
}
walk(ast);
assert(method);
const code = ts.transpileModule('class BaselineEmail { ' + method + ' } module.exports=BaselineEmail;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleFixture = { exports: {} };
let transport;
new Function('module', 'sails', 'nodemailer', '_', code)(
  moduleFixture,
  { config: { emailnotification: { settings: { enabled: true, serverOptions: url } } } },
  {
    createTransport(value) {
      transport = nodemailer.createTransport(value);
      transport.sendMail = async () => ({ messageId: 'fixture' });
      return transport;
    },
  },
  _
);
const service = new moduleFixture.exports();
service.updateChronicle = () => {};
(async () => {
  const baseline = await service.sendMessageAsync(
    'to@example.invalid',
    'body',
    'subject',
    'from@example.invalid',
    'text',
    '',
    ''
  );
  assert.equal(baseline.success, true);
  assert.equal(transport.options.host, 'mail.example.invalid');
  assert.equal(transport.options.port, 2525);
  transport.close();
  let current;
  try {
    await loadPortalConfiguration({
      env: { REDBOX_SESSION_SECRET: 'smtp-url-probe-synthetic-session-secret' },
      extensions: {
        providers: [
          {
            name: 'mail-config',
            root: '.',
            declaration: { apiVersion: 1, config: { emailnotification: { settings: { serverOptions: url } } } },
          },
        ],
      },
    });
    current = 'accepted';
  } catch (e) {
    current = e.message;
  }
  console.log(
    JSON.stringify(
      {
        baselineSendSuccess: baseline.success,
        nativeHost: transport.options.host,
        nativePort: transport.options.port,
        current,
      },
      null,
      2
    )
  );
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
