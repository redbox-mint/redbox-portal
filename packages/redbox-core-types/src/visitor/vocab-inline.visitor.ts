import type { ILogger } from '../Logger';
import {
  CheckboxOption,
  CheckboxTreeNode,
  DropdownOption,
  FormConfigOutline,
  FormConfigVisitor,
  RadioOption
} from '@researchdatabox/sails-ng-common';

type ComponentConfigWithInlineVocab = {
  options?: DropdownOption[] | RadioOption[] | CheckboxOption[];
  treeData?: CheckboxTreeNode[];
  vocabRef?: string;
  inlineVocab?: boolean;
};

type VocabularyEntry = NonNullable<Awaited<ReturnType<typeof VocabularyService.getEntries>>>['entries'][number];

export class VocabInlineFormConfigVisitor extends FormConfigVisitor {
  private branding = '';
  private pendingResolutions: Promise<void>[] = [];

  constructor(logger: ILogger) {
    super(logger);
  }

  public async resolveVocabs(form: FormConfigOutline, brandingOverride?: string): Promise<void> {
    const branding = this.resolveBranding(brandingOverride);
    if (!branding) {
      return;
    }

    this.branding = branding;
    this.pendingResolutions = [];
    this.walkNode(form, new WeakSet<object>());
    await Promise.all(this.pendingResolutions);
  }

  private walkNode(node: unknown, visited: WeakSet<object>): void {
    if (!node || typeof node !== 'object') {
      return;
    }

    if (visited.has(node as object)) {
      return;
    }
    visited.add(node as object);

    this.enqueueIfInlineVocab(node as Record<string, unknown>);

    if (Array.isArray(node)) {
      for (const item of node) {
        this.walkNode(item, visited);
      }
      return;
    }

    for (const value of Object.values(node)) {
      this.walkNode(value, visited);
    }
  }

  private enqueueIfInlineVocab(node: Record<string, unknown>): void {
    const componentConfig = node?.config as ComponentConfigWithInlineVocab | undefined;
    if (!componentConfig?.inlineVocab || !componentConfig.vocabRef) {
      return;
    }

    const componentClass = String(node?.class ?? '');
    const treeMode = componentClass === 'CheckboxTreeComponent' || componentClass.includes('CheckboxTree');
    this.pendingResolutions.push(
      this.resolveInlineVocab({ config: componentConfig, name: String(node?.name ?? '') }, componentConfig, treeMode)
    );
  }

  private async resolveInlineVocab(
    definition: { config?: ComponentConfigWithInlineVocab; name?: string },
    componentConfig: ComponentConfigWithInlineVocab,
    treeMode: boolean
  ): Promise<void> {
    const vocabService = this.getVocabularyService();
    if (!vocabService?.getEntries) {
      this.logger.warn('VocabularyService.getEntries is not available, skipping inline vocab resolution');
      return;
    }

    try {
      const entries = await this.fetchAllEntries(vocabService, this.branding, String(componentConfig.vocabRef ?? ''));
      if (treeMode) {
        componentConfig.treeData = this.buildTreeData(entries);
        return;
      }
      componentConfig.options = entries.map((entry) => ({
        label: String(entry?.label ?? ''),
        value: String(entry?.value ?? '')
      }));
    } catch (error) {
      this.logger.warn(
        `Failed to resolve inline vocab '${componentConfig.vocabRef}' for component '${definition?.name ?? ''}'`
      );
      this.logger.debug(error);
      throw error;
    }
  }

  private async fetchAllEntries(
    vocabService: Pick<typeof VocabularyService, 'getEntries'>,
    branding: string,
    vocabRef: string
  ): Promise<VocabularyEntry[]> {
    const allEntries: VocabularyEntry[] = [];
    const limit = 1000;
    let offset = 0;
    let total: number | null = null;

    while (total === null || allEntries.length < total) {
      const response = await vocabService.getEntries(branding, vocabRef, { limit, offset });
      if (!response) {
        throw new Error(`Inline vocabulary '${vocabRef}' was not found for branding '${branding}'`);
      }
      const pageEntries = response.entries ?? [];
      allEntries.push(...pageEntries);

      const responseTotal = Number(response?.meta?.total);
      if (Number.isFinite(responseTotal) && responseTotal >= 0) {
        total = responseTotal;
      } else if (total === null) {
        total = pageEntries.length;
      }

      if (pageEntries.length === 0) {
        break;
      }
      offset += pageEntries.length;
    }

    return allEntries;
  }

  private buildTreeData(entries: VocabularyEntry[]): CheckboxTreeNode[] {
    const nodeById = new Map<string, CheckboxTreeNode>();
    const entryIds = new Set<string>();
    const rootNodes: CheckboxTreeNode[] = [];

    for (const entry of entries) {
      const id = String(entry?.id ?? '').trim();
      if (!id) {
        continue;
      }
      entryIds.add(id);
      nodeById.set(id, {
        id,
        label: String(entry?.label ?? ''),
        value: String(entry?.value ?? ''),
        notation: String((entry as any)?.identifier ?? '').trim() || String(entry?.value ?? '').trim() || undefined,
        parent: String((entry as any)?.parent ?? '').trim() || null,
        children: [],
        hasChildren: false
      });
    }

    for (const node of nodeById.values()) {
      const parentId = String(node.parent ?? '').trim();
      if (parentId && entryIds.has(parentId)) {
        const parent = nodeById.get(parentId);
        if (parent) {
          parent.children = parent.children ?? [];
          parent.children.push(node);
          parent.hasChildren = true;
        }
      } else {
        rootNodes.push(node);
      }
    }

    return rootNodes;
  }

  private resolveBranding(brandingOverride?: string): string {
    const normalizedOverride = String(brandingOverride ?? '').trim();
    if (normalizedOverride) {
      return normalizedOverride;
    }
    return String((globalThis as any)?.sails?.config?.auth?.defaultBrand ?? '').trim();
  }

  private getVocabularyService(): Pick<typeof VocabularyService, 'getEntries'> | undefined {
    return (globalThis as any)?.VocabularyService;
  }
}
