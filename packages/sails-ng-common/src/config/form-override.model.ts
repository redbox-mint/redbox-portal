import { SimpleInputComponentName, SimpleInputFormComponentDefinitionOutline } from './component/simple-input.outline';
import {
  ContentComponentName,
  ContentFormComponentDefinitionFrame,
  ContentFormComponentDefinitionOutline,
} from './component/content.outline';
import {
  AllFormComponentDefinitionOutlines,
  AvailableFormComponentDefinitionFrames,
  ReusableFormDefinitions,
} from './dictionary.outline';
import { TextAreaComponentName, TextAreaFormComponentDefinitionOutline } from './component/text-area.outline';
import {
  CheckboxInputComponentName,
  CheckboxInputFormComponentDefinitionOutline,
} from './component/checkbox-input.outline';
import { RadioInputComponentName, RadioInputFormComponentDefinitionOutline } from './component/radio-input.outline';
import { DateInputComponentName, DateInputFormComponentDefinitionOutline } from './component/date-input.outline';
import { DefaultTransformsType, KnownTransformsType } from './form-override.outline';
import { cloneDeep as _cloneDeep, merge as _merge } from 'lodash';

import {
  DropdownInputComponentName,
  DropdownInputFormComponentDefinitionOutline,
} from './component/dropdown-input.outline';
import { TabContentComponentName } from './component/tab-content.outline';

import { ReusableComponentName, ReusableFormComponentDefinitionFrame } from './component/reusable.outline';
import { FormModesConfig } from './shared.outline';
import { isTypeFormComponentDefinitionName, isTypeReusableComponent } from './form-types.outline';
import { PropertiesHelper } from './visitor/common.model';
import { ILogger } from '../logger.interface';
import { ContentFieldComponentConfig } from './component/content.model';
import { TabFormComponentDefinitionOutline, TabComponentName } from './component/tab.outline';
import {
  AccordionComponentName,
  AccordionFormComponentDefinitionFrame,
  AccordionFormComponentDefinitionOutline,
  AccordionLayoutName,
  AccordionPanelComponentName,
  AccordionPanelFormComponentDefinitionFrame,
  AccordionPanelFormComponentDefinitionOutline,
  AccordionPanelLayoutName,
} from './component/accordion.outline';
import {
  AccordionFieldComponentConfig,
  AccordionFieldLayoutConfig,
  AccordionPanelFieldComponentConfig,
  AccordionPanelFieldLayoutConfig,
} from './component/accordion.model';
import { RepeatableComponentName, RepeatableFormComponentDefinitionOutline } from './component/repeatable.outline';
import { GroupFieldComponentName, GroupFormComponentDefinitionOutline } from './component/group.outline';
import { CheckboxTreeComponentName } from './component/checkbox-tree.outline';
import { TypeaheadInputComponentName, TypeaheadInputFormComponentDefinitionOutline } from './component/typeahead-input.outline';
import { RichTextEditorComponentName, RichTextEditorFormComponentDefinitionOutline } from './component/rich-text-editor.outline';
import { MapComponentName } from './component/map.outline';
import { FileUploadComponentName, FileUploadFormComponentDefinitionOutline } from './component/file-upload.outline';
import { TypeaheadInputModelOptionValue } from './component/typeahead-input.outline';
import { FormConstraintConfigOutline } from './form-component.outline';

export class FormOverride {
  private propertiesHelper: PropertiesHelper;
  private logger: ILogger;
  private activeReusableFormDefs: ReusableFormDefinitions;
  private readonly reusableFragmentSlotNames = new Set<string>([
    'rootExpr',
    'headersHtml',
    'cellsHtml',
    'rowsHtml',
    'itemBodyHtml',
    'labelHtml',
    'valueHtml',
    'valueExpr',
  ]);
  private readonly reusableViewTemplateKeys = {
    leafPlain: 'view-template-leaf-plain',
    leafDate: 'view-template-leaf-date',
    leafOptionEmpty: 'view-template-leaf-option-empty',
    leafOptionSingle: 'view-template-leaf-option-single',
    leafOptionMulti: 'view-template-leaf-option-multi',
    leafRichText: 'view-template-leaf-rich-text',
    leafFileUpload: 'view-template-leaf-file-upload',
    groupContainer: 'view-template-group-container',
    groupRowWithLabel: 'view-template-group-row-with-label',
    groupRowNoLabel: 'view-template-group-row-no-label',
    repeatableTable: 'view-template-repeatable-table',
    repeatableList: 'view-template-repeatable-list',
  } as const;

  constructor(logger: ILogger) {
    this.logger = logger;
    this.propertiesHelper = new PropertiesHelper();
    this.activeReusableFormDefs = {};
  }

  /**
   * Defines the known transforms between two form components.
   * @private
   */
  private knownTransforms: KnownTransformsType = {
    [SimpleInputComponentName]: {
      [ContentComponentName]: this.sourceSimpleInputComponentTargetContentComponent,
    },
    [TextAreaComponentName]: {
      [ContentComponentName]: this.sourceTextAreaComponentTargetContentComponent,
    },
    [DropdownInputComponentName]: {
      [ContentComponentName]: this.sourceDropdownInputComponentTargetContentComponent,
    },
    [CheckboxInputComponentName]: {
      [ContentComponentName]: this.sourceCheckboxInputComponentTargetContentComponent,
    },
    [RadioInputComponentName]: {
      [ContentComponentName]: this.sourceRadioInputComponentTargetContentComponent,
    },
    [DateInputComponentName]: {
      [ContentComponentName]: this.sourceDateInputComponentTargetContentComponent,
    },
    [TypeaheadInputComponentName]: {
      [ContentComponentName]: this.sourceTypeaheadInputComponentTargetContentComponent,
    },
    [RichTextEditorComponentName]: {
      [ContentComponentName]: this.sourceRichTextEditorComponentTargetContentComponent,
    },
    [FileUploadComponentName]: {
      [ContentComponentName]: this.sourceFileUploadComponentTargetContentComponent,
    },
    [RepeatableComponentName]: {
      [ContentComponentName]: this.sourceRepeatableComponentTargetContentComponent,
    },
    [GroupFieldComponentName]: {
      [ContentComponentName]: this.sourceGroupComponentTargetContentComponent,
    },
    [TabComponentName]: {
      [AccordionComponentName]: this.sourceTabComponentTargetAccordionComponent,
    },
  };

