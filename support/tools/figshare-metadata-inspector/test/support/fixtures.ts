import { readFileSync } from 'node:fs';
import path from 'node:path';

export function fixture<T>(name: string): T {
  const filePath = path.resolve(__dirname, '../../../test/fixtures', name);
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}
