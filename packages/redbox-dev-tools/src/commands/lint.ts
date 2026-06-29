import {Command} from "commander";
import {spawnSync} from "child_process";
import path from "path";
import * as readline from "node:readline";
import * as stream from "node:stream";

export function registerUpdateLintRulesCommand(program: Command): void {
  program
    .command('update-lint-rules')
    .description('Run lint and record the failing rules as off overrides in .oxlintrc.json.')
    .requiredOption('-d, --dir <path>', 'Path to the directory to run oxlint and containing .oxlintrc.json')
    .action(async (options) => {
      try {
        const globalOptions = program.opts();
        const configPath = path.resolve(options.dir);
        const configFile = path.resolve(options.dir, '.oxlintrc.json');
        const exeFile = path.resolve(options.dir, 'node_modules/oxlint/bin/oxlint');

        const result = spawnSync(
          process.execPath,
          [require.resolve(exeFile), '--config', configFile, '--format', 'unix'],
          {
            stdio: 'pipe',
            env: process.env,
            cwd: configPath,
            shell: false,
          }
        );

        // TODO: is some of the output missing?
        const output = result.stdout.toString()
          .split('\n')
          .map(l => {
          const path = l.split(':', 1)[0];
          const errors = l.split('[');
          const error = errors[errors.length - 1]
            .replace('Error/', '')
            .replace('(', '/')
            .replace(')]', '');
          return `${path}:${error}`;
        })
          .filter((item, index, arr) => item !== ':' && index === arr.indexOf(item))
          .sort();

        // TODO: update the .oxlintrc.json config file

        console.log(`\n🛠️  Ran oxlint ${JSON.stringify(output, null, 2)}\n`);

        console.log('\n✅ Done!\n');
      } catch (error: any) {
        console.error(`\n❌ Error: `, error);
        process.exit(1);
      }
    });
}