  /**
   * Specifies the 'default' transforms that will be done without needing to be specified.
   * The defaults can be overridden by specifying the transform in overrides.formModeClasses.
   * @private
   */
  private defaultTransforms: DefaultTransformsType = {
    [SimpleInputComponentName]: {
      view: {
        component: ContentComponentName,
      },
    },
    [TextAreaComponentName]: {
      view: {
        component: ContentComponentName,
      },
    },
    [DropdownInputComponentName]: {
      view: {
        component: ContentComponentName,
      },
    },
    [CheckboxInputComponentName]: {
      view: {
        component: ContentComponentName,
      },
    },
    [RadioInputComponentName]: {
      view: {
        component: ContentComponentName,
      },
    },
    [DateInputComponentName]: {
      view: {
        component: ContentComponentName,
      },
    },
    [TypeaheadInputComponentName]: {
      view: {
        component: ContentComponentName,
      },
    },
    [RichTextEditorComponentName]: {
      view: {
        component: ContentComponentName,
      },
    },
    [FileUploadComponentName]: {
      view: {
        component: ContentComponentName,
      },
    },
    [RepeatableComponentName]: {
      view: {
        component: ContentComponentName,
      },
    },
    [GroupFieldComponentName]: {
      view: {
        component: ContentComponentName,
      },
    },
    [TabComponentName]: {
      view: {
        component: AccordionComponentName,
        layout: AccordionLayoutName,
      },
    },
  };

  private readonly tableCompatibleLeafComponentNames = new Set<string>([
    SimpleInputComponentName,
    TextAreaComponentName,
    DateInputComponentName,
    DropdownInputComponentName,
    CheckboxInputComponentName,
    RadioInputComponentName,
    TypeaheadInputComponentName,
    RichTextEditorComponentName,
    MapComponentName,
    ContentComponentName,
    CheckboxTreeComponentName,
  ]);

  /**
   * Apply any reusable form configs in the form component definitions.
   * @param items The form component definitions.
   * @param reusableFormDefs
   * @protected
   */
  public applyOverridesReusable(
    items: AvailableFormComponentDefinitionFrames[],
    reusableFormDefs: ReusableFormDefinitions,
    visitedReusableFormNames: Set<string> = new Set<string>()
  ): AvailableFormComponentDefinitionFrames[] {
    const reusableFormDefNames = Object.keys(reusableFormDefs ?? {}).sort();
    // Expanding the reusable form name to the associated form config requires replacing the item in the array.
    // Changing the array that's currently being iterated can result in unstable or undefined behaviour.
    // Instead, find the index of the first item that is a reusable component.
    const index = items.findIndex(item => isTypeReusableComponent(item, reusableFormDefNames));

    // When there are no more items to expand, return the updated items array.
    if (index === -1) {
      return items;
    }

    // Update the items array to remove the reusable component and replace it with the form config it represents.
    const item = items[index];
    if (isTypeReusableComponent(item, reusableFormDefNames)) {
      const expandedItems = this.applyOverrideReusableExpand(item, reusableFormDefs, visitedReusableFormNames);
      const newItems = [...items];
      newItems.splice(index, 1, ...expandedItems);
      items = newItems;
    } else {
      throw new Error(
        `Somehow the isReusableComponent was true earlier, but is now false, for the same item. Logic error?`
      );
    }

    // Continue until there are no more reusable components to expand.
    return this.applyOverridesReusable(items, reusableFormDefs, visitedReusableFormNames);
  }

