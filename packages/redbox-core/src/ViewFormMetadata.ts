import { FormConfigFrame, viewMetadataSource } from '@researchdatabox/sails-ng-common';

/** Project saved values through a client form whose role and mode checks have already run. */
export function projectViewMetadata(
  metadata: Record<string, unknown>,
  viewForm: Pick<FormConfigFrame, 'componentDefinitions'>
): Record<string, unknown> {
  type ViewNode = {
    name?: string;
    model?: unknown;
    [viewMetadataSource]?: ViewNode;
    component?: {
      class?: string;
      config?: object;
    };
  };
  type ViewConfig = {
    componentDefinitions?: ViewNode[];
    tabs?: ViewNode[];
    panels?: ViewNode[];
    elementTemplate?: ViewNode;
    questions?: { id: string }[];
    content?: unknown;
  };
  const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  const children = (node: ViewNode): ViewNode[] => {
    const config = node.component?.config as ViewConfig | undefined;
    return [...(config?.componentDefinitions ?? []), ...(config?.tabs ?? []), ...(config?.panels ?? [])];
  };
  const isDeepEmpty = (value: unknown): boolean =>
    value === null || value === undefined || value === '' ||
    (Array.isArray(value) ? value.every(isDeepEmpty) : isObject(value) && Object.values(value).every(isDeepEmpty));
  const sourceNode = (node: ViewNode): ViewNode => node[viewMetadataSource] ?? node;
  const isContainer = (node: ViewNode): boolean => {
    const source = sourceNode(node);
    const config = source.component?.config as ViewConfig | undefined;
    return source.component?.class === 'GroupComponent' || source.component?.class === 'RepeatableComponent' ||
      config?.componentDefinitions !== undefined || config?.elementTemplate !== undefined ||
      config?.tabs !== undefined || config?.panels !== undefined;
  };
  const fieldDefinition = (node: ViewNode, name: string): ViewNode | undefined => {
    for (const child of children(sourceNode(node))) {
      if (child.name === name && (child.model || child.component?.class === 'ContentComponent')) return child;
      if (!child.model && child.component?.class !== 'ContentComponent') {
        const descendant = fieldDefinition(child, name);
        if (descendant) return descendant;
      }
    }
    return undefined;
  };
  // Intersect container structure after authorization. A permitted modeled leaf
  // owns its entire saved value, even when its display exposes only a label.
  // Both sides omit deeply empty rows before positional matching.
  const intersectContent = (value: unknown, content: unknown, node: ViewNode): unknown => {
    const source = sourceNode(node);
    if (!isContainer(source)) return source.model ? value : undefined;
    const config = source.component?.config as ViewConfig | undefined;
    if (source.component?.class === 'QuestionTreeComponent') {
      // Question displays are label rows, not keyed answer objects. The source
      // children have already passed role and mode checks before transformation.
      const questions = (config?.componentDefinitions ?? [])
        .filter(child => config?.questions?.some(question => question.id === child.name));
      return isObject(value) ? projectObject(value, questions) : undefined;
    }
    if (Array.isArray(value)) {
      if (!Array.isArray(content)) return undefined;
      const displayedRows = content.filter(entry => !isDeepEmpty(entry));
      return value.filter(entry => !isDeepEmpty(entry))
        .map((entry, index) => (Object.hasOwn(displayedRows, index) ? intersectContent(entry, displayedRows[index], config?.elementTemplate ?? {}) : undefined))
        .filter(entry => entry !== undefined);
    }
    if (isObject(value)) {
      if (!isObject(content)) return undefined;
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => Object.hasOwn(content, key))
          .map(([key, entry]) => [key, intersectContent(entry, content[key], fieldDefinition(source, key) ?? {})])
          .filter(([, entry]) => entry !== undefined)
      );
    }
    return value;
  };
  const projectValue = (value: unknown, node: ViewNode): unknown => {
    const config = node.component?.config as ViewConfig | undefined;
    if (node.component?.class === 'GroupComponent' || config?.componentDefinitions) {
      return isObject(value) ? projectObject(value, children(node)) : undefined;
    }
    if (node.component?.class === 'RepeatableComponent') {
      const element = config?.elementTemplate;
      return Array.isArray(value) && element
        ? value.map(entry => projectValue(entry, element)).filter(entry => entry !== undefined)
        : undefined;
    }
    if (node.component?.class === 'ContentComponent') {
      const source = node[viewMetadataSource];
      if (source) {
        if (!isContainer(source) && source.model) return value;
        // Containers always retain the content intersection, including custom
        // templates, empty content and the descendant-value fallback.
        return intersectContent(projectValue(value, source), config?.content, source);
      }
      // Static displays do not establish permission to read saved metadata.
      return undefined;
    }
    // A modeled leaf may legitimately store an arbitrary object.
    return node.model ? value : undefined;
  };
  const projectObject = (value: Record<string, unknown>, definitions: ViewNode[]): Record<string, unknown> => {
    const entries: [string, unknown][] = [];
    const visit = (node: ViewNode): void => {
      if (node.name && (node.model || node.component?.class === 'ContentComponent')) {
        if (Object.hasOwn(value, node.name)) {
          const projected = projectValue(value[node.name], node);
          if (projected !== undefined) {
            entries.push([node.name, projected]);
          }
        }
        return;
      }
      children(node).forEach(visit);
    };
    definitions.forEach(visit);
    return Object.fromEntries(entries);
  };
  return projectObject(metadata, viewForm.componentDefinitions ?? []);
}
