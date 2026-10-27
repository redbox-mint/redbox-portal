import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('persistence index deployment fixture', () => {
  it('keeps the deployment fixture packable and uses the owned core maintenance entrypoint', () => {
    const root = resolve(__dirname, '../../../..');
    const fixture = resolve(root, 'support/resources/mongodb-persistence-indexes.js');
    const packageRoot = resolve(root, 'packages/redbox-core');
    const metadata = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
    const command = resolve(packageRoot, 'bin/persistence-indexes.cjs');
    assert(metadata.files.includes('bin'));
    assert(lstatSync(command).isFile());
    execFileSync(process.execPath, ['--check', command]);
    assert(lstatSync(fixture).isFile(), 'npm pack omits symbolic links; deployment fixtures must be regular files');
    execFileSync(process.execPath, ['--check', fixture]);
  });
});