  /**
   * Expand a reusable form config definition to the actual form component definition(s).
   * @param item The reusable form component definition.
   * @param reusableFormDefs
   * @protected
   */
  protected applyOverrideReusableExpand(
    item: ReusableFormComponentDefinitionFrame,
    reusableFormDefs: ReusableFormDefinitions,
    visitedReusableFormNames: Set<string> = new Set<string>()
  ): AvailableFormComponentDefinitionFrames[] {
    const reusableFormName = item?.overrides?.reusableFormName ?? '';

    if (visitedReusableFormNames.has(reusableFormName)) {
      const visitedPath = [...visitedReusableFormNames, reusableFormName].join(' -> ');
      throw new Error(
        `Circular reusable form reference detected for '${reusableFormName}'. Expansion path: ${visitedPath}.`
      );
    }

    visitedReusableFormNames.add(reusableFormName);

    const expandedItemsRaw = Object.keys(reusableFormDefs).includes(reusableFormName)
      ? reusableFormDefs[reusableFormName]
      : [];
    try {
      const expandedItems = this.applyOverridesReusable(expandedItemsRaw, reusableFormDefs, visitedReusableFormNames);
      const additionalItemsRaw = item.component.config?.componentDefinitions ?? [];
      const additionalItems = this.applyOverridesReusable(additionalItemsRaw, reusableFormDefs, visitedReusableFormNames);

      const expandedItemNames = expandedItems.map(i => i.name);
      const extraAdditionalItems = additionalItems.filter(i => !expandedItemNames.includes(i.name));
      if (extraAdditionalItems.length > 0) {
        throw new Error(
          'Invalid usage of reusable form config. ' +
          `Each item in the ${ReusableComponentName} componentDefinitions must have a name that matches an item in the reusable form config '${reusableFormName}'. ` +
          `Names '${extraAdditionalItems.map(i => i.name)}' did not match any reusable form config items. ` +
          `Available names are '${expandedItems
            .map(i => i.name)
            .sort()
            .join(', ')}'.`
        );
      }

      const result = [];
      for (const expandedItem of expandedItems) {
        const additionalItemsMatched = additionalItems.filter(
          additionalItem => expandedItem.name === additionalItem.name
        );
        if (additionalItemsMatched.length > 1) {
          throw new Error(
            'Invalid usage of reusable form config. ' +
            `Each item in the ${ReusableComponentName} componentDefinitions must have a unique name. ` +
            `These names were not unique '${Array.from(new Set(additionalItemsMatched.map(i => i.name)))
              .sort()
              .join(', ')}'.`
          );
        }

        if (additionalItemsMatched.length === 1) {
          const additionalItem = additionalItemsMatched[0];
          const known = {
            component: { reusable: expandedItem.component.class, additional: additionalItem.component.class },
            model: { reusable: expandedItem.model?.class, additional: additionalItem.model?.class },
            layout: { reusable: expandedItem.layout?.class, additional: additionalItem.layout?.class },
          };
          for (const [key, values] of Object.entries(known)) {
            const reusableValue = values.reusable;
            const additionalValue = values.additional;
            if (reusableValue && additionalValue && reusableValue !== additionalValue) {
              throw new Error(
                'Invalid usage of reusable form config. The class must match the reusable form config. ' +
                "To change the class, use 'formModeClasses'. " +
                `The ${key} class in reusable form config '${reusableFormName}' item '${expandedItem.name}' ` +
                `is '${reusableValue}' given class was '${additionalValue}'.`
              );
            }
          }
        }

        const newItem = _merge({}, expandedItem, additionalItemsMatched.length === 1 ? additionalItemsMatched[0] : {});
        // Apply replaceName during reusable expansion so downstream data-model path binding
        // uses the final component name rather than the reusable template name.
        if (additionalItemsMatched.length === 1 && additionalItemsMatched[0].overrides?.replaceName !== undefined) {
          newItem.name = additionalItemsMatched[0].overrides?.replaceName;
        }
        result.push(newItem);
      }

      return result;
    } finally {
      visitedReusableFormNames.delete(reusableFormName);
    }
  }

  /**
   * Apply any overrides that transform a component into another component.
   * @param source The original component.
   * @param formMode The current form mode.
   * @returns The transformed form component.
   */
  public applyOverrideTransform(
    source: AllFormComponentDefinitionOutlines,
    formMode: FormModesConfig,
    options?: { phase?: 'construct' | 'client'; reusableFormDefs?: ReusableFormDefinitions }
  ): AllFormComponentDefinitionOutlines {
    const original: AllFormComponentDefinitionOutlines = _cloneDeep(source);
    const phase = options?.phase ?? 'construct';
    this.activeReusableFormDefs = options?.reusableFormDefs ?? {};

    // Get the component class name, this is also used as the form component identifier.
    const originalComponentClassName = original.component.class;

    // Get the provided transforms for the provided form mode.
    let transforms = original?.overrides?.formModeClasses?.[formMode] ?? {};

    // Apply any default transform for the provided form mode.
    const deferViewModeContentFlatteningAtConstruct =
      phase === 'construct' &&
      formMode === 'view' &&
      new Set<string>([RepeatableComponentName, GroupFieldComponentName]).has(originalComponentClassName);
    const skipAutomaticViewTransform =
      formMode === 'view' && this.hasExplicitAllowedMode(original?.constraints, 'view');

    if (
      originalComponentClassName in this.defaultTransforms &&
      !deferViewModeContentFlatteningAtConstruct &&
      !skipAutomaticViewTransform
    ) {
      const defaultTransform = this.defaultTransforms[originalComponentClassName] ?? {};
      if (formMode in defaultTransform) {
        const defaultTransformClasses = defaultTransform[formMode] ?? {};
        transforms = _merge({}, defaultTransformClasses, transforms);
      }
    }
    const transformComponentClassName = transforms?.component;

    // Check that the transform is valid.
    if (!transformComponentClassName && (transforms.model || transforms.layout)) {
      throw new Error(
        'A transform must specify the component class when specifying other classes.' +
        `Form component name '${source.name}' model class '${transforms.model}' layout class '${transforms.layout}'.`
      );
    }

    // Get the known transformations for the source form component definition.
    const sourceKnownTransforms = this.knownTransforms[originalComponentClassName] ?? {};

    // Return the source unmodified if there are no transforms specified.
    // Return the source unmodified if the transformation is to the same component
    const isTransformExpected =
      transformComponentClassName &&
      transformComponentClassName !== originalComponentClassName &&
      Object.keys(transforms).length > 0;

    // If a transform was provided, check that it is a known transform.
    if (isTransformExpected && !(transformComponentClassName in sourceKnownTransforms)) {
      throw new Error(
        `Invalid form config override config. ` +
        `The source component class '${originalComponentClassName}' does ` +
        `not define a transform to target component class '${transformComponentClassName}'.`
      );
    }

    // Check the transform function specified.
    const transformFunc = isTransformExpected ? sourceKnownTransforms[transformComponentClassName] : null;
    if (isTransformExpected && !transformFunc) {
      throw new Error(
        'The known form mode override component class transforms are invalid. ' +
        `The function to execute must be provided for source component class '${originalComponentClassName}' ` +
        `and target component class '${transformComponentClassName}'.`
      );
    }

    // Apply the transform.
    const hasTransform = !!transformComponentClassName && !!transformFunc;
    const result = hasTransform ? transformFunc.call(this, original, formMode) : original;

    // Use 'replaceName' to update the form component name.
    if (original.overrides?.replaceName !== undefined) {
      result.name = original.overrides?.replaceName;
    }

    // Remove the 'overrides' property, as it has been applied and so should not be present in the form config.
    if ('overrides' in result) {
      delete result['overrides'];
    }

    if (isTransformExpected) {
      this.logger.info(
        `Component '${source?.name}' ${hasTransform ? 'transformed' : 'unmodified'} ` +
        `from '${originalComponentClassName}' to '${transformComponentClassName}'.`
      );
    }

    return result;
  }

