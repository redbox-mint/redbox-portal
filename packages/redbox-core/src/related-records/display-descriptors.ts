import { formatJsonPointer as pointer } from '@jsonjoy.com/json-pointer';
import { cloneDeep, cloneDeepWith, toPath } from 'lodash';
import {
  FormOverride,
  FormPathHelper,
  KindNameDefaultsMap,
  FieldModelDefinitionKind,
  FormComponentDefinitionKind,
  effectiveReusableComponents,
  viewMetadataSource,
  type FormComponentDefinitionOutline,
  consoleLogger,
  type FormConfigFrame,
  type FormConfigOutline,
  type FormComponentDefinitionFrame,
  type ReusableFormDefinitions,
  type AvailableFormComponentDefinitionFrames,
  type RelatedDisplayDescriptor,
  type RelatedFormDescriptors,
} from '@researchdatabox/sails-ng-common';
import { buildRecordRelationId, normalizeRecordRelation, type RecordRelation } from '../config/recordtype.config';

export interface CompiledRelatedDisplayContract {
  displayTargets: RelatedDisplayDescriptor[];
  sources: { componentPointer: string; relationId: string; required?: boolean }[];
  /** Only referenced definitions enter fingerprints. */
  relations: RecordRelation[];
}

/** Compile trusted canonical configuration, before caller constraints or presentation transforms.
 * Uses the construction reusable expander and lineage helper, including named model-free groups.
 * Client-supplied descriptor carriers are deliberately ignored.
 */
export function compileRelatedDisplayContract(
  form: FormConfigFrame,
  reusableFormDefs: ReusableFormDefinitions = {},
  relations?: readonly RecordRelation[]
): CompiledRelatedDisplayContract | undefined {
  // Follow only structural children and reusable references reachable from this form.
  // No expansion, registry construction, or validation runs for legacy forms.
  const seen = new WeakSet<object>();
  const hasOptIn = (items: readonly FormComponentDefinitionFrame[]): boolean =>
    items.some(item => {
      if (seen.has(item)) return false;
      seen.add(item);
      if (item.relatedDisplay !== undefined) return true;
      const config = item.component?.config as Record<string, unknown> | undefined;
      if (item.component?.class === 'RelatedObjectDataComponent' && config?.relationId !== undefined) return true;
      const name = item.overrides?.reusableFormName;
      if (name && hasOptIn(reusableFormDefs[name] ?? [])) return true;
      return (
        ['componentDefinitions', 'tabs', 'panels'].some(
          key => Array.isArray(config?.[key]) && hasOptIn(config[key] as FormComponentDefinitionFrame[])
        ) ||
        (!!config?.elementTemplate && hasOptIn([config.elementTemplate as FormComponentDefinitionFrame]))
      );
    });
  if (!hasOptIn(form?.componentDefinitions ?? [])) return undefined;
  const overrides = new FormOverride(consoleLogger);
  const targets = new Map<string, string>();
  const variants: { path: string; relation?: string }[] = [];
  const sources: CompiledRelatedDisplayContract['sources'] = [];
  const used = new Set<string>();
  const relationId = (value: unknown): string => {
    if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
      throw new Error('Invalid related-record relationId');
    }
    used.add(value);
    return value;
  };
  let visited = 0;
  const walk = (
    items: FormComponentDefinitionFrame[],
    parent: string[],
    components: string[],
    inRepeatable = false,
    depth = 0
  ): void => {
    if (depth > 100) throw new Error('Related form configuration exceeds nesting limit');
    const expanded = items.flatMap(wrapper =>
      effectiveReusableComponents(
        wrapper,
        overrides.applyOverridesReusable(
          [cloneDeep(wrapper) as AvailableFormComponentDefinitionFrames],
          reusableFormDefs
        )
      )
    );
    for (const raw of expanded) {
      if (++visited > 50_000) throw new Error('Related form configuration exceeds component limit');
      if (raw.overrides?.replaceName !== undefined) raw.name = raw.overrides.replaceName;
      // Core defaults are data, not a closed class registry. Hook components may
      // declare an explicit model; model-free custom containers add no nesting.
      const modelClass =
        raw.model?.class ??
        KindNameDefaultsMap.get(FormComponentDefinitionKind)?.get(raw.component.class)?.get(FieldModelDefinitionKind);
      const item = {
        ...raw,
        model: modelClass ? { ...raw.model, class: modelClass } : undefined,
      } as FormComponentDefinitionOutline;
      const tokens = [...parent, ...FormPathHelper.metadataTokensForComponent(item)];
      const componentTokens = [...components, ...(item.name ? [item.name] : [])];
      const path = pointer(tokens);
      const config = raw.component.config as Record<string, unknown> | undefined;
      const declaration = raw.relatedDisplay;
      if (declaration && (inRepeatable || !path || (!item.model && item.component.class !== 'GroupComponent'))) {
        throw new Error('relatedDisplay must target a metadata field, whole group or complete repeatable');
      }
      const id = declaration ? relationId(declaration.relationId) : undefined;
      if (!inRepeatable && tokens.length && (item.model || item.component.class === 'GroupComponent')) {
        variants.push({ path, relation: id });
      }
      if (id) targets.set(path, id);
      if (item.component.class === 'RelatedObjectDataComponent' && config?.relationId !== undefined) {
        const sourceId = relationId(config.relationId);
        if (['dataPath', 'oidProperty', 'relatedFields'].some(key => config[key] !== undefined)) {
          throw new Error('relationId conflicts with legacy related-object reference configuration');
        }
        if (config.required !== undefined && typeof config.required !== 'boolean')
          throw new Error('Invalid related source required flag');
        if (inRepeatable) throw new Error('Related sources inside repeatable rows are unsupported');
        sources.push({
          componentPointer: pointer(componentTokens),
          relationId: sourceId,
          ...(config.required !== undefined ? { required: config.required as boolean } : {}),
        });
      }
      for (const key of ['componentDefinitions', 'tabs', 'panels']) {
        if (Array.isArray(config?.[key]))
          walk(config[key] as FormComponentDefinitionFrame[], tokens, componentTokens, inRepeatable, depth + 1);
      }
      if (config?.elementTemplate)
        walk([config.elementTemplate as FormComponentDefinitionFrame], tokens, componentTokens, true, depth + 1);
    }
  };
  walk(form.componentDefinitions ?? [], [], []);
  if (!used.size) return undefined;
  // Variants at the same path must agree, including an omitted declaration.
  for (const [path, id] of targets) {
    if (variants.some(other => other.path === path && other.relation !== id)) {
      throw new Error(`Conflicting relatedDisplay declarations at ${path}`);
    }
    for (const [otherPath, otherId] of targets) {
      if ((path.startsWith(otherPath + '/') || otherPath.startsWith(path + '/')) && id !== otherId) {
        throw new Error(`Incompatible overlapping relatedDisplay declarations at ${path}`);
      }
    }
  }
  const declarations = {
    displayTargets: [...targets].map(([metadataPointer, id]) => ({ metadataPointer, relationId: id })),
    sources,
    relations: [],
  };
  return relations === undefined ? declarations : bindRelatedDisplayContract(declarations, form.type ?? '', relations);
}

