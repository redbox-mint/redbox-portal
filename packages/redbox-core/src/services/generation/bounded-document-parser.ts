import { spawn, type ChildProcess } from 'node:child_process';

/** Linux RLIMIT_AS covers native buffers as well as the V8 heap. */
export function startBoundedDocumentParser(script: string, addressSpaceMiB = 1024): ChildProcess {
  if (
    process.platform !== 'linux' ||
    !Number.isSafeInteger(addressSpaceMiB) ||
    addressSpaceMiB <= 0 ||
    addressSpaceMiB > 1024
  ) {
    throw new Error('Bounded document parsing requires a supported Linux runtime');
  }
  return spawn(
    '/bin/sh',
    [
      '-c',
      'ulimit -c 0 || exit 70; ulimit -v "$1" || exit 70; shift; exec "$@"',
      'generation-document-parser',
      String(addressSpaceMiB * 1024),
      process.execPath,
      '--jitless',
      '--max-old-space-size=128',
      '--disable-wasm-trap-handler',
      ...(script.endsWith('.ts')
        ? ['--no-experimental-strip-types', '--require', 'ts-node/register/transpile-only']
        : []),
      script,
    ],
    {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      serialization: 'advanced',
      // Native parser libraries otherwise reserve a thread/allocator arena per host CPU.
      env: { ...process.env, UV_THREADPOOL_SIZE: '1', RAYON_NUM_THREADS: '1', MALLOC_ARENA_MAX: '1' },
    }
  );
}