  private resolveReusableViewTemplate(templateKey: string, fallbackTemplate: string): string {
    const reusableDefs = this.activeReusableFormDefs ?? {};
    const reusableEntry = reusableDefs[templateKey];
    if (!Array.isArray(reusableEntry)) {
      this.logger.debug(`Reusable view template key '${templateKey}' missing, using fallback template.`);
      return fallbackTemplate;
    }
    if (reusableEntry.length !== 1) {
      this.logger.debug(
        `Reusable view template key '${templateKey}' must contain exactly one component definition, found ${reusableEntry.length}. Using fallback template.`
      );
      return fallbackTemplate;
    }

    const reusableDef = reusableEntry[0];
    const reusableClassName = reusableDef?.component?.class;
    if (reusableClassName !== ContentComponentName) {
      this.logger.debug(
        `Reusable view template key '${templateKey}' expected class '${ContentComponentName}', got '${reusableClassName ?? ''}'. Using fallback template.`
      );
      return fallbackTemplate;
    }

    const template = (reusableDef.component.config as { template?: string } | undefined)?.template?.trim?.() ?? '';
    if (template.length === 0) {
      this.logger.debug(
        `Reusable view template key '${templateKey}' has empty ContentComponent template, using fallback template.`
      );
      return fallbackTemplate;
    }

    return template;
  }

  private substituteReusableTemplateSlots(template: string, slots: Record<string, string>): string {
    let resolved = template;
    for (const [slot, value] of Object.entries(slots)) {
      if (!this.reusableFragmentSlotNames.has(slot)) {
        continue;
      }
      resolved = resolved.split(`[[${slot}]]`).join(value);
      resolved = resolved.split(`{{${slot}}}`).join(value);
      resolved = resolved.split(`{{{${slot}}}}`).join(value);
    }
    return resolved;
  }

  private sourceSimpleInputComponentTargetContentComponent(
    source: SimpleInputFormComponentDefinitionOutline,
    formMode: FormModesConfig
  ): ContentFormComponentDefinitionOutline {
    const target = this.commonContentComponent(source, formMode);
    this.commonContentPlain(source, target);
    return target;
  }

  private sourceTextAreaComponentTargetContentComponent(
    source: TextAreaFormComponentDefinitionOutline,
    formMode: FormModesConfig
  ): ContentFormComponentDefinitionOutline {
    const target = this.commonContentComponent(source, formMode);
    this.commonContentPlain(source, target);
    return target;
  }

  private sourceDropdownInputComponentTargetContentComponent(
    source: DropdownInputFormComponentDefinitionOutline,
    formMode: FormModesConfig
  ): ContentFormComponentDefinitionOutline {
    const target = this.commonContentComponent(source, formMode);
    if (target.component.config !== undefined && source.model?.config?.value !== undefined) {
      const value = source.model.config.value;
      const options = source.component.config?.options ?? [];
      const option = options.find(item => item.value === value);
      target.component.config.content = option?.label ?? value;
      target.component.config.template = this.resolveReusableViewTemplate(
        this.reusableViewTemplateKeys.leafPlain,
        `<span>{{content}}</span>`
      );
    }
    return target;
  }

  private sourceCheckboxInputComponentTargetContentComponent(
    source: CheckboxInputFormComponentDefinitionOutline,
    formMode: FormModesConfig
  ): ContentFormComponentDefinitionOutline {
    const target = this.commonContentComponent(source, formMode);

    if (target.component.config !== undefined && source.model?.config?.value !== undefined) {
      // Checkbox value can be string, null, array. If string or array, get the labels.
      // Can have 0, 1, or more values.
      const values =
        source.model.config.value === null
          ? []
          : Array.isArray(source.model.config.value)
            ? source.model.config.value
            : [source.model.config.value];
      const options = source.component.config?.options ?? [];

      this.commonContentOptionList(target, values, options);
    }

    return target;
  }

  private sourceRadioInputComponentTargetContentComponent(
    source: RadioInputFormComponentDefinitionOutline,
    formMode: FormModesConfig
  ): ContentFormComponentDefinitionOutline {
    const target = this.commonContentComponent(source, formMode);

    if (target.component.config !== undefined && source.model?.config?.value !== undefined) {
      // Radio value can be string, null, array. If string or array, get the labels.
      // Can have 0 or 1 values.
      const values =
        source.model.config.value === null
          ? []
          : Array.isArray(source.model.config.value)
            ? source.model.config.value
            : [source.model.config.value];
      const options = source.component.config?.options ?? [];

      this.commonContentOptionList(target, values, options);
    }

    return target;
  }

  private sourceDateInputComponentTargetContentComponent(
    source: DateInputFormComponentDefinitionOutline,
    formMode: FormModesConfig
  ): ContentFormComponentDefinitionOutline {
    const target = this.commonContentComponent(source, formMode);

    if (target.component.config !== undefined && source.model?.config?.value !== undefined) {
      target.component.config.content = source.model.config.value;
      target.component.config.template = this.resolveReusableViewTemplate(
        this.reusableViewTemplateKeys.leafDate,
        `<span data-value="{{content}}">{{formatDate content}}</span>`
      );
    }

    return target;
  }

  private sourceTypeaheadInputComponentTargetContentComponent(
    source: TypeaheadInputFormComponentDefinitionOutline,
    formMode: FormModesConfig
  ): ContentFormComponentDefinitionOutline {
    const target = this.commonContentComponent(source, formMode);
    if (!target.component.config || source.model?.config?.value === undefined) {
      return target;
    }

    const value = source.model.config.value;
    const displayValue =
      value && typeof value === 'object' && 'label' in value
        ? (value as TypeaheadInputModelOptionValue).label
        : typeof value === 'string'
          ? value
          : '';
    target.component.config.content = displayValue;
    target.component.config.template = this.resolveReusableViewTemplate(
      this.reusableViewTemplateKeys.leafPlain,
      `<span>{{content}}</span>`
    );

    return target;
  }