/** Bind fresh trusted relation configuration without expanding/compiling the form again. */
export function bindRelatedDisplayContract(
  declarations: CompiledRelatedDisplayContract,
  recordType: string,
  relations: readonly RecordRelation[]
): CompiledRelatedDisplayContract {
  const used = new Set([...declarations.displayTargets, ...declarations.sources].map(item => item.relationId));
  const referenced = [...used].sort().map(id => {
    const matches = relations.filter(relation => buildRecordRelationId(recordType, relation) === id);
    if (matches.length !== 1 || !matches[0].resolution)
      throw new Error(`Missing or ambiguous resolvable relation ${id}`);
    return cloneDeep(normalizeRecordRelation(recordType, matches[0]));
  });
  return { ...cloneDeep(declarations), relations: referenced };
}

const declarationCache = new Map<string, CompiledRelatedDisplayContract | undefined>();
/** The key is the existing bounded configuration fingerprint (excluding relations).
 * It detects in-place edits and newly loaded DB objects, unlike an object-identity cache.
 * Bound results are never cached: centralized relation edits take effect immediately.
 */
export function cachedRelatedDisplayDeclarations(
  configurationFingerprint: string,
  form: FormConfigFrame,
  reusableFormDefs: ReusableFormDefinitions
): CompiledRelatedDisplayContract | undefined {
  if (!declarationCache.has(configurationFingerprint)) {
    const compiled = compileRelatedDisplayContract(form, reusableFormDefs);
    if (declarationCache.size >= 64) declarationCache.delete(declarationCache.keys().next().value!);
    declarationCache.set(configurationFingerprint, compiled);
  }
  return cloneDeep(declarationCache.get(configurationFingerprint));
}

