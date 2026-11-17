#!/usr/bin/env node
/** Run the real HTTP/Mongo suite in an already lifted isolated Docker runtime.
 * No Sails bootstrap, migrate:drop, installs, mocks or browser automation.
 * Requires the existing Node inspector, normally http://127.0.0.1:9876.
 */
(async () => {
  const endpoint = process.env.RBPORTAL_INSPECTOR_URL ?? 'http://127.0.0.1:9876';
  const targets = await (await fetch(`${endpoint}/json/list`)).json();
  if (!targets[0]?.webSocketDebuggerUrl) throw new Error('No lifted runtime inspector target');
  const socket = new WebSocket(targets[0].webSocketDebuggerUrl);
  const timer = setTimeout(() => {
    socket.close();
    console.error('Saved-grid integration timed out');
    process.exit(1);
  }, 180000);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  const result = new Promise((resolve, reject) => {
    socket.onmessage = event => {
      const response = JSON.parse(event.data);
      if (response.id !== 1) return;
      if (response.error || response.result?.exceptionDetails) {
        reject(
          new Error(
            response.error?.message ??
              response.result.exceptionDetails.exception?.description ??
              'Inspector evaluation failed'
          )
        );
      } else resolve(response.result.result.value);
    };
    socket.onerror = reject;
  });
  const expression = `(async () => {
    const require = process.getBuiltinModule('module').createRequire(process.cwd() + '/app.js');
    require('ts-node').register({ transpileOnly: true, skipProject: true,
      compilerOptions: { target: 'ES2022', module: 'CommonJS', moduleResolution: 'Node', esModuleInterop: true } });
    const Mocha = require('mocha');
    const report = { passes: [], failures: [], pending: [] };
    class Reporter extends Mocha.reporters.Base {
      constructor(runner, options) {
        super(runner, options);
        runner.on('pass', test => report.passes.push(test.fullTitle()));
        runner.on('pending', test => report.pending.push(test.fullTitle()));
        runner.on('fail', (test, error) => report.failures.push({ test: test.fullTitle(), message: error.message }));
      }
    }
    const file = process.cwd() + '/test/integration/services/SavedGridService.test.ts';
    delete require.cache[require.resolve(file)];
    const mocha = new Mocha({ reporter: Reporter, timeout: 120000 });
    mocha.addFile(file);
    await new Promise(resolve => mocha.run(failures => { report.failureCount = failures; resolve(); }));
    require('fs').writeFileSync(process.cwd() + '/.tmp/saved-grid-integration-result.json', JSON.stringify(report, null, 2));
    return report;
  })()`;
  socket.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    })
  );
  try {
    const report = await result;
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.failureCount || report.pending.length || report.passes.length === 0 ? 1 : 0;
  } finally {
    clearTimeout(timer);
    socket.close();
  }
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
