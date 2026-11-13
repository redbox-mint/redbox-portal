import { expect } from 'chai';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { startBoundedDocumentParser } from '../../src/services/generation/bounded-document-parser';

const linuxDescribe = process.platform === 'linux' ? describe : describe.skip;
linuxDescribe('Generation document process memory isolation', function () {
  this.timeout(20000);
  let directory: string;
  let script: string;

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'generation-parser-probe-'));
    // The semicolon and spaces must remain literal filename characters.
    script = join(directory, 'parser probe; literal.cjs');
    await writeFile(
      script,
      `
      const fs = require('node:fs');
      const { inflateRawSync } = require('node:zlib');
      const vmKiB = Number(fs.readFileSync('/proc/self/status', 'utf8').match(/^VmSize:\\s+(\\d+)/m)[1]);
      process.send({ ready: true, vmKiB, pools: [process.env.UV_THREADPOOL_SIZE, process.env.RAYON_NUM_THREADS, process.env.MALLOC_ARENA_MAX] });
      process.once('message', input => {
        process.send({ inflating: true });
        const expanded = inflateRawSync(input.bytes);
        process.send({ expandedBytes: expanded.length });
        process.disconnect();
      });
    `
    );
  });

  after(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  async function probe(addressSpaceMiB = 1024, bytes?: Buffer, heapOnly = false) {
    const parser = heapOnly
      ? spawn(process.execPath, ['--jitless', '--max-old-space-size=128', '--disable-wasm-trap-handler', script], {
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          serialization: 'advanced',
          env: { ...process.env, UV_THREADPOOL_SIZE: '1', RAYON_NUM_THREADS: '1', MALLOC_ARENA_MAX: '1' },
        })
      : startBoundedDocumentParser(script, addressSpaceMiB);
    expect(parser.spawnargs).to.include('--jitless');
    expect(parser.spawnargs).to.include('--max-old-space-size=128');
    expect(parser.spawnargs).to.include('--disable-wasm-trap-handler');
    expect(parser.spawnargs.at(-1)).to.equal(script);
    return new Promise<{
      ready?: { vmKiB: number; pools: string[] };
      expandedBytes?: number;
      inflating: boolean;
      code: number | null;
      signal: string | null;
    }>((resolve, reject) => {
      let ready: { vmKiB: number; pools: string[] } | undefined;
      let expandedBytes: number | undefined;
      let inflating = false;
      const timer = setTimeout(() => {
        parser.kill('SIGKILL');
        reject(new Error('Parser probe timed out'));
      }, 10000);
      parser.on(
        'message',
        (message: { ready?: boolean; vmKiB: number; pools: string[]; expandedBytes?: number; inflating?: boolean }) => {
          if (message.ready) {
            ready = { vmKiB: message.vmKiB, pools: message.pools };
            if (bytes) parser.send!({ bytes });
            else parser.kill('SIGKILL');
          } else if (message.inflating) inflating = true;
          else expandedBytes = message.expandedBytes;
        }
      );
      parser.once('error', error => {
        clearTimeout(timer);
        parser.kill('SIGKILL');
        reject(error);
      });
      parser.once('exit', (code, signal) => {
        clearTimeout(timer);
        resolve({ ready, expandedBytes, inflating, code, signal });
      });
    });
  }

  it('starts a real constrained child with literal arguments and bounded native pools', async () => {
    const result = await probe();
    expect(result.ready?.vmKiB).to.be.greaterThan(0);
    expect(result.ready?.vmKiB).to.be.lessThan(1024 * 1024);
    expect(result.ready?.pools).to.deep.equal(['1', '1', '1']);
  });

  it('contains external-buffer decompression failure without terminating the caller', async () => {
    const baseline = await probe();
    expect(baseline.ready).not.to.equal(undefined);
    // Only 8 MiB of expanded data: use a smaller test-only AS budget instead of a large allocation.
    const compressed = deflateRawSync(Buffer.alloc(8 * 1024 * 1024, 32));
    expect(compressed.length).to.be.lessThan(16384);
    const control = await probe(1024, compressed, true);
    expect(control.expandedBytes).to.equal(8 * 1024 * 1024);
    expect(control.code).to.equal(0);
    const budgetMiB = Math.ceil(baseline.ready!.vmKiB / 1024) + 4;
    const result = await probe(budgetMiB, compressed);
    expect(result.ready).not.to.equal(undefined);
    expect(result.inflating).to.equal(true);
    expect(result.expandedBytes).to.equal(undefined);
    expect(result.signal !== null || result.code !== 0).to.equal(true);
  });
});
