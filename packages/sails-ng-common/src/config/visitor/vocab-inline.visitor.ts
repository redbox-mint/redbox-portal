import { ILogger } from '../../logger.interface';
import { FormConfigOutline } from '../form-config.outline';
import { FormComponentDefinitionOutline } from '../form-component.outline';
import { DropdownInputComponentName, DropdownOption } from '../component/dropdown-input.outline';
import { RadioInputComponentName, RadioOption } from '../component/radio-input.outline';
import { CheckboxInputComponentName, CheckboxOption } from '../component/checkbox-input.outline';
import { GroupFieldComponentName, GroupFormComponentDefinitionOutline } from '../component/group.outline';
import { TabComponentName, TabFormComponentDefinitionOutline } from '../component/tab.outline';
import { TabContentComponentName, TabContentFormComponentDefinitionOutline } from '../component/tab-content.outline';
import { RepeatableComponentName, RepeatableFormComponentDefinitionOutline } from '../component/repeatable.outline';

type ComponentConfigWithInlineVocab = {
  options?: DropdownOption[] | RadioOption[] | CheckboxOption[];
  vocabRef?: string;
  inlineVocab?: boolean;
};

type VocabularyEntryLike = {
  label?: unknown;
  value?: unknown;
};

type VocabularyServiceLike = {
  getEntries?: (
    branding: string,
    vocabIdOrSlug: string,
    options?: { limit?: number; offset?: number }
  ) => Promise<{ entries?: VocabularyEntryLike[] } | null>;
};

/**
 * Resolve vocab-backed options into form component configs at build time.
 */
export class VocabInlineFormConfigVisitor {
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  public async resolveVocabs(form: FormConfigOutline): Promise<void> {
    const globals = globalThis as { sails?: { config?: { auth?: { defaultBrand?: string } } } };
    const branding = String(globals?.sails?.config?.auth?.defaultBrand ?? '').trim();
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

    const globals = globalThis as { VocabularyService?: VocabularyServiceLike };
    const vocabService = globals.VocabularyService;
    if (!vocabService?.getEntries) {
      this.logger.warn('VocabularyService.getEntries is not available, skipping inline vocab resolution');
      return;
    }

    try {
      const response = await vocabService.getEntries(branding, config.vocabRef, { limit: 1000, offset: 0 });
      const entries = response?.entries ?? [];
      config.options = entries.map((entry) => ({
        label: String(entry?.label ?? ''),
        value: String(entry?.value ?? '')
      }));
    } catch (error) {
      this.logger.warn(`Failed to resolve inline vocab '${config.vocabRef}' for component '${definition?.name ?? ''}'`);
      this.logger.debug(error);
    }
  }
}
