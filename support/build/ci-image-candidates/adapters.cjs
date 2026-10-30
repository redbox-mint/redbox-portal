'use strict';

const { spawn } = require('node:child_process');
const { createReadStream, createWriteStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const { createGzip, createGunzip } = require('node:zlib');

// No shell interpolation, login, credentials, registry calls, or publishing in preparation.
function exited(child, command) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} failed (${signal || code})`)));
  });
}
async function run(command, args, options = {}) {
  const child = spawn(command, args, { cwd: options.cwd,
    stdio: options.logs ? ['ignore', 2, 2] : ['ignore', 'pipe', 2] });
  let stdout = '';
  if (!options.logs) child.stdout.on('data', chunk => {
    stdout += chunk;
    if (stdout.length > 16 * 1024 * 1024) child.kill();
  });
  await exited(child, command);
  return stdout;
}
async function transfer(child, streams, command) {
  try { await Promise.all([exited(child, command), pipeline(...streams)]); }
  catch (error) { child.kill(); throw error; }
}

// The manifest hashes every relative UTF-8 path and content hash in a deterministic order.
// No symlinks, empty directories, mtimes or ownership are included. Hash matches across architectures.
const assetEvidenceScript = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = '/opt/redbox-portal/.tmp/public';
const files = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, name);
    const stat = fs.lstatSync(file);
    if (stat.isDirectory()) walk(file);
    else if (stat.isFile()) {
      files.push([path.relative(root, file).split(path.sep).join('/'),
        crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
    } else throw new Error('Non-regular asset: ' + file);
  }
}
walk(root);
files.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
console.log(JSON.stringify({ node: process.versions.node, assetFiles: files.length,
  assetSha256: 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex') }));
`;

