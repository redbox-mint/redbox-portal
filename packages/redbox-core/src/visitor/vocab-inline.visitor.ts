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

type HistoricalVocabMode = 'hide' | 'disable';
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
    this.enqueueIfInlineVocab(item, item.component?.config, false);
  }

  visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
    this.enqueueIfInlineVocab(item, item.component?.config, false);
  }

  visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
    this.enqueueIfInlineVocab(item, item.component?.config, false);
  }

  visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): void {
    this.enqueueIfInlineVocab(item, item.component?.config, true);
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
    definition: FormComponentDefinitionOutline,
    componentConfig: ComponentConfigWithInlineVocab | undefined,
    treeMode: boolean
  ): void {
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
      const filteredEntries = this.filterHistoricalEntries(entries, definition, componentConfig, treeMode);
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

  private filterHistoricalEntries(
    entries: VocabularyEntryAttributes[],
    definition: FormComponentDefinitionOutline,
    componentConfig: ComponentConfigWithInlineVocab,
    treeMode: boolean
  ): VocabularyEntryAttributes[] {
    return entries.filter((entry) => {
      if (!this.isHistorical(entry)) {
        return true;
      }
      if (!this.shouldDisableHistoricalEntry(entry, componentConfig)) {
        return false;
      }

      const selectedValues = treeMode
        ? this.selectedTreeValuesFromModelValue(definition?.model?.config?.value)
        : this.selectedValuesFromModelValue(definition?.model?.config?.value);
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

  private selectedValuesFromModelValue(value: unknown): Set<string> {
    const values = new Set<string>();
    if (value === null || value === undefined) {
      return values;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => this.addSelectedValue(values, item));
      return values;
    }
    this.addSelectedValue(values, value);
    return values;
  }

  private selectedTreeValuesFromModelValue(value: unknown): Set<string> {
    const values = new Set<string>();
    if (value === null || value === undefined) {
      return values;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => this.addSelectedTreeValue(values, item));
      return values;
    }
    this.addSelectedTreeValue(values, value);
    return values;
  }

  private addSelectedValue(values: Set<string>, item: unknown): void {
    if (item === null || item === undefined) {
      return;
    }
    values.add(String(item));
  }

  private addSelectedTreeValue(values: Set<string>, item: unknown): void {
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
