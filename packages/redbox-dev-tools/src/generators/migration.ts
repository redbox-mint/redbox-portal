import * as path from 'path';
import { Generator, GeneratorOptions } from '../utils/generator';

export interface MigrationGeneratorOptions extends GeneratorOptions {
  description: string;
  /** Override the clock, used by tests for deterministic file names. */
  now?: Date;
}

function slugify(description: string): string {
  return description
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatTimestamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
  );
}

export class MigrationGenerator extends Generator {
  private description: string;
  private now: Date;

  public migrationName = '';
  public migrationPath = '';

  constructor(options: MigrationGeneratorOptions) {
    super(options);
    this.description = options.description;
    this.now = options.now ?? new Date();
  }

  public async generate(): Promise<void> {
    const slug = slugify(this.description);
    if (!slug) {
      throw new Error(
        `Cannot derive a migration name from description "${this.description}". Use letters, numbers, and hyphens.`
      );
    }

    this.migrationName = `${formatTimestamp(this.now)}-${slug}`;
    this.migrationPath = path.join(this.root, 'api', 'migrations', `${this.migrationName}.js`);

    this.writeFile(this.migrationPath, this.generateMigrationContent(slug));
  }

  private generateMigrationContent(slug: string): string {
    return `'use strict';

/**
 * Data migration: ${slug}
 *
 * Runs once during application lift, before coreBootstrap().
 * Migrations MUST be idempotent: if the process crashes after up() completes
 * but before the run is logged, the migration runs again on the next lift.
 * See the Data Migrations wiki page for the full contract.
 */
module.exports = {
  name: '${this.migrationName}',

  up: async ({ context: sails } = {}) => {
    // TODO: implement the forward data transformation.
    // Example:
    // await sails.models.appconfig.update({ key: 'oldKey' }, { key: 'newKey' });
    throw new Error('Migration ${this.migrationName} is not implemented yet');
  },

  // Optional manual rollback - only ever invoked by operator-driven Umzug
  // usage, never by a normal lift. Omit it entirely if a safe reverse is
  // not possible.
  // down: async ({ context: sails } = {}) => {
  // },
};
`;
  }
}
