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
  FormComponentDefinitionOutline,
  HistoricalVocabMode,
  EditTableFieldComponentDefinitionOutline,
  EditTableFormComponentDefinitionOutline,
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

type InlineCheckboxTreeNode = CheckboxTreeNode & { disabled?: boolean };

type ComponentConfigWithInlineVocab = {
  options?: DropdownOption[] | RadioOption[] | CheckboxOption[];
  treeData?: CheckboxTreeNode[];
  vocabRef?: string;
  inlineVocab?: boolean;
  historicalVocabMode?: HistoricalVocabMode;
};

type ResolveVocabsOptions = {
  includeHistoricalValues?: boolean;
};


export class VocabInlineFormConfigVisitor extends FormConfigVisitor {
  protected override logName = 'VocabInlineFormConfigVisitor';
  private branding = '';
  private includeHistoricalValues = false;
  private pendingResolutions: Promise<void>[] = [];

  constructor(logger: ILogger) {
    super(logger);
  }

  public async resolveVocabs(
    form: FormConfigOutline,
    brandingOverride?: string,
    options?: ResolveVocabsOptions
  ): Promise<void> {
    const branding = this.resolveBranding(brandingOverride);
    if (!branding) {
      return;
    }

    this.branding = branding;
    this.includeHistoricalValues = options?.includeHistoricalValues === true;
    this.pendingResolutions = [];
    await form.accept(this);
    await Promise.all(this.pendingResolutions);
  }

  protected override async notImplemented(): Promise<void> {
    // No-op for components that are irrelevant to inline vocab resolution.
  }

  async visitFormConfig(item: FormConfigOutline): Promise<void> {
    for (const component of item.componentDefinitions) {
      await component.accept(this);
    }
  }

