import _ from 'lodash';
import type { BrandingModel } from '../model/storage/BrandingModel';
import type { RecordRelationshipGraph, RecordRelationshipExpandOptions } from '../RecordsService';
type AnyRecord = Record<string, unknown>;
export async function filterRelationshipGraph(
  brand: BrandingModel,
  user: AnyRecord | undefined,
  graph: RecordRelationshipGraph,
  canView: (brand: BrandingModel, user: AnyRecord | undefined, record: AnyRecord) => Promise<boolean>,
  mode: 'brand-scoped' | 'legacy-api' = 'brand-scoped'
): Promise<RecordRelationshipGraph> {
  const filteredRelatedObjects: globalThis.Record<string, unknown[]> = {};
  const allowedTargetOids = new Set<string>();
  const omittedByAccess: globalThis.Record<string, number> = {
    ...((graph.omittedByAccess ?? {}) as globalThis.Record<string, number>),
  };

  for (const [recordType, records] of Object.entries(graph.relatedObjects ?? {})) {
    const keptRecords: unknown[] = [];
    for (const recordValue of records ?? []) {
      const record = (recordValue ?? {}) as AnyRecord;
      const recordOid = String(record.redboxOid ?? '').trim();
      if (!recordOid) {
        continue;
      }
      if (mode === 'brand-scoped' && (!brand?.id || _.get(record, 'metaMetadata.brandId') !== brand.id)) {
        continue;
      }
      const hasAccess = (mode === 'legacy-api' && recordOid === graph.rootOid) || (await canView(brand, user, record));
      if (hasAccess) {
        keptRecords.push(record);
        allowedTargetOids.add(recordOid);
      }
    }
    if (keptRecords.length > 0) {
      filteredRelatedObjects[recordType] = keptRecords;
    }
  }

  const filteredEdges = (graph.edges ?? []).filter((edge: RecordRelationshipGraph['edges'][number]) => {
    if (
      mode === 'legacy-api'
        ? allowedTargetOids.has(edge.targetOid) || edge.targetOid === graph.rootOid
        : allowedTargetOids.has(edge.sourceOid) && allowedTargetOids.has(edge.targetOid)
    ) {
      return true;
    }
    omittedByAccess[edge.relationId] = Number(omittedByAccess[edge.relationId] ?? 0) + 1;
    return false;
  });

  return {
    rootOid: graph.rootOid,
    edges: filteredEdges,
    relatedObjects: filteredRelatedObjects,
    omittedByAccess,
  };
}
export function relationshipOptions(query: Record<string, unknown>, defaultDepth = 1): RecordRelationshipExpandOptions {
  const csv = (value: unknown) =>
    String(value ?? '')
      .trim()
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
  const depth = Number(query.relationshipDepth);
  return {
    depth: Number.isFinite(depth) && depth >= 0 ? depth : defaultDepth,
    includeRelationIds: query.relationshipIds ? csv(query.relationshipIds) : undefined,
    includeRecordTypes: query.recordTypes ? csv(query.recordTypes) : undefined,
    fields:
      String(query.fields ?? '')
        .trim()
        .toLowerCase() === 'summary'
        ? 'summary'
        : 'full',
  };
}
