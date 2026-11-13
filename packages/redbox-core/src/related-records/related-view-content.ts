import { cloneDeep, get, set } from 'lodash';
import {
  FormPathHelper, jsonataEvaluateFunc, projectRelatedDisplayMetadata,
  relatedDisplayPointerTokens, type FormConfigOutline,
  type FormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import { pruneRelatedViewValues } from './display-descriptors';

/** Resolve view values while models still exist, before normal content conversion.
 * Only declared display targets and their trusted source events participate.
 * The form has already passed caller role/mode pruning and source authorization.
 */
export async function populateRelatedViewContent(
  form: FormConfigOutline,
  metadata: Record<string, unknown>,
  runtimeContext: Record<string, unknown> = {},
): Promise<void> {
  const contract = form.relatedRecords;
  if (!contract) return;
  const values = projectRelatedDisplayMetadata(cloneDeep(metadata), contract);
  type Node = FormComponentDefinitionOutline & {
    component: { class: string; config?: Record<string, unknown> };
    model?: { config?: Record<string, unknown> };
  };
  const nodes: { item: Node; tokens: string[] }[] = [];
  const walk = (items: Node[], parent: string[]): void => {
    for (const item of items) {
      const tokens = [...parent, ...FormPathHelper.metadataTokensForComponent(item).map(String)];
      nodes.push({ item, tokens });
      const config = item.component.config;
      for (const key of ['componentDefinitions', 'tabs', 'panels']) {
        if (Array.isArray(config?.[key])) walk(config[key] as Node[], tokens);
      }
      // Repeatable rows are one complete display target. Row templates describe
      // shape/authorization, rather than a second root metadata path.
    }
  };
  walk(form.componentDefinitions as Node[], []);
  for (const target of contract.displayTargets) {
    const tokens = relatedDisplayPointerTokens(target.metadataPointer);
    // A hidden title carrier and its visible field may share a metadata path.
    // Evaluate the trusted binding on every surviving model at that path.
    for (const node of nodes.filter(entry => entry.item.model && JSON.stringify(entry.tokens) === JSON.stringify(tokens))) {
      for (const expression of node.item.expressions ?? []) {
        const config = expression.config;
        if (!('target' in config) || config.target !== 'model.value' ||
            (config.conditionKind ?? 'jsonpointer') !== 'jsonpointer') continue;
        const source = contract.sources.find(source =>
          config.condition === `${source.componentPointer}::field.value.changed`);
        if (!source?.initialResult) continue;
        const event = { type: 'field.value.changed', fieldId: source.componentPointer,
          sourceId: source.componentPointer, value: cloneDeep(source.initialResult) };
        const value = config.template
          ? await jsonataEvaluateFunc(config.template)({ formData: cloneDeep(values), event, runtimeContext: cloneDeep(runtimeContext) })
          : event.value;
        set(values, tokens, cloneDeep(value));
      }
    }
  }
  // Update parent group snapshots and their leaf models together. Missing
  // linked values become null, never a retained/default source snapshot.
  for (const { item, tokens } of nodes) {
    if (item.component.config?.relatedViewPreserved !== true) continue;
    if (item.model?.config) item.model.config.value = cloneDeep(get(values, tokens, null));
  }
  // Source payloads can contain fields denied by the target's nested controls.
  // Project again before groups/repeatables flatten those values into content.
  pruneRelatedViewValues(form);
}
