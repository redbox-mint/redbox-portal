/** Run from redbox-core; see ../RELATED-RECORD-EXAMPLES.md. Writes only the two new reports. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FormConfigExports } from '../src/form-config';
import { generateRecordSchemaRolloutEvidence } from '../../redbox-core/scripts/verify-record-schema-rollout';

async function main(): Promise<void> {
  const directory = path.join(__dirname, 'snapshots');
  await fs.mkdir(directory, { recursive: true });
  for (const type of ['related-plan', 'related-activity']) {
    const name = `${type}-1.0-draft`;
    const report = await generateRecordSchemaRolloutEvidence({
      forms: [{ id: `dev-hook/${name}`, form: FormConfigExports[name] }],
    });
    await fs.writeFile(path.join(directory, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`Wrote new-form report ${name}.json\n`);
  }
}
void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
