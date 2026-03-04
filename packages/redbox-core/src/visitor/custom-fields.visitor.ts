import type { ILogger } from '../Logger';
import {
  AccordionFieldComponentDefinitionOutline,
  AccordionFormComponentDefinitionOutline,
  AccordionPanelFieldComponentDefinitionOutline,
  AccordionPanelFormComponentDefinitionOutline,
  CheckboxInputFieldModelDefinitionOutline,
  CheckboxInputFormComponentDefinitionOutline,
  ContentFieldComponentDefinitionOutline,
  ContentFormComponentDefinitionOutline,
  DateInputFieldModelDefinitionOutline,
  DateInputFormComponentDefinitionOutline,
  DropdownInputFieldModelDefinitionOutline,
  DropdownInputFormComponentDefinitionOutline,
  FormConfigOutline,
  FormConfigVisitor,
  GroupFieldComponentDefinitionOutline,
  GroupFieldModelDefinitionOutline,
  GroupFormComponentDefinitionOutline,
  RadioInputFieldModelDefinitionOutline,
  RadioInputFormComponentDefinitionOutline,
  RepeatableFieldComponentDefinitionOutline,
  RepeatableFieldModelDefinitionOutline,
  RepeatableFormComponentDefinitionOutline,
  RichTextEditorFieldModelDefinitionOutline,
  RichTextEditorFormComponentDefinitionOutline,
  SimpleInputFieldModelDefinitionOutline,
  SimpleInputFormComponentDefinitionOutline,
  TabContentFieldComponentDefinitionOutline,
  TabContentFormComponentDefinitionOutline,
  TabFieldComponentDefinitionOutline,
  TabFormComponentDefinitionOutline,
  TextAreaFieldModelDefinitionOutline,
  TextAreaFormComponentDefinitionOutline,
  TypeaheadInputFieldModelDefinitionOutline,
  TypeaheadInputFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';

export class CustomFieldsFormConfigVisitor extends FormConfigVisitor {
  protected override logName = 'CustomFieldsFormConfigVisitor';

  private customFieldsMap: Record<string, string> = {};
  private replacementRegex: RegExp | null = null;

  constructor(logger: ILogger) {
    super(logger);
  }

  public applyCustomFields(form: FormConfigOutline, customFieldsMap?: Record<string, unknown>): void {
    const normalizedMap = this.normalizeCustomFieldsMap(customFieldsMap);
    this.customFieldsMap = normalizedMap;
    this.replacementRegex = this.buildReplacementRegex(Object.keys(normalizedMap));
    if (!this.replacementRegex) {
      return;
    }
    form.accept(this);
  }

  protected override notImplemented(): void {
    // No-op for visitor methods not required by custom field substitutions.
  }

  visitFormConfig(item: FormConfigOutline): void {
    item.componentDefinitions?.forEach(component => component.accept(this));
  }

  visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
    item.model?.accept(this);
  }

  visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
    item.model?.accept(this);
  }

  visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
    item.model?.accept(this);
  }

  visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
    item.model?.accept(this);
  }

  visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
    item.model?.accept(this);
  }

  visitTypeaheadInputFormComponentDefinition(item: TypeaheadInputFormComponentDefinitionOutline): void {
    item.model?.accept(this);
  }

  visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
    item.model?.accept(this);
  }

  visitRichTextEditorFormComponentDefinition(item: RichTextEditorFormComponentDefinitionOutline): void {
    item.model?.accept(this);
  }

  visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
    item.component?.accept(this);
  }

  visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
    item.component?.accept(this);
    item.model?.accept(this);
  }

  visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
    item.component?.accept(this);
  }

  visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
    item.component?.accept(this);
  }

  visitAccordionFormComponentDefinition(item: AccordionFormComponentDefinitionOutline): void {
    item.component?.accept(this);
  }

  visitAccordionPanelFormComponentDefinition(item: AccordionPanelFormComponentDefinitionOutline): void {
    item.component?.accept(this);
  }

  visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
    item.component?.accept(this);
    item.model?.accept(this);
  }

  visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
    this.replaceModelConfigDeepValues(item.config);
  }

  visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
    this.replaceModelConfigDeepValues(item.config);
  }

  visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
    this.replaceModelConfigStringValues(item.config);
  }

  visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
    this.replaceModelConfigStringValues(item.config);
  }

  visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void {
    this.replaceModelConfigStringValues(item.config);
  }

  visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
    this.replaceModelConfigStringValues(item.config);
  }

  visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
    this.replaceModelConfigStringValues(item.config);
  }

  visitTypeaheadInputFieldModelDefinition(item: TypeaheadInputFieldModelDefinitionOutline): void {
    this.replaceModelConfigStringValues(item.config);
  }

  visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
    this.replaceModelConfigStringValues(item.config);
  }

  visitRichTextEditorFieldModelDefinition(item: RichTextEditorFieldModelDefinitionOutline): void {
    this.replaceModelConfigStringValues(item.config);
  }

  visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
    if (!item.config) {
      return;
    }
    item.config.content = this.replaceTokens(item.config.content);
  }

  visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
    item.config?.componentDefinitions?.forEach(def => def.accept(this));
  }

  visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
    item.config?.tabs?.forEach(tab => tab.accept(this));
  }

  visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
    item.config?.componentDefinitions?.forEach(def => def.accept(this));
  }

  visitAccordionFieldComponentDefinition(item: AccordionFieldComponentDefinitionOutline): void {
    item.config?.panels?.forEach(panel => panel.accept(this));
  }

  visitAccordionPanelFieldComponentDefinition(item: AccordionPanelFieldComponentDefinitionOutline): void {
    item.config?.componentDefinitions?.forEach(def => def.accept(this));
  }

  visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
    item.config?.elementTemplate?.accept(this);
  }

  private replaceTokens(value: unknown): unknown {
    if (typeof value !== 'string' || !this.replacementRegex) {
      return value;
    }
    return value.replace(this.replacementRegex, (matched: string) => {
      return this.customFieldsMap[matched] ?? matched;
    });
  }

  private replaceModelConfigStringValues(config?: { defaultValue?: unknown; value?: unknown }): void {
    if (!config) {
      return;
    }
    config.defaultValue = this.replaceTokens(config.defaultValue);
    config.value = this.replaceTokens(config.value);
  }

  private replaceModelConfigDeepValues(config?: { defaultValue?: unknown; value?: unknown }): void {
    if (!config) {
      return;
    }
    config.defaultValue = this.replaceTokensDeep(config.defaultValue);
    config.value = this.replaceTokensDeep(config.value);
  }

  private replaceTokensDeep(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.replaceTokens(value);
    }
    if (Array.isArray(value)) {
      return value.map(item => this.replaceTokensDeep(item));
    }
    if (value && typeof value === 'object') {
      const replacedEntries = Object.entries(value).map(([key, item]) => [key, this.replaceTokensDeep(item)]);
      return Object.fromEntries(replacedEntries);
    }
    return value;
  }

  private normalizeCustomFieldsMap(customFieldsMap?: Record<string, unknown>): Record<string, string> {
    const entries = Object.entries(customFieldsMap ?? {});
    const normalized: Record<string, string> = {};
    for (const [key, value] of entries) {
      if (!key) {
        continue;
      }
      normalized[key] = String(value ?? '');
    }
    return normalized;
  }

  private buildReplacementRegex(keys: string[]): RegExp | null {
    const validKeys = keys
      .filter(key => key.length > 0)
      .sort((a, b) => b.length - a.length)
      .map(key => this.escapeRegex(key));
    if (validKeys.length === 0) {
      return null;
    }
    return new RegExp(validKeys.join('|'), 'g');
  }

  private escapeRegex(value: string): string {
    const escape = (RegExp as RegExpConstructor & { escape?: (s: string) => string }).escape;
    // Use built-in escape should be available, otherwise fall back to manual escaping.
    return typeof escape === 'function' ? escape(value) : value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