  private sourceRichTextEditorComponentTargetContentComponent(
    source: RichTextEditorFormComponentDefinitionOutline,
    formMode: FormModesConfig
  ): ContentFormComponentDefinitionOutline {
    const target = this.commonContentComponent(source, formMode);
    const outputFormat = (source.component?.config as { outputFormat?: 'html' | 'markdown' } | undefined)?.outputFormat ?? 'html';
    if (!target.component.config || source.model?.config?.value === undefined) {
      return target;
    }

    target.component.config.content = source.model.config.value;
    const fallbackTemplate = `{{{markdownToHtml content "${this.escapeForHandlebarsLiteral(outputFormat)}"}}}`;
    target.component.config.template = this.resolveReusableViewTemplate(
      this.reusableViewTemplateKeys.leafRichText,
      fallbackTemplate
    );
    target.component.config = {
      ...target.component.config,
      outputFormat,
    };

    return target;
  }

  private sourceFileUploadComponentTargetContentComponent(
    source: FileUploadFormComponentDefinitionOutline,
    formMode: FormModesConfig
  ): ContentFormComponentDefinitionOutline {
    const target = this.commonContentComponent(source, formMode);
    if (!target.component.config || source.model?.config?.value === undefined) {
      return target;
    }
    target.component.config.content = source.model.config.value;
    const uploadTemplate = this.resolveReusableViewTemplate(
      this.reusableViewTemplateKeys.leafFileUpload,
      `<ul class="rb-view-file-upload">{{#each [[valueExpr]]}<li>{{default this.name this.fileId}}</li>{{/each}}</ul>`
    );
    target.component.config.template = this.substituteReusableTemplateSlots(uploadTemplate, { valueExpr: 'content' });
    return target;
  }

  private isDeepEmpty(value: any): boolean {
    if (value === null || value === undefined || value === '') {
      return true;
    }
    if (Array.isArray(value)) {
      return value.every(item => this.isDeepEmpty(item));
    }
    if (typeof value === 'object') {
      return Object.values(value).every(val => this.isDeepEmpty(val));
    }
    return false;
  }

  private sourceRepeatableComponentTargetContentComponent(
    source: RepeatableFormComponentDefinitionOutline,
    formMode: FormModesConfig
  ): ContentFormComponentDefinitionOutline {
    const target = this.commonContentComponent(source, formMode);
    if (target.component.config) {
      const rawArray = Array.isArray(source.model?.config?.value) ? source.model?.config?.value : [];
      target.component.config.content = rawArray.filter(item => !this.isDeepEmpty(item));
      target.component.config.template = this.generateTemplateForComponent(source, 'content');
    }
    return target;
  }

  private extractDescendantValues(component: AllFormComponentDefinitionOutlines): Record<string, any> {
    const values: Record<string, any> = {};
    const traverse = (comp: AllFormComponentDefinitionOutlines) => {
      if (comp.name) {
        let valueToSet: any = '';
        if (comp.model && comp.model.config) {
          const modelValue = comp.model.config.value;
          const defaultValue = comp.model.config.defaultValue;
          valueToSet = modelValue !== undefined ? modelValue : (defaultValue !== undefined ? defaultValue : '');
        }
        values[comp.name] = valueToSet;
      }
      const config = comp.component?.config as Record<string, unknown> | undefined;
      if (config) {
        if (Array.isArray(config.componentDefinitions)) {
          (config.componentDefinitions as AllFormComponentDefinitionOutlines[]).forEach(traverse);
        }
        if (Array.isArray(config.tabs)) {
          (config.tabs as AllFormComponentDefinitionOutlines[]).forEach(traverse);
        }
        if (Array.isArray(config.panels)) {
          (config.panels as AllFormComponentDefinitionOutlines[]).forEach(traverse);
        }
        // Reusable component elements within a group
        if (config.elementTemplate) {
          traverse(config.elementTemplate as AllFormComponentDefinitionOutlines);
        }
      }
    };

    // Do not capture the group's own value, just start traversing its children.
    // (If the group had a value, we wouldn't need to rebuild it from descendants).
    const rootConfig = component.component?.config as Record<string, unknown> | undefined;
    if (rootConfig) {
      if (Array.isArray(rootConfig.componentDefinitions)) {
        (rootConfig.componentDefinitions as AllFormComponentDefinitionOutlines[]).forEach(traverse);
      }
      if (Array.isArray(rootConfig.tabs)) {
        (rootConfig.tabs as AllFormComponentDefinitionOutlines[]).forEach(traverse);
      }
      if (Array.isArray(rootConfig.panels)) {
        (rootConfig.panels as AllFormComponentDefinitionOutlines[]).forEach(traverse);
      }
    }
    return values;
  }

  private sourceGroupComponentTargetContentComponent(
    source: GroupFormComponentDefinitionOutline,
    formMode: FormModesConfig
  ): ContentFormComponentDefinitionOutline {
    const target = this.commonContentComponent(source, formMode);
    if (target.component.config) {
      const contentValue = source.model?.config?.value;
      target.component.config.content =
        contentValue && typeof contentValue === 'object' && !this.isDeepEmpty(contentValue)
          ? contentValue
          : this.extractDescendantValues(source);
      target.component.config.template = this.generateTemplateForComponent(source, 'content');
    }
    return target;
  }

  private generateTemplateForComponent(component: AllFormComponentDefinitionOutlines, rootExpr: string): string {
    const className = component?.component?.class;
    if (className === RepeatableComponentName) {
      return this.generateRepeatableTemplate(component as RepeatableFormComponentDefinitionOutline, rootExpr);
    }
    if (className === GroupFieldComponentName) {
      return this.generateGroupTemplate(component as GroupFormComponentDefinitionOutline, rootExpr);
    }
    return this.renderLeafValue(component, rootExpr, []);
  }