class DockerAdapter {
  constructor(execute = run, start = spawn) {
    this.run = (...args) => execute('docker', ...args);
    this.spawn = start;
  }
  async nativePlatform() {
    const info = JSON.parse(await this.run(['info', '--format', '{{json .}}']));
    const architecture = { x86_64: 'amd64', aarch64: 'arm64', amd64: 'amd64', arm64: 'arm64' }[info.Architecture];
    return `${info.OSType}/${architecture}`;
  }
  async versions() {
    return { docker: JSON.parse(await this.run(['version', '--format', '{{json .}}'])),
      buildx: (await this.run(['buildx', 'version'])).trim() };
  }
  async createBuilder(name) {
    await this.run(['buildx', 'create', '--name', name, '--driver', 'docker-container'], { logs: true });
    try { await this.run(['buildx', 'inspect', '--builder', name, '--bootstrap'], { logs: true }); }
    catch (error) {
      await this.removeBuilder(name).catch(() => {});
      throw error;
    }
  }
  async removeBuilder(name) { await this.run(['buildx', 'rm', name], { logs: true }); }
  async build({ builder, context, platform, target, reference, labels }) {
    const args = ['buildx', 'build', '--builder', builder, '--progress', 'plain', '--platform', platform,
      '--target', target, '--load', '--tag', reference];
    for (const [key, value] of Object.entries(labels)) args.push('--label', `${key}=${value}`);
    await this.run([...args, context], { logs: true });
  }
  async inspect(reference) {
    const [info] = JSON.parse(await this.run(['image', 'inspect', reference]));
    return { id: info.Id, platform: `${info.Os}/${info.Architecture}`, labels: info.Config.Labels || {} };
  }
  async evidence(imageId) {
    return JSON.parse(await this.run(['run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'node', imageId, '-e', assetEvidenceScript]));
  }
  async save(imageIds, file, compression) {
    const child = this.spawn('docker', ['image', 'save', ...imageIds], { stdio: ['ignore', 'pipe', 2] });
    await transfer(child, [child.stdout, ...(compression === 'gzip' ? [createGzip({ level: 1 })] : []),
      createWriteStream(file, { flags: 'wx', mode: 0o444 })], 'docker image save');
  }
  async load(file, compression) {
    const child = this.spawn('docker', ['image', 'load'], { stdio: ['pipe', 2, 2] });
    await transfer(child, [createReadStream(file), ...(compression === 'gzip' ? [createGunzip()] : []), child.stdin], 'docker image load');
  }
}

class GitAdapter {
  constructor(remote = 'origin', execute = run) { this.remote = remote; this.run = (...args) => execute('git', ...args); }
  async revision(cwd) { return (await this.run(['rev-parse', 'HEAD'], { cwd })).trim(); }
  async clean(cwd) {
    const status = await this.run(['-c', 'core.fsmonitor=false', '-c', 'core.ignorecase=false', '-c', 'core.trustctime=true',
      '-c', 'core.checkstat=default', '-c', 'core.filemode=true', '-c', 'core.symlinks=true',
      'status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none'], { cwd });
    // Ignored config/local.js can enter COPY . . too. Use a pristine source-only checkout.
    const ignored = await this.run(['-c', 'core.ignorecase=false', 'ls-files', '--others', '--ignored', '--exclude-standard'], { cwd });
    if (status.trim() !== '' || ignored.trim() !== '') return false;
    // Git status can hide changes when tracked files carry index flags.
    const tracked = await this.run(['ls-files', '-v', '-z'], { cwd });
    if (tracked.split('\0').some(entry => /^[a-zS] /.test(entry))) return false;
    // Parent status does not inspect ignored or hidden-index files in submodules.
    // Refuse them until recursive source attestation is implemented.
    const staged = await this.run(['ls-files', '--stage', '-z'], { cwd });
    return !staged.split('\0').some(entry => entry.startsWith('160000 '));
  }
  async refRevision(ref) {
    const output = await this.run(['ls-remote', '--exit-code', this.remote, ref, ...(ref.startsWith('refs/tags/') ? [`${ref}^{}`] : [])]);
    const values = new Map(output.trim().split('\n').filter(Boolean).map(line => {
      const [revision, name] = line.split(/\s+/);
      return [name, revision];
    }));
    return values.get(`${ref}^{}`) || values.get(ref);
  }
}

class RegistryAdapter {
  constructor(execute = run) { this.run = (...args) => execute('docker', ...args); }
  async descriptor(reference) {
    return JSON.parse(await this.run(['buildx', 'imagetools', 'inspect', reference, '--format', '{{json .Manifest}}']));
  }
  async raw(reference) { return JSON.parse(await this.run(['buildx', 'imagetools', 'inspect', reference, '--raw'])); }
  async push(imageId, reference) {
    await this.run(['image', 'tag', imageId, reference]);
    const output = await this.run(['image', 'push', reference]);
    const matches = [...output.matchAll(/\bdigest:\s*(sha256:[a-f0-9]{64})\b/g)];
    if (matches.length !== 1) throw new Error('push did not return exactly one immutable registry manifest digest');
    const digest = matches[0][1];
    const repository = reference.slice(0, reference.lastIndexOf(':'));
    const manifest = await this.raw(`${repository}@${digest}`);
    return { digest, configDigest: manifest.config?.digest };
  }
  async createIndex(reference, sources) {
    await this.run(['buildx', 'imagetools', 'create', '--tag', reference, ...sources.map(source => source.reference)], { logs: true });
    const descriptor = await this.descriptor(reference);
    const repository = reference.slice(0, reference.lastIndexOf(':'));
    const manifest = await this.raw(`${repository}@${descriptor.digest}`);
    return { digest: descriptor.digest, sources: (manifest.manifests || []).map(entry => ({
      digest: entry.digest, platform: `${entry.platform?.os}/${entry.platform?.architecture}`,
    })) };
  }
  async pointTag(destination, source) {
    // Source is the verified immutable index digest. There is no mutable architecture-tag lookup.
    await this.run(['buildx', 'imagetools', 'create', '--tag', destination, source], { logs: true });
    return (await this.descriptor(destination)).digest;
  }
}

module.exports = { DockerAdapter, GitAdapter, RegistryAdapter, assetEvidenceScript, run };
