import { ControlledValueResolver } from '../discovery/ControlledValueResolver';
import { MetadataDiscoveryResult } from '../discovery/types';
import { FigshareCategory } from '../figshare/types';
import { ControlledValueResult, FigshareMetadataModel, NormalisedCategory, NormalisedField } from './types';

function parentId(category: FigshareCategory): string | number | undefined {
  if (category.parent_id == null || category.parent_id === 0 || category.parent_id === '0') return undefined;
  return category.parent_id;
}

export function buildCategoryPaths(categories: FigshareCategory[]): Map<string, string> {
  const categoriesById = new Map(categories.map(category => [String(category.id), category]));
  const cache = new Map<string, string>();
  function pathFor(category: FigshareCategory, visited: Set<string>): string {
    const id = String(category.id);
    const existing = cache.get(id);
    if (existing != null) return existing;
    const parent = parentId(category);
    if (parent == null || visited.has(id)) {
      cache.set(id, category.title);
      return category.title;
    }
    visited.add(id);
    const parentCategory = categoriesById.get(String(parent));
    const result = parentCategory == null ? category.title : `${pathFor(parentCategory, visited)} → ${category.title}`;
    cache.set(id, result);
    return result;
  }
  for (const category of categories) pathFor(category, new Set());
  return cache;
}

function withControlledValues(field: NormalisedField, result: ControlledValueResult): NormalisedField {
  switch (result.kind) {
    case 'none':
      return { ...field, valueSource: 'none' };
    case 'inline':
      return { ...field, valueSource: 'inline', values: result.values };
    case 'api-reference':
      return {
        ...field,
        valueSource: result.entity === 'license' || result.entity === 'category' ? result.entity : 'dynamic',
        valueSourceDescription: result.entity,
        values: result.values,
      };
    case 'dynamic':
      return { ...field, valueSource: 'dynamic', valueSourceDescription: result.description };
    case 'unknown':
      return { ...field, valueSource: 'unknown' };
  }
}

export class MetadataNormaliser {
  public constructor(
    private readonly baseUrl: string,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async normalise(discovery: MetadataDiscoveryResult): Promise<FigshareMetadataModel> {
    const categoryPaths = buildCategoryPaths(discovery.categories);
    const resolver = new ControlledValueResolver(discovery.licenses, discovery.categories, categoryPaths);
    const fields: NormalisedField[] = [];

    for (const field of discovery.fields) {
      const candidate: NormalisedField = {
        id: field.id,
        name: field.name ?? String(field.id),
        displayName: field.displayName,
        type: field.fieldType ?? 'unknown',
        required: field.required ?? false,
        description: field.description,
        hint: field.hint,
        source: field.source,
        settings: field.settings,
        order: field.order,
        valueSource: 'unknown',
        rawDefinition: field.rawDefinition,
        rawConfiguration: field.rawConfiguration,
      };
      fields.push(withControlledValues(candidate, await resolver.resolve(candidate)));
    }

    const categories: NormalisedCategory[] = discovery.categories.map(category => ({
      id: category.id,
      title: category.title,
      parentId: parentId(category),
      path: categoryPaths.get(String(category.id)) ?? category.title,
      raw: category.raw,
    }));
    return {
      generatedAt: this.now().toISOString(),
      source: {
        baseUrl: this.baseUrl,
        apiVersions: ['v2'],
        discoveryMode: 'cqu-v2-dataset',
        groupId: discovery.target.groupId,
      },
      referencedEntities: {
        licenses: discovery.licenses.map(license => ({
          id: license.id,
          name: license.name,
          url: license.url,
          raw: license.raw,
        })),
        categories,
      },
      itemTypes: [
        {
          id: discovery.target.itemType,
          name: 'Dataset',
          groupId: discovery.target.groupId,
          raw: {
            defined_type: discovery.target.itemType,
            group_id: discovery.target.groupId,
            provenance: 'cqu-redbox-configuration',
          },
          fields,
        },
      ],
    };
  }
}
