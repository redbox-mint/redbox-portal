import fs from 'node:fs';
import path from 'node:path';
import type { ContractNode, RecordContract } from '../../src/record-contract';

/** Reduced after reproducing the complete deployed forms with SCU hook definitions.
 * All declared paths, nesting/list shapes and workflow variants are retained.
 * Scalar contents, presentation text and runtime diagnostic messages are omitted.
 */
export function scuGridContracts(): RecordContract[] {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'scu-grid-shapes.json'), 'utf8')) as {
    nodes: Array<
      Record<string, unknown> & {
        properties?: Record<string, number>;
        items?: number;
        thenNode?: number;
        elseNode?: number;
      }
    >;
    variants: Array<{ recordType: string; stage: string; form: string; root: number }>;
  };
  const expand = (id: number): ContractNode => {
    const node = fixture.nodes[id];
    return {
      ...node,
      ...(node.properties
        ? {
            properties: Object.fromEntries(Object.entries(node.properties).map(([key, child]) => [key, expand(child)])),
          }
        : {}),
      ...(node.items !== undefined ? { items: expand(node.items) } : {}),
      ...(node.thenNode !== undefined ? { thenNode: expand(node.thenNode) } : {}),
      ...(node.elseNode !== undefined ? { elseNode: expand(node.elseNode) } : {}),
    } as ContractNode;
  };
  return fixture.variants.map(variant => ({
    context: {
      brand: 'default',
      portal: 'rdmp',
      recordType: variant.recordType,
      workflowStep: variant.stage,
      form: variant.form,
      kind: 'update',
      operation: 'strict-all',
      enforcement: 'shadow',
      unknownProperties: 'allow',
    },
    root: expand(variant.root) as RecordContract['root'],
    definitions: {},
    diagnostics: [],
    fieldOwners: {},
    validatorSummaries: [],
    completeness: 'partial',
  }));
}
