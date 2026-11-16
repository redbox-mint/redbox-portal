import { getOperationAST, parse, visit, valueFromASTUntyped } from 'graphql';
import type {
  GraphqlNamedQueryOperation,
  NamedQueryDefinition,
  NamedQueryExplorerSource,
  PublishedExplorerQuery,
} from '@researchdatabox/sails-ng-common';
import type { NamedQueryAttributes } from '../../waterline-models/NamedQuery';
import type { ReadCaller } from '../../record-graphql/read-record';
import {
  savedGridDefinition,
  savedGridId,
  savedGridRevision,
  savedGridStore,
  SavedGridError,
  type SavedGridDefinition,
  type SavedGridScope,
} from '../SavedGridService';

function storedOperation(value: unknown): GraphqlNamedQueryOperation | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function explorerReference(operation?: GraphqlNamedQueryOperation) {
  const value = operation?.provenance;
  return value?.explorerPortal &&
    savedGridId.safeParse(value.explorerId).success &&
    savedGridRevision.safeParse(value.explorerRevision).success
    ? { id: value.explorerId!, revision: value.explorerRevision!, portal: value.explorerPortal }
    : null;
}

/** Legacy provenance remains informational. New links are checked at the write
 * boundary. Keeping an unchanged reference permits editing after source deletion
 * or later revisions; it never refreshes the published revision implicitly. */
export async function validateExplorerReference(
  definition: NamedQueryDefinition,
  caller?: ReadCaller,
  previous?: Pick<NamedQueryAttributes, 'source' | 'graphql'>
): Promise<void> {
  if (definition.source !== 'graphql' || !definition.graphql.provenance?.explorerPortal) return;
  const reference = explorerReference(definition.graphql);
  if (!reference) throw new SavedGridError(400, 'invalid-definition');
  const prior = previous?.source === 'graphql' ? explorerReference(storedOperation(previous.graphql)) : null;
  if (prior && prior.id === reference.id && prior.portal === reference.portal && prior.revision === reference.revision)
    return;
  if (!caller?.brand?.id || !caller.user?.username || caller.portal !== reference.portal)
    throw new SavedGridError(403, 'auth-required');
  const { collection, ObjectId } = savedGridStore();
  const row = await collection.findOne({
    brandId: String(caller.brand.id),
    portal: caller.portal,
    _id: new ObjectId(reference.id),
  });
  if (!row) throw new SavedGridError(404, 'grid-missing');
  if (row.revision !== reference.revision) throw new SavedGridError(409, 'revision-conflict');
}

/** A raw operation can address several types or no collection. Only report one
 * when every selected collection has the same explicit string argument. */
export function explorerRecordType(definition: SavedGridDefinition): string | null {
  if (definition.mode !== 'graphql') return definition.recordType;
  try {
    const ast = parse(definition.document, { maxTokens: 2000 });
    const operation = getOperationAST(ast);
    if (!operation) return null;
    const values = {
      ...Object.fromEntries(
        (operation.variableDefinitions ?? [])
          .filter(node => node.defaultValue)
          .map(node => [node.variable.name.value, valueFromASTUntyped(node.defaultValue!)])
      ),
      ...definition.variables,
    };
    const types: unknown[] = [];
    visit(ast, {
      Field(node) {
        if (node.name.value !== 'records') return;
        const argument = node.arguments?.find(argument => argument.name.value === 'recordType');
        types.push(argument ? valueFromASTUntyped(argument.value, values) : undefined);
      },
    });
    return types.length && types.every(value => typeof value === 'string' && value === types[0])
      ? String(types[0])
      : null;
  } catch {
    return null;
  }
}

export function explorerRecordTypeLabel(recordType: string | null): string | null {
  if (!recordType) return null;
  return sails.config.recordtype?.[recordType]?.labels?.name || recordType;
}

/** One brand-scoped named-query read for a whole saved-query page. */
export async function publishedExplorations<T extends { id: string; revision: number }>(
  scope: SavedGridScope,
  grids: T[]
) {
  if (!grids.length) return [];
  const rows = (await NamedQuery.find({ branding: scope.brandId, source: 'graphql' })) as NamedQueryAttributes[];
  const publications = new Map<string, PublishedExplorerQuery[]>();
  const revisions = new Map(grids.map(grid => [grid.id, grid.revision]));
  for (const row of rows) {
    const reference = explorerReference(storedOperation(row.graphql));
    if (!reference || reference.portal !== scope.portal || !revisions.has(reference.id)) continue;
    const list = publications.get(reference.id) ?? [];
    list.push({
      name: row.name,
      publishedRevision: reference.revision,
      changedSincePublished: revisions.get(reference.id) !== reference.revision,
    });
    publications.set(reference.id, list);
  }
  return grids.map(grid => ({
    ...grid,
    publishedAs: (publications.get(grid.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

/** One scoped Mongo read for all linked sources on a named-query page. Never
 * resolve cross-portal IDs, even though named-query definitions are brand-wide. */
export async function namedQueryExplorerSources<
  T extends { source?: unknown; valid?: boolean; graphql?: GraphqlNamedQueryOperation },
>(scope: SavedGridScope, definitions: T[]) {
  const references = definitions.map(definition =>
    definition.source === 'graphql' && definition.valid !== false ? explorerReference(definition.graphql) : null
  );
  const ids = [...new Set(references.filter(ref => ref?.portal === scope.portal).map(ref => ref!.id))];
  const sources = new Map<string, Omit<NamedQueryExplorerSource, 'publishedRevision' | 'changedSincePublished'>>();
  if (ids.length) {
    const { collection, ObjectId } = savedGridStore();
    const rows = await collection.find({ ...scope, _id: { $in: ids.map(id => new ObjectId(id)) } }).toArray();
    for (const row of rows) {
      const parsed = savedGridDefinition.safeParse(row.definition);
      if (!parsed.success) continue;
      const recordType = explorerRecordType(parsed.data);
      sources.set(String(row._id), {
        id: String(row._id),
        revision: row.revision,
        name: parsed.data.name,
        recordType,
        recordTypeLabel: explorerRecordTypeLabel(recordType),
        mode: parsed.data.mode ?? 'visual',
        updatedAt: row.updatedAt ?? null,
        updatedBy: row.updatedBy ?? null,
        missing: false,
      });
    }
  }
  return definitions.map((definition, index) => {
    if (definition.source !== 'graphql' || definition.valid === false) return definition;
    const reference = references[index];
    const current = reference?.portal === scope.portal ? sources.get(reference.id) : undefined;
    const sourceSavedQuery: NamedQueryExplorerSource | null =
      !reference || reference.portal !== scope.portal
        ? null
        : {
            ...(current ?? {
              id: reference.id,
              revision: null,
              name: null,
              recordType: null,
              recordTypeLabel: null,
              mode: null,
              updatedAt: null,
              updatedBy: null,
              missing: true,
            }),
            publishedRevision: reference.revision,
            changedSincePublished: current ? current.revision !== reference.revision : null,
          };
    return { ...definition, sourceSavedQuery };
  });
}
