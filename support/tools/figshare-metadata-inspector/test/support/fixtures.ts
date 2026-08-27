import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function fixture<T>(name: string): T {
  const sourceFixtureDirectory = path.resolve(__dirname, '../fixtures');
  const fixtureDirectory = existsSync(sourceFixtureDirectory)
    ? sourceFixtureDirectory
    : path.resolve(__dirname, '../../../test/fixtures');
  const filePath = path.join(fixtureDirectory, name);
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}