/** Hydrate canonical declarations using trusted centralized relationship definitions. */
export function relatedFormDescriptors(contract: CompiledRelatedDisplayContract): RelatedFormDescriptors {
  const relations = contract.relations.map(relation => {
    const tokens = relation.localField ? toPath(relation.localField) : [];
    if (tokens[0] !== 'metadata' || tokens.length < 2) {
      throw new Error(`Related source ${relation.id} must reference root metadata`);
    }
    return {
      relationId: relation.id!,
      referenceTokens: tokens.slice(1),
      ...(relation.oidProperty ? { oidTokens: toPath(relation.oidProperty) } : {}),
    };
  });
  return {
    displayTargets: cloneDeep(contract.displayTargets),
    relations,
    sources: contract.sources.map(source => {
      const reference = relations.find(item => item.relationId === source.relationId);
      if (!reference) throw new Error(`Missing related source definition ${source.relationId}`);
      return { ...source, ...cloneDeep(reference) };
    }),
  };
}

/** Readiness follows the caller's rendered sources; persistence keeps canonical targets/relations. */
export function pruneRelatedFormSources(form: FormConfigOutline): void {
  if (!form.relatedRecords) return;
  const surviving = new Set<string>();
  const walk = (items: FormComponentDefinitionOutline[], parent: string[]): void => {
    for (const item of items) {
      if (!item.component) continue;
      const tokens = [...parent, ...(item.name ? [item.name] : [])];
      const config = item.component.config as Record<string, unknown> | undefined;
      if (item.component.class === 'RelatedObjectDataComponent' && typeof config?.relationId === 'string') {
        surviving.add(JSON.stringify([pointer(tokens), config.relationId]));
      }
      for (const key of ['componentDefinitions', 'tabs', 'panels']) {
        if (Array.isArray(config?.[key])) walk(config[key] as FormComponentDefinitionOutline[], tokens);
      }
    }
  };
  walk(form.componentDefinitions, []);
  form.relatedRecords.sources = form.relatedRecords.sources.filter(source =>
    surviving.has(JSON.stringify([source.componentPointer, source.relationId])));
}

/** Keep reference/target models during server view hydration and role pruning.
 * Ordinary view flattening removes both reference values and target expressions.
 * Only intersecting subtrees are deferred; populateRelatedViewContent hydrates
 * them before FormsService applies the normal content presentation.
 */
export function prepareRelatedViewForm(
  form: FormConfigFrame,
  descriptors: RelatedFormDescriptors,
  reusableFormDefs: ReusableFormDefinitions = {}
): FormConfigFrame {
  // Remove authored markers everywhere, including defaults, overrides and reusable
  // definitions, before deriving the scoped view carrier below.
  const stripMarker = (value: unknown): unknown => value && typeof value === 'object'
    && Object.prototype.hasOwnProperty.call(value, 'relatedViewPreserved')
    ? cloneDeepWith(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'relatedViewPreserved')), stripMarker)
    : undefined;
  form = cloneDeepWith(form, stripMarker);
  reusableFormDefs = cloneDeepWith(reusableFormDefs, stripMarker);
  const paths = [
    ...descriptors.relations.map(relation => pointer(relation.referenceTokens)),
    ...descriptors.displayTargets.map(target => target.metadataPointer),
  ];
  const overrides = new FormOverride(consoleLogger);
  const walk = (items: FormComponentDefinitionFrame[], parent: string[], depth = 0): FormComponentDefinitionFrame[] => {
    if (depth > 100) throw new Error('Related form configuration exceeds nesting limit');
    return items.flatMap(wrapper => effectiveReusableComponents(wrapper,
      overrides.applyOverridesReusable([cloneDeep(wrapper) as AvailableFormComponentDefinitionFrames], reusableFormDefs)
    )).map(raw => {
      const item = cloneDeep(raw);
      if (item.overrides?.replaceName !== undefined) item.name = item.overrides.replaceName;
      const modelClass = item.model?.class ??
        KindNameDefaultsMap.get(FormComponentDefinitionKind)?.get(item.component.class)?.get(FieldModelDefinitionKind);
      const tokens = [...parent, ...FormPathHelper.metadataTokensForComponent({
        ...item, model: modelClass ? { ...item.model, class: modelClass } : undefined,
      } as FormComponentDefinitionOutline)];
      const path = pointer(tokens);
      const config = (item.component.config ??= {}) as Record<string, unknown>;
      delete config.relatedViewPreserved;
      if (path && paths.some(target => target === path || target.startsWith(path + '/') || path.startsWith(target + '/'))) {
        item.overrides = { ...item.overrides, __relatedViewOriginal: cloneDeep(item.overrides?.formModeClasses?.view ?? null),
          formModeClasses: { ...item.overrides?.formModeClasses,
          view: { component: item.component.class as Exclude<AvailableFormComponentDefinitionFrames['component']['class'], 'ReusableComponent'> } } } as typeof item.overrides;
        // View expressions may populate values, but must never re-enable editing.
        item.expressions = item.expressions?.filter(expression => expression.config && 'target' in expression.config && expression.config.target === 'model.value');
        config.relatedViewPreserved = true;
        config.readonly = true;
        config.disabled = true;
      }
      for (const key of ['componentDefinitions', 'tabs', 'panels']) {
        if (Array.isArray(config[key])) config[key] = walk(config[key] as FormComponentDefinitionFrame[], tokens, depth + 1);
      }
      if (config.elementTemplate) config.elementTemplate = walk([config.elementTemplate as FormComponentDefinitionFrame], tokens, depth + 1)[0];
      return item;
    });
  };
  return { ...cloneDeep(form), componentDefinitions: walk(form.componentDefinitions ?? [], []) as FormConfigFrame['componentDefinitions'] };
}