  async visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): Promise<void> {
    await this.enqueueIfInlineVocab(item, item.component?.config, false);
  }

  async visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): Promise<void> {
    await this.enqueueIfInlineVocab(item, item.component?.config, false);
  }

  async visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): Promise<void> {
    await this.enqueueIfInlineVocab(item, item.component?.config, false);
  }

  async visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): Promise<void> {
    await this.enqueueIfInlineVocab(item, item.component?.config, true);
  }

  async visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): Promise<void> {
    await item.component.accept(this);
  }

  async visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): Promise<void> {
    for (const def of item.config?.componentDefinitions ?? []) {
      await def.accept(this);
    }
  }

  async visitEditTableFormComponentDefinition(item: EditTableFormComponentDefinitionOutline): Promise<void> {
    await item.component.accept(this);
  }

  async visitEditTableFieldComponentDefinition(item: EditTableFieldComponentDefinitionOutline): Promise<void> {
    for (const def of item.config?.componentDefinitions ?? []) {
      await def.accept(this);
    }
  }

  async visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): Promise<void> {
    await item.component.accept(this);
  }

  async visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): Promise<void> {
    for (const tab of item.config?.tabs ?? []) {
      await tab.accept(this);
    }
  }

  async visitAccordionFormComponentDefinition(item: AccordionFormComponentDefinitionOutline): Promise<void> {
    await item.component.accept(this);
  }

  async visitAccordionFieldComponentDefinition(item: AccordionFieldComponentDefinitionOutline): Promise<void> {
    for (const panel of item.config?.panels ?? []) {
      await panel.accept(this);
    }
  }

  async visitAccordionPanelFormComponentDefinition(item: AccordionPanelFormComponentDefinitionOutline): Promise<void> {
    await item.component.accept(this);
  }

  async visitAccordionPanelFieldComponentDefinition(item: AccordionPanelFieldComponentDefinitionOutline): Promise<void> {
    for (const def of item.config?.componentDefinitions ?? []) {
      await def.accept(this);
    }
  }

  async visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): Promise<void> {
    await item.component.accept(this);
  }

  async visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): Promise<void> {
    for (const def of item.config?.componentDefinitions ?? []) {
      await def.accept(this);
    }
  }

  async visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): Promise<void> {
    await item.component.accept(this);
  }

  async visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): Promise<void> {
    await item.config?.elementTemplate?.accept(this);
  }

  private async enqueueIfInlineVocab(
    definition: FormComponentDefinitionOutline,
    componentConfig: ComponentConfigWithInlineVocab | undefined,
    treeMode: boolean
  ): Promise<void> {
    if (!componentConfig?.inlineVocab || !componentConfig.vocabRef) {
      return;
    }

    this.pendingResolutions.push(
      this.resolveInlineVocab(definition, componentConfig, treeMode)
    );
  }

  private async resolveInlineVocab(
    definition: FormComponentDefinitionOutline,
    componentConfig: ComponentConfigWithInlineVocab,
    treeMode: boolean
  ): Promise<void> {

    try {
      const entries = await this.fetchAllEntries(this.branding, String(componentConfig.vocabRef ?? ''));
      const filteredEntries = await this.filterHistoricalEntries(entries, definition, componentConfig, treeMode);
      if (treeMode) {
        componentConfig.treeData = this.buildTreeData(filteredEntries, componentConfig);
        return;
      }
      componentConfig.options = filteredEntries.map((entry) => ({
        label: String(entry?.label ?? ''),
        value: String(entry?.value ?? ''),
        disabled: this.shouldDisableHistoricalEntry(entry, componentConfig) ? true : undefined
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
      const response = await VocabularyService.getEntries(branding, vocabRef, {
        limit,
        offset,
        includeHistoricalValues: this.includeHistoricalValues
      });
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

  private async filterHistoricalEntries(
    entries: VocabularyEntryAttributes[],
    definition: FormComponentDefinitionOutline,
    componentConfig: ComponentConfigWithInlineVocab,
    treeMode: boolean
  ): Promise<VocabularyEntryAttributes[]> {
    const selectedValues = treeMode
      ? await this.selectedTreeValuesFromModelValue(definition?.model?.config?.value)
      : await this.selectedValuesFromModelValue(definition?.model?.config?.value);

    return entries.filter((entry) => {
      if (!this.isHistorical(entry)) {
        return true;
      }
      if (!this.includeHistoricalValues) {
        return false;
      }
      if (this.shouldDisableHistoricalEntry(entry, componentConfig)) {
        return true;
      }
      return this.entryMatchesSelectedValue(entry, selectedValues, treeMode);
    });
  }

  private shouldDisableHistoricalEntry(
    entry: VocabularyEntryAttributes,
    componentConfig: ComponentConfigWithInlineVocab
  ): boolean {
    return this.includeHistoricalValues &&
      componentConfig.historicalVocabMode === 'disable' &&
      this.isHistorical(entry);
  }

  private isHistorical(entry: VocabularyEntryAttributes): boolean {
    return entry?.historical === true;
  }

  private entryMatchesSelectedValue(
    entry: VocabularyEntryAttributes,
    selectedValues: Set<string>,
    treeMode: boolean
  ): boolean {
    if (selectedValues.size === 0) {
      return false;
    }
    if (treeMode) {
      return selectedValues.has(this.entryTreeNotation(entry)) || selectedValues.has(this.entryValue(entry));
    }
    return selectedValues.has(this.entryValue(entry));
  }

  private entryValue(entry: VocabularyEntryAttributes): string {
    return String(entry?.value ?? '');
  }

  private entryTreeNotation(entry: VocabularyEntryAttributes): string {
    return String(entry?.identifier ?? '').trim() || String(entry?.value ?? '').trim();
  }

  private async selectedValuesFromModelValue(value: unknown): Promise<Set<string>> {
    const values = new Set<string>();
    if (value === null || value === undefined) {
      return values;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        await this.addSelectedValue(values, item);
      }
      return values;
    }
    await this.addSelectedValue(values, value);
    return values;
  }

  private async selectedTreeValuesFromModelValue(value: unknown): Promise<Set<string>> {
    const values = new Set<string>();
    if (value === null || value === undefined) {
      return values;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        await this.addSelectedTreeValue(values, item);
      }
      return values;
    }
    await this.addSelectedTreeValue(values, value);
    return values;
  }

  private async addSelectedValue(values: Set<string>, item: unknown): Promise<void> {
    if (item === null || item === undefined) {
      return;
    }
    values.add(String(item));
  }

  private async addSelectedTreeValue(values: Set<string>, item: unknown): Promise<void> {
    if (item === null || item === undefined) {
      return;
    }
    if (typeof item === 'object') {
      const selected = item as { notation?: unknown; value?: unknown };
      if (selected.notation !== null && selected.notation !== undefined) {
        values.add(String(selected.notation));
      }
      if (selected.value !== null && selected.value !== undefined) {
        values.add(String(selected.value));
      }
      return;
    }
    values.add(String(item));
  }

  private buildTreeData(
    entries: VocabularyEntryAttributes[],
    componentConfig: ComponentConfigWithInlineVocab
  ): CheckboxTreeNode[] {
    const nodeById = new Map<string, InlineCheckboxTreeNode>();
    const entryIds = new Set<string>();
    const rootNodes: InlineCheckboxTreeNode[] = [];

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
        hasChildren: false,
        disabled: this.shouldDisableHistoricalEntry(entry, componentConfig) ? true : undefined
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
