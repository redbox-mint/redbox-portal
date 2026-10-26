// Build-time only. Installed startup validates the shipped schema without loading TypeScript.
const { resolve, join } = require('node:path');
const { readFileSync, writeFileSync } = require('node:fs');
const { format, resolveConfig } = require('prettier');
const { generateSchema } = require('typescript-json-schema');
const { readConfigFile, parseJsonConfigFileContent, createProgram, sys } = require('typescript');
const root = resolve(__dirname, '..');
const input = join(root, 'src/configuration/PortalDomainConfiguration.ts');
const file = join(root, 'src/configuration/portal-domains.schema.json');
const config = readConfigFile(join(root, 'tsconfig.json'), sys.readFile);
if (config.error) throw new Error('Cannot read core TypeScript configuration');
const options = parseJsonConfigFileContent(config.config, sys, root).options;
const program = createProgram([input], { ...options, noEmit: true });
const schema = generateSchema(program, 'PortalDomainConfiguration', {
  required: true,
  strictNullChecks: true,
  ref: true,
  ignoreErrors: false,
});
if (!schema) throw new Error('Cannot generate portal domain configuration schema');
async function main() {
  const content = await format(JSON.stringify(schema), { ...(await resolveConfig(file)), parser: 'json' });
  if (process.argv.includes('--check')) {
    if (readFileSync(file, 'utf8') !== content)
      throw new Error('Stale portal domain schema; run npm run generate:portal-config');
  } else writeFileSync(file, content);
  console.log('Portal domain configuration schema verified');
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