  private generateRepeatableTemplate(component: RepeatableFormComponentDefinitionOutline, rootExpr: string): string {
    const elementTemplate = component?.component?.config?.elementTemplate;
    if (!elementTemplate) {
      return `<div class="rb-view-repeatable rb-view-repeatable-list"></div>`;
    }

    const groupChildren = this.getGroupChildren(elementTemplate);
    const tableEligible = !!groupChildren && this.isTableEligibleGroupChildren(groupChildren);
    this.logger.debug(
      `Repeatable view transform '${component.name}' using ${tableEligible ? 'table' : 'fallback'} layout.`
    );

    if (tableEligible && groupChildren) {
      return this.renderRepeatableTable(groupChildren, rootExpr);
    }
    return this.renderRepeatableFallback(elementTemplate, rootExpr);
  }

  private generateGroupTemplate(component: GroupFormComponentDefinitionOutline, rootExpr: string): string {
    const children = component?.component?.config?.componentDefinitions ?? [];
    const rows = children.map(child => this.renderLabelValueRow(child, rootExpr)).join('');
    const template = this.resolveReusableViewTemplate(
      this.reusableViewTemplateKeys.groupContainer,
      `<div class="rb-view-group">[[rowsHtml]]</div>`
    );
    return this.substituteReusableTemplateSlots(template, { rowsHtml: rows });
  }

  private renderRepeatableTable(children: AllFormComponentDefinitionOutlines[], rootExpr: string): string {
    const headers = children.map(child => `<th>${this.resolveTranslatedLabel(child)}</th>`).join('');
    const cells = children.map(child => `<td>${this.renderLeafValue(child, 'this', [child.name])}</td>`).join('');
    const template = this.resolveReusableViewTemplate(
      this.reusableViewTemplateKeys.repeatableTable,
      `{{#if [[rootExpr]]}}<div class="rb-view-repeatable rb-view-repeatable-table-wrapper"><table class="table table-striped table-sm rb-view-repeatable-table"><thead><tr>[[headersHtml]]</tr></thead><tbody>{{#each [[rootExpr]]}}<tr>[[cellsHtml]]</tr>{{/each}}</tbody></table></div>{{/if}}`
    );
    return this.substituteReusableTemplateSlots(template, { rootExpr, headersHtml: headers, cellsHtml: cells });
  }

  private renderRepeatableFallback(elementTemplate: AllFormComponentDefinitionOutlines, rootExpr: string): string {
    const itemBody = this.renderComponentBody(elementTemplate, 'this');
    const elementClassName = elementTemplate?.component?.class ?? '';
    const itemClass =
      elementClassName === GroupFieldComponentName || elementClassName === RepeatableComponentName
        ? 'rb-view-repeatable-card'
        : 'rb-view-repeatable-card rb-view-repeatable-card--leaf';
    const template = this.resolveReusableViewTemplate(
      this.reusableViewTemplateKeys.repeatableList,
      `{{#if [[rootExpr]]}}<div class="rb-view-repeatable rb-view-repeatable-list">{{#each [[rootExpr]]}}<div class="[[itemClass]]">[[itemBodyHtml]]</div>{{/each}}</div>{{/if}}`
    );
    return this.substituteReusableTemplateSlots(template, { rootExpr, itemBodyHtml: itemBody, itemClass });
  }

  private renderComponentBody(component: AllFormComponentDefinitionOutlines, rootExpr: string): string {
    const className = component?.component?.class;
    if (className === GroupFieldComponentName) {
      const children = this.getGroupChildren(component) ?? [];
      return children.map(child => this.renderLabelValueRow(child, rootExpr)).join('');
    }
    if (className === RepeatableComponentName) {
      const nestedRoot = this.buildNestedExpression(rootExpr, component?.name);
      return this.generateRepeatableTemplate(component as RepeatableFormComponentDefinitionOutline, nestedRoot);
    }
    return this.renderLeafValue(component, rootExpr, component?.name ? [component.name] : []);
  }

  private renderLabelValueRow(component: AllFormComponentDefinitionOutlines, rootExpr: string): string {
    const label = this.resolveTranslatedLabel(component);
    const valueExpr = this.renderComponentBody(component, rootExpr);
    if (label.trim().length === 0) {
      const template = this.resolveReusableViewTemplate(
        this.reusableViewTemplateKeys.groupRowNoLabel,
        `<div class="rb-view-row"><div class="rb-view-value">[[valueHtml]]</div></div>`
      );
      return this.substituteReusableTemplateSlots(template, { valueHtml: valueExpr });
    }
    const template = this.resolveReusableViewTemplate(
      this.reusableViewTemplateKeys.groupRowWithLabel,
      `<div class="rb-view-row"><div class="rb-view-label">[[labelHtml]]</div><div class="rb-view-value">[[valueHtml]]</div></div>`
    );
    return this.substituteReusableTemplateSlots(template, { labelHtml: label, valueHtml: valueExpr });
  }

  private renderLeafValue(
    component: AllFormComponentDefinitionOutlines,
    rootExpr: string,
    pathParts: string[]
  ): string {
    const className = component?.component?.class ?? '';
    const expression = this.safeValueExpression(rootExpr, pathParts);

    if (className === FileUploadComponentName) {
      const fileTemplate = this.resolveReusableViewTemplate(
        this.reusableViewTemplateKeys.leafFileUpload,
        `<ul class="rb-view-file-upload">{{#each [[valueExpr]]}<li>{{default this.name this.fileId}}</li>{{/each}}</ul>`
      );
      return this.substituteReusableTemplateSlots(fileTemplate, { valueExpr: expression });
    }
    if (className === ContentComponentName) {
      const template =
        component?.component?.config && 'template' in component.component.config
          ? (component.component.config as { template?: string }).template
          : undefined;
      const trimmedTemplate = (template ?? '').trim();
      if (
        trimmedTemplate === '{{content}}' ||
        trimmedTemplate === '{{{content}}}' ||
        trimmedTemplate === '<span>{{content}}</span>'
      ) {
        return `{{default ${expression} ""}}`;
      }
      return `{{default ${expression} ""}}`;
    }
    if (className === CheckboxTreeComponentName) {
      return `{{join ${expression} ", "}}`;
    }
    return `{{default ${expression} ""}}`;
  }

