import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { printSchema } from 'graphql';
import { renderRecordJsonSchema } from '../../../../packages/redbox-core/src/record-contract/json-schema-renderer';
import { readAuthorizedRecord } from './access';
import { caller, fixtureContracts, recordFor } from './fixtures';
import { createRecordYoga } from './graphql';
import { coverage, fromJsonSchema, fromTree, hash, metadataTypeName } from './renderer';
import { projectMetadata } from './projection';

async function main(): Promise<void> {
  const contracts = await fixtureContracts();
  const measured = [];
  for (const contract of contracts) {
    const document = renderRecordJsonSchema(contract);
    const direct = coverage(fromTree(contract.root));
    const indirect = coverage(fromJsonSchema(document, document.$defs));
    assert.deepEqual(
      direct.map(({ pointer, kind }) => ({ pointer, kind })),
      indirect.map(({ pointer, kind }) => ({ pointer, kind }))
    );
    const record = recordFor(contract);
    const rich = contract.context.form.startsWith('investigation');
    const fields = rich ? '/title,/details/description,/contributors/name,/custom_hook_value/value' : '/title';
    const selection = rich
      ? 'title details { description } contributors { name } custom_hook_value { value }'
      : 'title';
    const query = `query IntegrationRead($oid: ID!) { record(oid: $oid) { oid metadata { ... on ${metadataTypeName(contract)} { ${selection} } } } }`;
    let reads = 0;
    const ports = {
      getMeta: async () => {
        reads += 1;
        return record;
      },
      hasViewAccess: () => true,
    };
    const { yoga } = createRecordYoga([contract], ports);
    const response = await yoga.fetch(
      'http://localhost/graphql',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/graphql-response+json' },
        body: JSON.stringify({ query, variables: { oid: record.redboxOid } }),
      },
      { caller }
    );
    const graphqlBody = await response.text();
    assert.equal(response.status, 200);
    const graphql = JSON.parse(graphqlBody);
    assert.equal(graphql.errors, undefined);
    const graphqlReads = reads;
    const authorized = await readAuthorizedRecord(ports, caller, record.redboxOid);
    const projected = projectMetadata(authorized.metadata, fields);
    assert.deepEqual(graphql.data.record.metadata, projected);
    const restBody = JSON.stringify({ data: projected, meta: { oid: record.redboxOid } });
    const projectionReads = reads - graphqlReads;
    const defaultAuthorized = await readAuthorizedRecord(ports, caller, record.redboxOid);
    const fullBody = JSON.stringify({ data: defaultAuthorized.metadata, meta: { oid: record.redboxOid } });
    measured.push({
      form: contract.context.form,
      workflowStep: contract.context.workflowStep,
      fixture: rich ? 'synthetic-rich-publication' : 'checked-in-dev-hook-stub',
      typeName: metadataTypeName(contract),
      compilerCompleteness: contract.completeness,
      compilerDiagnosticCodes: contract.diagnostics.map(diagnostic => diagnostic.code),
      treePaths: direct.length,
      jsonSchemaPaths: indirect.length,
      typedScalarPaths: direct.filter(entry => ['string', 'number', 'integer', 'boolean'].includes(entry.kind)).length,
      opaquePaths: direct.filter(entry => entry.kind === 'json'),
      coverageEqual: true,
      bytes: {
        fullRest: Buffer.byteLength(fullBody),
        projectedRest: Buffer.byteLength(restBody),
        graphql: Buffer.byteLength(graphqlBody),
      },
      gzipBytes: {
        fullRest: gzipSync(fullBody).byteLength,
        projectedRest: gzipSync(restBody).byteLength,
        graphql: gzipSync(graphqlBody).byteLength,
      },
      recordStorageReads: {
        fullRest: reads - graphqlReads - projectionReads,
        projectedRest: projectionReads,
        graphql: graphqlReads,
      },
      requestSelectionBytes: { restFields: Buffer.byteLength(fields), graphqlQuery: Buffer.byteLength(query) },
    });
  }
  const { schema } = createRecordYoga(contracts, { getMeta: async () => null, hasViewAccess: () => false });
  const sdl = printSchema(schema);
  const evidence = {
    version: 1,
    scope:
      'Deterministic synthetic metadata, in-memory storage counter, uncompressed UTF-8 and gzip JSON bodies; excludes headers, TLS, database latency and schema/configuration reads.',
    fixtureNotes:
      'The checked-in dev-hook publication forms only declare title. Rich fixtures reuse the existing record-contract fixture plus two registered synthetic hook contributors and mapping edge cases. Each record includes an unselected 8192-byte repeated x field; gzip exposes that favorable raw-size bias.',
    graphqlVersion: '16.14.2',
    yogaVersion: '5.24.2',
    schemaFingerprint: hash(sdl),
    measured,
  };
  await writeFile(path.resolve(__dirname, '../evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  await writeFile(path.resolve(__dirname, '../schema.graphql'), `${sdl}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
