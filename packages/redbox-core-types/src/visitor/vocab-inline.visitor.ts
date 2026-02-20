import type { ILogger } from '../Logger';
import {
  AccordionFieldComponentDefinitionOutline,
  AccordionFormComponentDefinitionOutline,
  AccordionPanelFieldComponentDefinitionOutline,
  AccordionPanelFormComponentDefinitionOutline,
  CheckboxInputFormComponentDefinitionOutline,
  CheckboxOption,
  CheckboxTreeFormComponentDefinitionOutline,
  CheckboxTreeNode,
  DropdownInputFormComponentDefinitionOutline,
  DropdownOption,
  FormConfigOutline,
  FormConfigVisitor,
  GroupFieldComponentDefinitionOutline,
  GroupFormComponentDefinitionOutline,
  RadioInputFormComponentDefinitionOutline,
  RadioOption,
  RepeatableFieldComponentDefinitionOutline,
  RepeatableFormComponentDefinitionOutline,
  TabContentFieldComponentDefinitionOutline,
  TabContentFormComponentDefinitionOutline,
  TabFieldComponentDefinitionOutline,
  TabFormComponentDefinitionOutline
} from '@researchdatabox/sails-ng-common';
import { VocabularyEntryAttributes } from '../waterline-models';

type ComponentConfigWithInlineVocab = {
  options?: DropdownOption[] | RadioOption[] | CheckboxOption[];
  treeData?: CheckboxTreeNode[];
  vocabRef?: string;
  inlineVocab?: boolean;
};


export class VocabInlineFormConfigVisitor extends FormConfigVisitor {
  protected override logName = 'VocabInlineFormConfigVisitor';
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
    form.accept(this);
    await Promise.all(this.pendingResolutions);
  }

  protected override notImplemented(): void {
    // No-op for components that are irrelevant to inline vocab resolution.
  }

  visitFormConfig(item: FormConfigOutline): void {
    item.componentDefinitions.forEach((component) => {
      component.accept(this);
    });
  }

  visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
    this.enqueueIfInlineVocab(item.name, item.component?.config, false);
  }

  visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
    this.enqueueIfInlineVocab(item.name, item.component?.config, false);
  }

  visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
    this.enqueueIfInlineVocab(item.name, item.component?.config, false);
  }

  visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): void {
    this.enqueueIfInlineVocab(item.name, item.component?.config, true);
  }

  visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
    item.component.accept(this);
  }

  visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
    item.config?.componentDefinitions?.forEach((def) => def.accept(this));
  }

  visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
    item.component.accept(this);
  }

  visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
    item.config?.tabs?.forEach((tab) => tab.accept(this));
  }

  visitAccordionFormComponentDefinition(item: AccordionFormComponentDefinitionOutline): void {
    item.component.accept(this);
  }

  visitAccordionFieldComponentDefinition(item: AccordionFieldComponentDefinitionOutline): void {
    item.config?.panels?.forEach((panel) => panel.accept(this));
  }

  visitAccordionPanelFormComponentDefinition(item: AccordionPanelFormComponentDefinitionOutline): void {
    item.component.accept(this);
  }

  visitAccordionPanelFieldComponentDefinition(item: AccordionPanelFieldComponentDefinitionOutline): void {
    item.config?.componentDefinitions?.forEach((def) => def.accept(this));
  }

  visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
    item.component.accept(this);
  }

  visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
    item.config?.componentDefinitions?.forEach((def) => def.accept(this));
  }

  visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
    item.component.accept(this);
  }

  visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
    item.config?.elementTemplate?.accept(this);
  }

  private enqueueIfInlineVocab(
    name: string | undefined,
    componentConfig: ComponentConfigWithInlineVocab | undefined,
    treeMode: boolean
  ): void {
    if (!componentConfig?.inlineVocab || !componentConfig.vocabRef) {
      return;
    }

    this.pendingResolutions.push(
      this.resolveInlineVocab({ config: componentConfig, name: String(name ?? '') }, componentConfig, treeMode)
    );
  }

  private async resolveInlineVocab(
    definition: { config?: ComponentConfigWithInlineVocab; name?: string },
    componentConfig: ComponentConfigWithInlineVocab,
    treeMode: boolean
  ): Promise<void> {

    try {
      const entries = await this.fetchAllEntries(this.branding, String(componentConfig.vocabRef ?? ''));
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
    branding: string,
    vocabRef: string
  ): Promise<VocabularyEntryAttributes[]> {
    const allEntries: VocabularyEntryAttributes[] = [];
    const limit = 1000;
    let offset = 0;
    let total: number | null = null;

    while (total === null || allEntries.length < total) {
      const response = await VocabularyService.getEntries(branding, vocabRef, { limit, offset });
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

  private buildTreeData(entries: VocabularyEntryAttributes[]): CheckboxTreeNode[] {
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
        notation: String(entry.identifier ?? '').trim() || String(entry?.value ?? '').trim() || undefined,
        parent: String(entry.parent ?? '').trim() || null,
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
    return String(sails?.config?.auth?.defaultBrand ?? '').trim();
  }

}
