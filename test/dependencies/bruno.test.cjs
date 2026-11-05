const assert = require('node:assert/strict');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { mkdtemp, writeFile, readFile, rm } = require('node:fs/promises');
const http = require('node:http');
const { createRequire } = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');

const bruno = createRequire(path.resolve(__dirname, '../bruno/package.json'));
const cli = createRequire(bruno.resolve('@usebruno/cli/package.json'));
const requests = createRequire(cli.resolve('@usebruno/requests/package.json'));

test('Bruno CSV loader preserves quoted values, BOM, Unicode and empty lines', async () => {
  const { parseCSV } = cli('./src/utils/filesystem.js');
  assert.deepEqual(await parseCSV('\uFEFFname,note\n"Ada, Lovelace","a ""quote"""\n\nÉmile,hello\n'), [
    { name: 'Ada, Lovelace', note: 'a "quote"' }, { name: 'Émile', note: 'hello' }
  ]);
  const { parse } = cli('csv-parse/sync');
  const [value] = parse('__proto__,__proto__,name\na,b,safe\n', { columns: true, group_columns_by_name: true });
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.deepEqual(Object.getOwnPropertyDescriptor(value, '__proto__').value, ['a', 'b']);
  assert.equal(value.name, 'safe');
});

test('Bruno gRPC sample generation retains Faker scalar, nested and repeated data', async () => {
  const { generateGrpcSampleMessage } = await import(pathToFileURL(requests.resolve('./src/grpc/grpcMessageGenerator.js')));
  const field = (name, type, extra = {}) => ({ name, type, ...extra });
  const value = generateGrpcSampleMessage({ requestType: { field: [
    field('float', 'TYPE_FLOAT'), field('integer', 'TYPE_INT32'), field('enabled', 'TYPE_BOOL'),
    field('name', 'TYPE_STRING'), field('bytes', 'TYPE_BYTES'), field('choice', 'TYPE_ENUM'),
    field('names', 'TYPE_STRING', { label: 'LABEL_REPEATED' }),
    field('children', 'TYPE_MESSAGE', { label: 'LABEL_REPEATED', messageType: { field: [field('name', 'TYPE_STRING')] } })
  ] } }, { arraySize: 2 });
  assert.equal(typeof value.float, 'number');
  assert.ok(value.float >= 0 && value.float <= 1000);
  assert.ok(Number.isInteger(value.integer));
  assert.equal(typeof value.enabled, 'boolean');
  assert.equal(typeof value.name, 'string');
  assert.ok(Buffer.from(value.bytes, 'base64').length >= 5);
  assert.equal(value.choice, 0);
  assert.equal(value.names.length, 2);
  assert.equal(value.children.length, 2);
  assert.equal(typeof value.children[0].name, 'string');
  const { faker } = requests('@faker-js/faker');
  faker.rawDefinitions.securityProbe = () => () => {};
  try {
    assert.throws(() => faker.helpers.fake('{{securityProbe.constructor(globalThis.__fakerSecurityProbe = true)}}'));
    assert.equal(globalThis.__fakerSecurityProbe, undefined);
    assert.equal(typeof faker.helpers.fake('{{person.firstName}}'), 'string');
  } finally {
    delete faker.rawDefinitions.securityProbe;
    delete globalThis.__fakerSecurityProbe;
  }
});

test('Bruno CLI executes a real collection with CSV iterations and assertions', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'redbox-bruno-security-'));
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ name: new URL(req.url, 'http://localhost').searchParams.get('name') }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await writeFile(path.join(dir, 'bruno.json'), JSON.stringify({ version: '1', name: 'dependency-security', type: 'collection', ignore: [] }));
    await writeFile(path.join(dir, 'data.csv'), 'name\n"Ada, Lovelace"\nÉmile\n');
    await writeFile(path.join(dir, 'echo.bru'), `meta {
  name: CSV echo
  type: http
  seq: 1
}
get {
  url: http://127.0.0.1:${server.address().port}/echo?name={{name}}
  body: none
  auth: none
}
tests {
  test("CSV row reaches the server", function () {
    expect(res.getStatus()).to.equal(200);
    expect(res.getBody().name).to.equal(bru.runner.iterationData.get("name"));
  });
}
`);
    const child = spawn(process.execPath, [cli.resolve('./bin/bru.js'), 'run', '--csv-file-path', 'data.csv', '--reporter-json', 'report.json', '--sandbox=developer'], { cwd: dir, env: { ...process.env, NO_COLOR: '1' } });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
    try {
      const [code] = await once(child, 'close');
      assert.equal(code, 0, output);
    } finally {
      clearTimeout(timer);
    }
    const report = JSON.parse(await readFile(path.join(dir, 'report.json'), 'utf8'));
    assert.equal(report.length, 2);
    for (const iteration of report) {
      assert.equal(iteration.results.length, 1);
      assert.equal(iteration.results[0].testResults[0].status, 'pass');
    }
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
