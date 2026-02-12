import { ILogger } from '../Logger';
import {
  CheckboxInputComponentName,
  CheckboxOption,
  CheckboxTreeComponentName,
  CheckboxTreeNode,
  DropdownInputComponentName,
  DropdownOption,
  FormComponentDefinitionOutline,
  FormConfigOutline,
  GroupFieldComponentName,
  GroupFormComponentDefinitionOutline,
  RadioInputComponentName,
  RadioOption,
  RepeatableComponentName,
  RepeatableFormComponentDefinitionOutline,
  TabComponentName,
  TabContentComponentName,
  TabContentFormComponentDefinitionOutline,
  TabFormComponentDefinitionOutline
} from '@researchdatabox/sails-ng-common';

type ComponentConfigWithInlineVocab = {
  options?: DropdownOption[] | RadioOption[] | CheckboxOption[];
  treeData?: CheckboxTreeNode[];
  vocabRef?: string;
  inlineVocab?: boolean;
};

type VocabularyEntry = NonNullable<Awaited<ReturnType<typeof VocabularyService.getEntries>>>['entries'][number];

/**
 * Resolve vocab-backed options into form component configs at build time.
 */
export class VocabInlineFormConfigVisitor {
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  public async resolveVocabs(form: FormConfigOutline, brandingOverride?: string): Promise<void> {
    const branding = this.resolveBranding(brandingOverride);
    if (!branding) {
      return;
    }

    await this.resolveOnDefinitions(form?.componentDefinitions ?? [], branding);
  }

  private async resolveOnDefinitions(definitions: FormComponentDefinitionOutline[], branding: string): Promise<void> {
    for (const definition of definitions) {
      await this.resolveOnDefinition(definition, branding);
    }
  }

  private async resolveOnDefinition(definition: FormComponentDefinitionOutline, branding: string): Promise<void> {
    const componentClass = String(definition?.component?.class ?? '');

    if (
      componentClass === DropdownInputComponentName ||
      componentClass === RadioInputComponentName ||
      componentClass === CheckboxInputComponentName
    ) {
      await this.resolveComponentVocab(definition, branding);
      return;
    }

    if (componentClass === CheckboxTreeComponentName) {
      await this.resolveTreeComponentVocab(definition, branding);
      return;
    }

    if (componentClass === GroupFieldComponentName) {
      const groupDefinition = definition as GroupFormComponentDefinitionOutline;
      const children = groupDefinition?.component?.config?.componentDefinitions;
      await this.resolveOnDefinitions(children ?? [], branding);
      return;
    }

    if (componentClass === TabComponentName) {
      const tabDefinition = definition as TabFormComponentDefinitionOutline;
      const tabs = tabDefinition?.component?.config?.tabs;
      await this.resolveOnDefinitions(tabs ?? [], branding);
      return;
    }

    if (componentClass === TabContentComponentName) {
      const tabContentDefinition = definition as TabContentFormComponentDefinitionOutline;
      const children = tabContentDefinition?.component?.config?.componentDefinitions;
      await this.resolveOnDefinitions(children ?? [], branding);
      return;
    }

    if (componentClass === RepeatableComponentName) {
      const repeatableDefinition = definition as RepeatableFormComponentDefinitionOutline;
      const elementTemplate = repeatableDefinition?.component?.config?.elementTemplate;
      if (elementTemplate) {
        await this.resolveOnDefinition(elementTemplate, branding);
      }
    }
  }

  private async resolveComponentVocab(definition: FormComponentDefinitionOutline, branding: string): Promise<void> {
    const config = definition?.component?.config as ComponentConfigWithInlineVocab | undefined;
    if (!config?.inlineVocab || !config.vocabRef) {
      return;
    }

    const vocabService = this.getVocabularyService();
    if (!vocabService?.getEntries) {
      this.logger.warn('VocabularyService.getEntries is not available, skipping inline vocab resolution');
      return;
    }

    try {
      const entries = await this.fetchAllEntries(vocabService, branding, config.vocabRef);
      config.options = entries.map((entry) => ({
        label: String(entry?.label ?? ''),
        value: String(entry?.value ?? '')
      }));
    } catch (error) {
      this.logger.warn(`Failed to resolve inline vocab '${config.vocabRef}' for component '${definition?.name ?? ''}'`);
      this.logger.debug(error);
      throw error;
    }
  }

  private async resolveTreeComponentVocab(definition: FormComponentDefinitionOutline, branding: string): Promise<void> {
    const config = definition?.component?.config as ComponentConfigWithInlineVocab | undefined;
    if (!config?.inlineVocab || !config.vocabRef) {
      return;
    }

    const vocabService = this.getVocabularyService();
    if (!vocabService?.getEntries) {
      this.logger.warn('VocabularyService.getEntries is not available, skipping inline vocab resolution');
      return;
    }

    try {
      const entries = await this.fetchAllEntries(vocabService, branding, config.vocabRef);
      config.treeData = this.buildTreeData(entries);
    } catch (error) {
      this.logger.warn(`Failed to resolve inline vocab '${config.vocabRef}' for component '${definition?.name ?? ''}'`);
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
    const globals = globalThis as any;
    if (globals?.VocabularyService?.getEntries) {
      return globals.VocabularyService as Pick<typeof VocabularyService, 'getEntries'>;
    }

    const service = globals?.sails?.services?.vocabularyservice;
    if (service?.getEntries) {
      return service as Pick<typeof VocabularyService, 'getEntries'>;
    }

    return undefined;
  }
}