  private getGroupChildren(component: AllFormComponentDefinitionOutlines): AllFormComponentDefinitionOutlines[] | null {
    if (component?.component?.class !== GroupFieldComponentName) {
      return null;
    }
    const componentDefinitions =
      component?.component?.config && 'componentDefinitions' in component.component.config
        ? (component.component.config as { componentDefinitions?: AllFormComponentDefinitionOutlines[] })
          .componentDefinitions
        : [];
    return componentDefinitions ?? [];
  }

  private isTableEligibleGroupChildren(children: AllFormComponentDefinitionOutlines[]): boolean {
    const names = new Set<string>();
    for (const child of children) {
      const childName = child?.name?.trim?.() ?? '';
      if (childName.length === 0 || names.has(childName)) {
        this.logger.debug(
          `Repeatable view transform table eligibility failed due to duplicate/empty child name '${child?.name ?? ''}'.`
        );
        return false;
      }
      names.add(childName);

      const className = child?.component?.class ?? '';
      if (!this.tableCompatibleLeafComponentNames.has(className) || className === FileUploadComponentName) {
        this.logger.debug(`Repeatable view transform table eligibility failed for class '${className}'.`);
        return false;
      }
    }
    return children.length > 0;
  }

  private resolveTranslatedLabel(component: AllFormComponentDefinitionOutlines): string {
    const layoutConfig = component?.layout?.config as { label?: string } | undefined;
    const componentConfig = component?.component?.config as { label?: string } | undefined;
    const rawLabel = componentConfig?.label ?? layoutConfig?.label;
    const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';
    if (label.length > 0) {
      return `{{t "${this.escapeForHandlebarsLiteral(label)}"}}`;
    }
    const name = typeof component?.name === 'string' ? component.name.trim() : '';
    return this.escapeForHandlebarsLiteral(name);
  }

  private safeValueExpression(rootExpr: string, pathParts: string[]): string {
    const cleanedParts = (pathParts ?? []).filter(part => typeof part === 'string' && part.trim().length > 0);
    if (cleanedParts.length === 0) {
      return rootExpr;
    }
    return `(get ${rootExpr} "${this.escapeForHandlebarsLiteral(cleanedParts.join('.'))}" "")`;
  }

  private buildNestedExpression(rootExpr: string, part?: string): string {
    if (!part || part.trim().length === 0) {
      return rootExpr;
    }
    return `(get ${rootExpr} "${this.escapeForHandlebarsLiteral(part)}" "")`;
  }