/** After caller pruning, container snapshots must contain only surviving model paths.
 * Do not send the original group snapshot alongside its filtered child controls.
 */
export function pruneRelatedViewValues(form: FormConfigOutline): void {
  const read = (value: unknown, tokens: string[]): unknown => tokens.reduce<unknown>((current, token) =>
    current && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, token)
      ? (current as Record<string, unknown>)[token] : undefined, value);
  const write = (value: Record<string, unknown>, tokens: string[], child: unknown): void => {
    const [head, ...tail] = tokens;
    if (!head || child === undefined) return;
    if (tail.length) {
      if (!Object.prototype.hasOwnProperty.call(value, head)) Object.defineProperty(value, head, { value: {}, enumerable: true, writable: true });
      write(value[head] as Record<string, unknown>, tail, child);
    } else Object.defineProperty(value, head, { value: child, enumerable: true, writable: true });
  };
  type ViewNode = {
    component?: { class?: string; config?: Record<string, unknown> & { elementTemplate?: ViewNode } };
    model?: { config?: Record<string, unknown> };
    [viewMetadataSource]?: ViewNode;
  };
  const children = (item: ViewNode): ViewNode[] => ['componentDefinitions', 'tabs', 'panels']
    .flatMap(key => (item.component?.config?.[key] as ViewNode[] | undefined) ?? []);
  const isContainer = (item: ViewNode): boolean => item.component?.class === 'GroupComponent' ||
    item.component?.class === 'RepeatableComponent' || ['componentDefinitions', 'tabs', 'panels', 'elementTemplate']
      .some(key => Object.prototype.hasOwnProperty.call(item.component?.config ?? {}, key));
  const project = (item: ViewNode, value: unknown): unknown => {
    // Content may represent a previously pruned scalar, group or repeatable.
    // Keep its surviving source shape, rather than treating every Content node
    // as a scalar and copying unfiltered nested snapshots from its parent.
    item = item[viewMetadataSource] ?? item;
    const template = item.component?.config?.elementTemplate;
    if (template) return Array.isArray(value) ? value.map(row => project(template, row)) : undefined;
    const fields = children(item);
    if (!fields.length) return isContainer(item) ? {} : item.model ? cloneDeep(value) : undefined;
    const result: Record<string, unknown> = {};
    for (const child of fields) {
      const tokens = FormPathHelper.metadataTokensForComponent((child[viewMetadataSource] ?? child) as Parameters<typeof FormPathHelper.metadataTokensForComponent>[0]).map(String);
      const projected = project(child, read(value, tokens));
      if (tokens.length) write(result, tokens, projected);
      else if (projected && typeof projected === 'object') {
        for (const [key, entry] of Object.entries(projected)) write(result, [key], entry);
      }
    }
    return result;
  };
  const walk = (item: ViewNode): void => {
    for (const child of children(item)) walk(child);
    if (item.component?.config?.elementTemplate) walk(item.component.config.elementTemplate);
    if (isContainer(item)) {
      for (const key of ['value', 'defaultValue', 'newEntryValue']) {
        if (item.model?.config && Object.prototype.hasOwnProperty.call(item.model.config, key)) {
          item.model.config[key] = project(item, item.model.config[key]);
        }
      }
    }
  };
  for (const item of (form.componentDefinitions ?? []) as unknown as ViewNode[]) walk(item);
}