  private escapeForHandlebarsLiteral(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private sourceTabComponentTargetAccordionComponent(
    source: TabFormComponentDefinitionOutline,
    formMode: FormModesConfig
  ): AccordionFormComponentDefinitionOutline {
    const frame: AccordionFormComponentDefinitionFrame = {
      name: source.name,
      component: {
        class: AccordionComponentName,
        config: {
          panels: [],
          startingOpenMode: 'all-open',
        },
      },
      layout: {
        class: AccordionLayoutName,
        config: {},
      },
      module: source.module,
      expressions: source.expressions,
      constraints: source.constraints,
      overrides: source.overrides,
    };

    const target = this.propertiesHelper.sharedConstructFormComponent(frame);
    if (!isTypeFormComponentDefinitionName<AccordionFormComponentDefinitionOutline>(target, AccordionComponentName)) {
      throw new Error(
        `Could not create class for form component class name '${AccordionComponentName}': ${JSON.stringify(target)}.`
      );
    }

    target.component.config = new AccordionFieldComponentConfig();
    if (!target.layout) {
      throw new Error(`Could not create layout class for '${AccordionComponentName}'.`);
    }
    target.layout.config = target.layout.config ?? new AccordionFieldLayoutConfig();

    this.propertiesHelper.sharedPopulateFieldComponentConfig(target.component.config, source.component?.config);
    this.propertiesHelper.sharedPopulateFieldLayoutConfig(target.layout.config, source.layout?.config);
    target.component.config.startingOpenMode = 'all-open';
    target.component.config.panels = [];

    const tabs = source.component?.config?.tabs ?? [];
    tabs.forEach((tab, index) => {
      if (!isTypeFormComponentDefinitionName(tab, TabContentComponentName)) {
        this.logger.warn(
          `Tab to accordion transform skipped invalid tab at index ${index} for component '${source.name}'.`
        );
        return;
      }
      if (!this.isModeAllowed(tab.constraints, formMode)) {
        return;
      }

      const buttonLabelCandidate = tab.layout?.config?.buttonLabel;
      const tabNameCandidate = tab.name;
      const buttonLabel =
        typeof buttonLabelCandidate === 'string' && buttonLabelCandidate.trim().length > 0
          ? buttonLabelCandidate
          : typeof tabNameCandidate === 'string' && tabNameCandidate.trim().length > 0
            ? tabNameCandidate
            : `${index}`;
      const panelFrame: AccordionPanelFormComponentDefinitionFrame = {
        name: tab.name ?? `panel-${index}`,
        constraints: tab.constraints,
        component: {
          class: AccordionPanelComponentName,
          config: {
            componentDefinitions: (tab.component?.config?.componentDefinitions ?? []).map(compDef => {
              this.forceAllowModeForTransformedTree(compDef as any, formMode);
              return compDef;
            }),
          },
        },
        layout: {
          class: AccordionPanelLayoutName,
          config: {
            buttonLabel,
          },
        },
      };

      const panel = this.propertiesHelper.sharedConstructFormComponent(panelFrame);
      if (
        !isTypeFormComponentDefinitionName<AccordionPanelFormComponentDefinitionOutline>(
          panel,
          AccordionPanelComponentName
        )
      ) {
        this.logger.warn(`Tab to accordion transform skipped panel at index ${index} for component '${source.name}'.`);
        return;
      }

      panel.component.config = panel.component.config ?? new AccordionPanelFieldComponentConfig();
      if (!panel.layout) {
        throw new Error(`Could not create layout class for '${AccordionPanelComponentName}'.`);
      }
      panel.layout.config = panel.layout.config ?? new AccordionPanelFieldLayoutConfig();

      this.propertiesHelper.sharedPopulateFieldComponentConfig(panel.component.config, panelFrame.component.config);
      // sharedPopulateFieldComponentConfig only maps common fields, so preserve panel children explicitly.
      panel.component.config.componentDefinitions = (panelFrame.component.config?.componentDefinitions ??
        []) as typeof panel.component.config.componentDefinitions;
      this.propertiesHelper.sharedPopulateFieldLayoutConfig(panel.layout.config, panelFrame.layout?.config);
      this.propertiesHelper.setPropOverride('buttonLabel', panel.layout.config, panelFrame.layout?.config);

      target.component.config?.panels.push(panel);
    });

    return target;
  }

  private isModeAllowed(constraints: FormConstraintConfigOutline | undefined, formMode: FormModesConfig): boolean {
    const allowModes = constraints?.allowModes;
    if (!Array.isArray(allowModes) || allowModes.length === 0) {
      return true;
    }
    return allowModes.includes(formMode);
  }

  private hasExplicitAllowedMode(
    constraints: FormConstraintConfigOutline | undefined,
    mode: FormModesConfig
  ): boolean {
    const allowModes = constraints?.allowModes;
    return Array.isArray(allowModes) && allowModes.includes(mode);
  }

  private forceAllowModeForTransformedTree(componentDefinition: any, formMode: FormModesConfig): void {
    if (!componentDefinition || typeof componentDefinition !== 'object') {
      return;
    }

    const constraints = componentDefinition.constraints ?? { authorization: { allowRoles: [] }, allowModes: [] };
    constraints.allowModes = Array.isArray(constraints.allowModes) ? constraints.allowModes : [];
    if (!constraints.allowModes.includes(formMode)) {
      constraints.allowModes.push(formMode);
    }
    componentDefinition.constraints = constraints;

    const nested = componentDefinition?.component?.config;
    if (!nested || typeof nested !== 'object') {
      return;
    }

    (nested.componentDefinitions ?? []).forEach((child: any) => this.forceAllowModeForTransformedTree(child, formMode));
    (nested.tabs ?? []).forEach((child: any) => this.forceAllowModeForTransformedTree(child, formMode));
    (nested.panels ?? []).forEach((child: any) => this.forceAllowModeForTransformedTree(child, formMode));
    if (nested.elementTemplate) {
      this.forceAllowModeForTransformedTree(nested.elementTemplate, formMode);
    }
  }

  private commonContentComponent(
    source: AllFormComponentDefinitionOutlines,
    formMode: FormModesConfig
  ): ContentFormComponentDefinitionOutline {
    const frame: ContentFormComponentDefinitionFrame = {
      name: source.name,
      component: {
        class: 'ContentComponent',
        config: {},
      },
      module: source.module,
      expressions: source.expressions,
      constraints: source.constraints,
      overrides: source.overrides,
    };
    // Set the optional properties only if the source has them.
    if (source.layout) {
      frame.layout = source.layout;
    }

    const target = this.propertiesHelper.sharedConstructFormComponent(frame);
    if (!isTypeFormComponentDefinitionName<ContentFormComponentDefinitionOutline>(target, ContentComponentName)) {
      throw new Error(
        `Could not create class for form component class name 'ContentComponent': ${JSON.stringify(target)}.`
      );
    }

    target.component.config = new ContentFieldComponentConfig();

    // TODO: does it make sense to copy all shared properties? The css classes might need to be different?
    this.propertiesHelper.sharedPopulateFieldComponentConfig(target.component.config, source.component.config);
    if (target.layout) {
      target.layout.config = target.layout.config ?? {};
      this.propertiesHelper.sharedPopulateFieldLayoutConfig(target.layout.config, source.layout?.config);
    }

    return target;
  }

  private commonContentOptionList(
    target: ContentFormComponentDefinitionOutline,
    values: string[],
    options?: { label: string; value: string }[]
  ): void {
    if (!target.component.config) {
      return;
    }
    const targetCompConf = target.component.config;

    if (values.length === 0) {
      // Empty
      targetCompConf.content = undefined;
      targetCompConf.template = this.resolveReusableViewTemplate(this.reusableViewTemplateKeys.leafOptionEmpty, `<span></span>`);
    } else if (values.length === 1) {
      // One value
      const value = values[0];
      const label = options?.find(option => option.value === value)?.label ?? value;
      targetCompConf.content = { value, label };
      targetCompConf.template = this.resolveReusableViewTemplate(
        this.reusableViewTemplateKeys.leafOptionSingle,
        `<span data-value="{{content.value}}">{{content.label}}</span>`
      );
    } else {
      // More than one value
      targetCompConf.content = values.map(
        value =>
          options?.find(option => option.value === value) ?? {
            label: value,
            value: value,
          }
      );
      targetCompConf.template = this.resolveReusableViewTemplate(
        this.reusableViewTemplateKeys.leafOptionMulti,
        `<ul>{{#each content}}<li data-value="{{this.value}}">{{this.label}}</li>{{/each}}</ul>`
      );
    }
  }

  private commonContentPlain(
    source: AllFormComponentDefinitionOutlines,
    target: ContentFormComponentDefinitionOutline
  ): void {
    if (target.component.config !== undefined && source.model?.config?.value !== undefined) {
      target.component.config.content = source.model.config.value;
      target.component.config.template = this.resolveReusableViewTemplate(
        this.reusableViewTemplateKeys.leafPlain,
        `<span>{{content}}</span>`
      );
    }
  }
}
