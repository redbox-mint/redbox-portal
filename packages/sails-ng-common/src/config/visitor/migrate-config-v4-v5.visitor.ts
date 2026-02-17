import { cloneDeep as _cloneDeep, get as _get } from 'lodash';
import { FormConfig } from '../form-config.model';
import { FormConfigOutline } from '../form-config.outline';
import {
  GroupFieldComponentDefinitionOutline,
  GroupFieldComponentName,
  GroupFieldModelDefinitionOutline,
  GroupFieldModelName,
  GroupFormComponentDefinitionOutline,
} from '../component/group.outline';
import {
  RepeatableComponentName,
  RepeatableElementFieldLayoutDefinitionOutline,
  RepeatableFieldComponentDefinitionOutline,
  RepeatableFieldModelDefinitionOutline,
  RepeatableFormComponentDefinitionOutline,
  RepeatableModelName,
} from '../component/repeatable.outline';
import {
  RepeatableElementFieldLayoutConfig,
  RepeatableFieldComponentConfig,
  RepeatableFieldModelConfig,
} from '../component/repeatable.model';
import { GroupFieldComponentConfig, GroupFieldModelConfig } from '../component/group.model';
import {
  SimpleInputComponentName,
  SimpleInputFieldComponentDefinitionOutline,
  SimpleInputFieldModelDefinitionOutline,
  SimpleInputFormComponentDefinitionOutline,
  SimpleInputModelName,
} from '../component/simple-input.outline';
import { SimpleInputFieldComponentConfig, SimpleInputFieldModelConfig } from '../component/simple-input.model';
import { DefaultFieldLayoutDefinitionOutline, DefaultLayoutName } from '../component/default-layout.outline';
import { DefaultFieldLayoutConfig } from '../component/default-layout.model';
import { FormComponentDefinitionFrame, FormComponentDefinitionOutline } from '../form-component.outline';
import {
  ContentComponentName,
  ContentFieldComponentDefinitionOutline,
  ContentFormComponentDefinitionOutline,
} from '../component/content.outline';
import {
  TabComponentName,
  TabFieldComponentDefinitionOutline,
  TabFieldLayoutDefinitionOutline,
  TabFormComponentDefinitionOutline,
  TabLayoutName,
} from '../component/tab.outline';
import { TabFieldComponentConfig, TabFieldLayoutConfig } from '../component/tab.model';
import {
  TabContentComponentName,
  TabContentFieldComponentDefinitionOutline,
  TabContentFieldLayoutDefinitionOutline,
  TabContentFormComponentDefinitionFrame,
  TabContentFormComponentDefinitionOutline,
  TabContentLayoutName,
} from '../component/tab-content.outline';
import { TabContentFieldComponentConfig, TabContentFieldLayoutConfig } from '../component/tab-content.model';
import {
  TextAreaComponentName,
  TextAreaFieldComponentDefinitionOutline,
  TextAreaFieldModelDefinitionOutline,
  TextAreaFormComponentDefinitionOutline,
  TextAreaModelName,
} from '../component/text-area.outline';
import { TextAreaFieldComponentConfig, TextAreaFieldModelConfig } from '../component/text-area.model';
import {
  RichTextEditorComponentName,
  RichTextEditorFieldComponentDefinitionOutline,
  RichTextEditorFieldModelDefinitionOutline,
  RichTextEditorFormComponentDefinitionOutline,
  RichTextEditorModelName,
} from '../component/rich-text-editor.outline';
import {
  RichTextEditorFieldComponentConfig,
  RichTextEditorFieldModelConfig,
} from '../component/rich-text-editor.model';
import { ContentFieldComponentConfig } from '../component/content.model';
import {
  DropdownInputComponentName,
  DropdownInputFieldComponentDefinitionOutline,
  DropdownInputFieldModelDefinitionOutline,
  DropdownInputFormComponentDefinitionOutline,
  DropdownInputModelName,
} from '../component/dropdown-input.outline';
import { DropdownInputFieldComponentConfig, DropdownInputFieldModelConfig } from '../component/dropdown-input.model';
import {
  TypeaheadInputComponentName,
  TypeaheadInputFieldComponentDefinitionOutline,
  TypeaheadInputFieldModelDefinitionOutline,
  TypeaheadInputFormComponentDefinitionOutline,
  TypeaheadInputModelName,
} from '../component/typeahead-input.outline';
import { TypeaheadInputFieldComponentConfig, TypeaheadInputFieldModelConfig } from '../component/typeahead-input.model';
import {
  CheckboxInputFieldComponentDefinitionOutline,
  CheckboxInputFieldModelDefinitionOutline,
  CheckboxInputFormComponentDefinitionOutline,
} from '../component/checkbox-input.outline';
import { CheckboxInputFieldComponentConfig, CheckboxInputFieldModelConfig } from '../component/checkbox-input.model';
import {
  RadioInputFieldComponentDefinitionOutline,
  RadioInputFieldModelDefinitionOutline,
  RadioInputFormComponentDefinitionOutline,
} from '../component/radio-input.outline';
import { RadioInputFieldComponentConfig, RadioInputFieldModelConfig } from '../component/radio-input.model';
import {
  DateInputComponentName,
  DateInputFieldComponentDefinitionOutline,
  DateInputFieldModelDefinitionOutline,
  DateInputFormComponentDefinitionOutline,
  DateInputModelName,
} from '../component/date-input.outline';
import { DateInputFieldComponentConfig, DateInputFieldModelConfig } from '../component/date-input.model';
import {
  SaveButtonComponentName,
  SaveButtonFieldComponentDefinitionOutline,
  SaveButtonFormComponentDefinitionOutline,
} from '../component/save-button.outline';
import { SaveButtonFieldComponentConfig } from '../component/save-button.model';
import {
  CancelButtonComponentName,
  CancelButtonFieldComponentDefinitionOutline,
  CancelButtonFormComponentDefinitionOutline,
} from '../component/cancel-button.outline';
import { CancelButtonFieldComponentConfig } from '../component/cancel-button.model';
import {
  TabNavButtonComponentName,
  TabNavButtonFieldComponentDefinitionOutline,
  TabNavButtonFormComponentDefinitionOutline,
} from '../component/tab-nav-button.outline';
import { TabNavButtonFieldComponentConfig } from '../component/tab-nav-button.model';
import {
  ValidationSummaryFieldComponentDefinitionOutline,
  ValidationSummaryFormComponentDefinitionOutline,
} from '../component/validation-summary.outline';
import { ValidationSummaryFieldComponentConfig } from '../component/validation-summary.model';
import {
  CheckboxTreeComponentName,
  CheckboxTreeFieldComponentDefinitionOutline,
  CheckboxTreeFieldModelDefinitionOutline,
  CheckboxTreeFormComponentDefinitionOutline,
  CheckboxTreeModelName,
} from '../component/checkbox-tree.outline';
import { CheckboxTreeFieldComponentConfig, CheckboxTreeFieldModelConfig } from '../component/checkbox-tree.model';
import {
  MapComponentName,
  MapDrawingMode,
  MapFieldModelConfigOutline,
  MapFieldComponentDefinitionOutline,
  MapFieldModelDefinitionOutline,
  MapFormComponentDefinitionOutline,
  MapModelName,
  MapTileLayerConfig,
} from '../component/map.outline';
import { MapFieldComponentConfig, MapFieldModelConfig } from '../component/map.model';
import {
  FileUploadComponentName,
  FileUploadFieldComponentDefinitionOutline,
  FileUploadFieldModelDefinitionOutline,
  FileUploadFormComponentDefinitionOutline,
  FileUploadModelName,
} from '../component/file-upload.outline';
import { FileUploadFieldComponentConfig, FileUploadFieldModelConfig } from '../component/file-upload.model';

import { FieldModelConfigFrame } from '../field-model.outline';
import { FieldComponentConfigFrame } from '../field-component.outline';
import { FieldLayoutConfigFrame } from '../field-layout.outline';
import { FormConfigVisitor } from './base.model';
import { FormPathHelper, PropertiesHelper } from './common.model';
import { AllFormComponentDefinitionOutlines } from '../dictionary.outline';
import { CanVisit } from './base.outline';
import { LineagePath, LineagePathsPartial } from '../names/naming-helpers';
import { VisitorFormComponentClassDefMapType, FormComponentDefinitionMap } from '../dictionary.model';
import { isTypeFormComponentDefinitionName } from '../form-types.outline';
import { ILogger } from '../../logger.interface';
import {
  ReusableComponentName,
  ReusableFieldComponentDefinitionOutline,
  ReusableFormComponentDefinitionOutline,
} from '../component/reusable.outline';
import { ReusableFieldComponentConfig } from '../component/reusable.model';
import { AttachmentFieldsVisitor } from './attachment-fields.visitor';

interface V4ClassNames {
  v4ClassName: string;
  v4CompClassName: string;
}

interface V5ClassNames {
  componentClassName: string;
  modelClassName?: string;
  layoutClassName?: string;
}

/*
 * HOW TO ADD OR UPDATE THE MAPPING
 *
 * There are a few places to update to properly map from a v4 form config to a v5 form config:
 * 1. Add the v4 class name and comp class name to formConfigV4ToV5Mapping, along with the matching v5 class names.
 * 2. Add any component-specific mapping post-processing to postProcessingFormConfigV4ToV5Mapping.
 * 3. Check the 'visit<Name>[Field|Form]...' methods, and see if there is any special processing needed.
 *
 */

/**
 * Overall mapping from v4 class, v4 compClass to v5 class names.
 */
const formConfigV4ToV5Mapping: { [v4ClassName: string]: { [v4CompClassName: string]: V5ClassNames } } = {
  Container: {
    '': {
      componentClassName: GroupFieldComponentName,
      modelClassName: GroupFieldModelName,
    },
    TextBlockComponent: {
      componentClassName: ContentComponentName,
    },
    GenericGroupComponent: {
      componentClassName: GroupFieldComponentName,
      modelClassName: GroupFieldModelName,
    },
  },
  TextArea: {
    '': {
      componentClassName: TextAreaComponentName,
      modelClassName: TextAreaModelName,
    },
    TextAreaComponent: {
      componentClassName: TextAreaComponentName,
      modelClassName: TextAreaModelName,
    },
  },
  MarkdownTextArea: {
    '': {
      componentClassName: RichTextEditorComponentName,
      modelClassName: RichTextEditorModelName,
    },
    MarkdownTextAreaComponent: {
      componentClassName: RichTextEditorComponentName,
      modelClassName: RichTextEditorModelName,
    },
  },
  TabOrAccordionContainer: {
    '': {
      componentClassName: TabComponentName,
      layoutClassName: TabLayoutName,
    },
    TabOrAccordionContainerComponent: {
      componentClassName: TabComponentName,
      layoutClassName: TabLayoutName,
    },
  },
  ButtonBarContainer: {
    '': {
      componentClassName: GroupFieldComponentName,
      modelClassName: GroupFieldModelName,
    },
    ButtonBarContainerComponent: {
      componentClassName: GroupFieldComponentName,
      modelClassName: GroupFieldModelName,
    },
  },
  TextField: {
    '': {
      componentClassName: SimpleInputComponentName,
      modelClassName: SimpleInputModelName,
    },
  },
  HiddenValue: {
    HiddenValueComponent: {
      componentClassName: SimpleInputComponentName,
      modelClassName: SimpleInputModelName,
    },
  },
  RepeatableContainer: {
    '': {
      componentClassName: RepeatableComponentName,
      modelClassName: RepeatableModelName,
    },
    RepeatableTextfieldComponent: {
      componentClassName: RepeatableComponentName,
      modelClassName: RepeatableModelName,
    },
    RepeatableGroupComponent: {
      componentClassName: RepeatableComponentName,
      modelClassName: RepeatableModelName,
    },
    RepeatableVocabComponent: {
      componentClassName: RepeatableComponentName,
      modelClassName: RepeatableModelName,
    },
  },
  RepeatableContributor: {
    RepeatableContributorComponent: {
      componentClassName: RepeatableComponentName,
      modelClassName: RepeatableModelName,
    },
  },
  RepeatableVocab: {
    '': {
      componentClassName: RepeatableComponentName,
      modelClassName: RepeatableModelName,
    },
    RepeatableVocabComponent: {
      componentClassName: RepeatableComponentName,
      modelClassName: RepeatableModelName,
    },
  },
  SelectionField: {
    DropdownFieldComponent: {
      componentClassName: DropdownInputComponentName,
      modelClassName: DropdownInputModelName,
    },
    SelectionFieldComponent: {
      componentClassName: DropdownInputComponentName,
      modelClassName: DropdownInputModelName,
    },
  },
  VocabField: {
    '': {
      componentClassName: TypeaheadInputComponentName,
      modelClassName: TypeaheadInputModelName,
    },
    VocabFieldComponent: {
      componentClassName: TypeaheadInputComponentName,
      modelClassName: TypeaheadInputModelName,
    },
  },
  DateTime: {
    '': {
      componentClassName: DateInputComponentName,
      modelClassName: DateInputModelName,
    },
  },
  SaveButton: {
    '': {
      componentClassName: SaveButtonComponentName,
    },
  },
  // TODO: Should tab nav be a different component?
  TabNavButton: {
    '': {
      componentClassName: TabNavButtonComponentName,
    },
  },
  // TODO: Should anchor or button be a different component?
  AnchorOrButton: {
    '': {
      componentClassName: SaveButtonComponentName,
    },
    // TODO: what is class: AnchorOrButton, compClass: TextBlockComponent?
    // "TextBlockComponent": {}
  },
  // TODO: Should cancel button be a different component?
  CancelButton: {
    '': {
      componentClassName: CancelButtonComponentName,
    },
  },
  // TabContentContainer is not a real v4 class: it a placeholder to aid mapping to tab content component
  TabContentContainer: {
    '': {
      componentClassName: TabContentComponentName,
      layoutClassName: TabContentLayoutName,
    },
  },
  ContributorField: {
    '': {
      componentClassName: ReusableComponentName,
    },
  },
  ANDSVocab: {
    '': {
      componentClassName: CheckboxTreeComponentName,
      modelClassName: CheckboxTreeModelName,
    },
    ANDSVocabComponent: {
      componentClassName: CheckboxTreeComponentName,
      modelClassName: CheckboxTreeModelName,
    },
  },
  MapField: {
    '': {
      componentClassName: MapComponentName,
      modelClassName: MapModelName,
    },
    MapComponent: {
      componentClassName: MapComponentName,
      modelClassName: MapModelName,
    },
  },
  RelatedFileUpload: {
    '': {
      componentClassName: FileUploadComponentName,
      modelClassName: FileUploadModelName,
    },
    RelatedFileUploadComponent: {
      componentClassName: FileUploadComponentName,
      modelClassName: FileUploadModelName,
    },
    RelatedFileComponent: {
      componentClassName: FileUploadComponentName,
      modelClassName: FileUploadModelName,
    },
  },
  DataLocation: {
    '': {
      componentClassName: FileUploadComponentName,
      modelClassName: FileUploadModelName,
    },
    DataLocationComponent: {
      componentClassName: FileUploadComponentName,
      modelClassName: FileUploadModelName,
    },
  },
};

const andsVocabDefaultLabelTemplate = '{{default (split notation "/" -1) notation}} - {{label}}';

/**
 * Post-processing after mapping v4 to v5 class names.
 * @param v4Field The v4 field.
 * @param v4ClassNames The v4 class names used to match the mapping.
 * @param v5ClassNames The v5 class names that matched.
 */
function postProcessingFormConfigV4ToV5Mapping(
  v4Field: Record<string, unknown>,
  v4ClassNames: V4ClassNames,
  v5ClassNames: V5ClassNames
): V5ClassNames {
  const v4ClassName = v4ClassNames.v4ClassName;
  const v4CompClassName = v4ClassNames.v4CompClassName;
  const fieldDefinition = (v4Field?.definition ?? {}) as Record<string, unknown>;

  let v5ComponentClassName = v5ClassNames.componentClassName || '';
  let v5ModelClassName = v5ClassNames.modelClassName || '';
  const v5LayoutClassName = v5ClassNames.layoutClassName || '';

  // Some components need special processing.

  // Use the CheckboxInputComponent
  if (fieldDefinition?.controlType === 'checkbox') {
    v5ComponentClassName = 'CheckboxInputComponent';
    v5ModelClassName = 'CheckboxInputModel';
  }

  // Use the RadioInputComponent
  if (fieldDefinition?.controlType === 'radio') {
    v5ComponentClassName = 'RadioInputComponent';
    v5ModelClassName = 'RadioInputModel';
  }

  return {
    componentClassName: v5ComponentClassName,
    modelClassName: v5ModelClassName,
    layoutClassName: v5LayoutClassName,
  };
}

/**
 * A form config visitor for migrating from v4 form config structure to v5 structure.
 *
 * Any v4 form config that cannot be automatically mapped will be added as a string value to a property.
 * If a component cannot be mapped, it will be added as a ContentComponent with a descriptive content.
 *
 * The resulting FormConfig is intended to be passed to the construct visitor, as if it was loaded from form config json.
 */
export class MigrationV4ToV5FormConfigVisitor extends FormConfigVisitor {
  protected override logName = 'MigrationV4ToV5FormConfigVisitor';

  private formComponentMap: VisitorFormComponentClassDefMapType;

  private v4FormConfig: Record<string, unknown>;
  private v5FormConfig: FormConfigOutline;

  private mostRecentRepeatableElementTemplatePath: LineagePath | null;

  private v4FormPath: LineagePath;
  private formPathHelper: FormPathHelper;
  private sharedProps: PropertiesHelper;

  private isInsideButtonBarContainer: boolean = false;

  constructor(logger: ILogger) {
    super(logger);
    this.formComponentMap = FormComponentDefinitionMap;

    this.v4FormConfig = {
      attachmentFields: undefined,
      customAngularApp: { appName: '', appSelector: '' },
      editCssClasses: '',
      fields: [],
      messages: {},
      name: '',
      requiredFieldIndicator: '',
      skipValidationOnSave: false,
      type: '',
      viewCssClasses: '',
      workflowStep: '',
    };
    this.v5FormConfig = new FormConfig();
    this.v4FormPath = [];

    this.mostRecentRepeatableElementTemplatePath = null;

    this.formPathHelper = new FormPathHelper(logger, this);
    this.sharedProps = new PropertiesHelper();
  }

  start(options: { data: any }): FormConfigOutline {
    this.v4FormConfig = _cloneDeep(this.normaliseV4FormConfig(options.data));
    this.v5FormConfig = new FormConfig();
    this.v5FormConfig.debugValue = true;
    this.v4FormPath = [];

    this.mostRecentRepeatableElementTemplatePath = null;

    this.formPathHelper.reset();

    this.v5FormConfig.accept(this);

    const attachmentVisitor = new AttachmentFieldsVisitor(this.logger);
    attachmentVisitor.start(this.v5FormConfig);

    return this.v5FormConfig;
  }

  /* Form Config */

  visitFormConfig(item: FormConfigOutline): void {
    const currentData = this.getV4Data();

    // Set properties that are the same in v4 and v5.
    this.sharedProps.setPropOverride('name', item, currentData);
    this.sharedProps.setPropOverride('type', item, currentData);
    this.sharedProps.setPropOverride('viewCssClasses', item, currentData);
    this.sharedProps.setPropOverride('editCssClasses', item, currentData);

    // Convert properties from v4 to v5.

    // TODO: form.customAngularApp?
    // TODO: form.workflowStep?
    // TODO: form.requiredFieldIndicator?
    // TODO: form.messages?
    // TODO: form.attachmentFields?

    // Convert skipValidationOnSave to enabledValidationGroups.
    if (Object.hasOwn(currentData, 'skipValidationOnSave')) {
      switch (currentData.skipValidationOnSave) {
        case true:
          item.enabledValidationGroups = ['none'];
          break;
        case false:
        default:
          item.enabledValidationGroups = ['all'];
          break;
      }
    }

    // Convert fields to components
    const fields: Record<string, unknown>[] = currentData.fields ?? [];
    // this.logger.info(`Processing '${item.name}': with ${fields.length} fields at ${JSON.stringify(this.v4FormPath)}.`);
    fields.forEach((field, index) => {
      const v4FormPathMore = ['fields', index.toString()];
      // Create the instance from the v4 config
      const formComponent = this.constructFormComponent(field, v4FormPathMore);

      // Visit children
      this.acceptV4FormConfigPath(
        formComponent,
        this.formPathHelper.lineagePathsForFormConfigComponentDefinition(formComponent, index),
        v4FormPathMore
      );

      // Store the instance on the item
      item.componentDefinitions.push(formComponent);
    });

    // Add the validation summary.
    const validationSummaryFrame = {
      name: 'validation_summary',
      component: { class: 'ValidationSummaryComponent' },
    };
    const validationSummaryComponent = this.sharedProps.sharedConstructFormComponent(validationSummaryFrame);
    item.componentDefinitions.push(validationSummaryComponent);
  }

  /* SimpleInput */

  visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new SimpleInputFieldComponentConfig();
    this.sharedPopulateFieldComponentConfig(item.config, field);
    this.sharedProps.setPropOverride('type', item.config, field?.definition);

    if (field?.class === 'HiddenValue' || field?.compClass === 'HiddenValueComponent') {
      item.config.type = 'hidden';
    }
  }

  visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new SimpleInputFieldModelConfig();
    this.sharedPopulateFieldModelConfig(item.config, field);
  }

  visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Content */

  visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    if (!item.config) {
      item.config = new ContentFieldComponentConfig();
    }
    this.sharedPopulateFieldComponentConfig(item.config, field);

    // TODO: form.customAngularApp?
    // TODO: form.requiredFieldIndicator?
    // TODO: form.messages?
    // TODO: form.attachmentFields?
    // Content component is used to display info about missing component mappings.
    // Provide a message for not yet implemented fields.
    const { componentClassName, modelClassName, layoutClassName } = this.mapV4ToV5(field);
    if (!componentClassName) {
      const v4ClassName = field?.class?.toString() ?? '';
      const v4CompClassName = field?.compClass?.toString() ?? '';
      const v4Name = field?.definition?.name || field?.definition?.id;

      const msgs = [
        `Not yet implemented in v5: v4ClassName ${JSON.stringify(v4ClassName)} v4CompClassName ${JSON.stringify(v4CompClassName)} v4Name ${JSON.stringify(v4Name)}.`,
        `At path '${JSON.stringify(this.v4FormPath)}'.`,
      ];

      if (modelClassName) {
        msgs.push(`Model: ${modelClassName}.`);
      }

      if (layoutClassName) {
        msgs.push(`Layout: ${layoutClassName}.`);
      }

      const msg = msgs.join(' ');
      item.config.content = msg;
      this.logger.warn(msg);
    } else {
      // Map from the v4 config to v5 config.

      /*
       * The below template is a reference that needs to be taken into account for legacy compatibility
       *
       * <span *ngSwitchCase="'h1'" role="heading" aria-level="1" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
       * <span *ngSwitchCase="'h2'" role="heading" aria-level="2" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
       * <span *ngSwitchCase="'h3'" role="heading" aria-level="3" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
       * <span *ngSwitchCase="'h4'" role="heading" aria-level="4" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
       * <span *ngSwitchCase="'h5'" role="heading" aria-level="5" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
       * <span *ngSwitchCase="'h6'" role="heading" aria-level="6" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
       * <hr *ngSwitchCase="'hr'" [ngClass]="field.cssClasses">
       * <span *ngSwitchCase="'span'" [ngClass]="field.cssClasses">{{field.label == null? '' : field.label + ': '}}{{field.value == null? '' : field.value}}</span>
       * <p *ngSwitchDefault [ngClass]="field.cssClasses" [innerHtml]="field.value == null? '' : field.value"></p>
       */

      const v4Value = field?.definition?.value ?? '';
      const v4Type = field?.definition?.type;

      switch (v4Type) {
        case 'h1':
          item.config.content = v4Value;
          item.config.template = `<span role="heading" aria-level="1">{{content}}</span>`;
          break;
        case 'h2':
          item.config.content = v4Value;
          item.config.template = `<span role="heading" aria-level="2">{{content}}</span>`;
          break;
        case 'h3':
          item.config.content = v4Value;
          item.config.template = `<span role="heading" aria-level="3">{{content}}</span>`;
          break;
        case 'h4':
          item.config.content = v4Value;
          item.config.template = `<span role="heading" aria-level="4">{{content}}</span>`;
          break;
        case 'h5':
          item.config.content = v4Value;
          item.config.template = `<span role="heading" aria-level="5">{{content}}</span>`;
          break;
        case 'h6':
          item.config.content = v4Value;
          item.config.template = `<span role="heading" aria-level="6">{{content}}</span>`;
          break;
        case 'hr':
          item.config.content = v4Value;
          item.config.template = `<hr>`;
          break;
        case 'span':
          const label = item.config.label;
          if (v4Value && label) {
            item.config.content = { value: v4Value, label: item.config.label };
            item.config.template = `<span>{{content.label}}: {{content.value}}</span>`;
          } else if (v4Value && !label) {
            item.config.content = v4Value;
            item.config.template = `<span>{{content}}</span>`;
          } else if (!v4Value && label) {
            item.config.content = label;
            item.config.template = `<span>{{content}}:</span>`;
          } else {
            item.config.content = '';
          }
          break;
        default:
          item.config.content = v4Value;
          item.config.template = `<p>{{content}}</p>`;
          break;
      }
    }
  }

  visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Repeatable  */

  visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new RepeatableFieldComponentConfig();
    this.sharedPopulateFieldComponentConfig(item.config, field);
    const currentFormConfigPath = this.formPathHelper.formPath.formConfig;

    const fields = field?.definition?.fields ?? [];
    // this.logger.info(`Processing '${item.class}': with ${fields.length} fields at ${JSON.stringify(this.v4FormPath)}.`);

    if (fields.length === 1) {
      const v4Field = fields[0];

      // Track the most recent element template.
      // - Ensure newEntryValue is used only in elementTemplate definitions.
      // - Ensure defaultValue is not defined in elementTemplate or any nested components.
      const previousMostRecentRepeatableElementTemplatePath =
        this.mostRecentRepeatableElementTemplatePath === null
          ? null
          : [...this.mostRecentRepeatableElementTemplatePath];
      this.mostRecentRepeatableElementTemplatePath = [...currentFormConfigPath, 'config', 'elementTemplate'];

      try {
        const v4FormPathMore = ['definition', 'fields', '0'];
        // Create the instance from the v4 config
        const formComponent = this.constructFormComponent(v4Field, v4FormPathMore);

        // The elementTemplate's name must be a falsy value.
        formComponent.name = '';

        // Visit children
        this.acceptV4FormConfigPath(
          formComponent,
          this.formPathHelper.lineagePathsForRepeatableFieldComponentDefinition(formComponent),
          v4FormPathMore
        );

        // TODO: This check & change needs to be expanded to collect the defaultValues for all nested components as well.
        //       Likely something similar to how the construct visitor does it could be adapted for this.
        // Overall repeatable default: repeatable.model.config.defaultValue
        // New item default: elementTemplate.model.config.newEntryValue
        // The elementTemplate defaultValue must be set in newEntryValue
        if (formComponent?.model?.config?.defaultValue !== undefined) {
          formComponent.model.config.newEntryValue = formComponent?.model?.config?.defaultValue;
          const i = formComponent.model.config;
          delete i['defaultValue'];
        }

        // The newEntryValue must have a value.
        // if (formComponent?.model?.config !== undefined && formComponent.model.config.newEntryValue === undefined) {
        //     formComponent.model.config.newEntryValue = {};
        // }

        // Store the instance on the item
        item.config.elementTemplate = formComponent;
      } finally {
        // Restore the previous element template state.
        this.mostRecentRepeatableElementTemplatePath = previousMostRecentRepeatableElementTemplatePath;
      }
    } else {
      this.logger.error(
        `${this.logName}: Expected one field in definition for repeatable, but found ${fields.length}: ${JSON.stringify(field)}`
      );
    }
  }

  visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new RepeatableFieldModelConfig();
    this.sharedPopulateFieldModelConfig(item.config, field);
  }

  visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new RepeatableElementFieldLayoutConfig();
    this.sharedPopulateFieldLayoutConfig(item.config, field);
  }

  visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Validation Summary */

  visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new ValidationSummaryFieldComponentConfig();
    this.sharedPopulateFieldComponentConfig(item.config, field);
  }

  visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Group */

  visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    const config = new GroupFieldComponentConfig();
    item.config = config;
    this.sharedPopulateFieldComponentConfig(item.config, field);

    if (field?.class === 'ButtonBarContainer' || field?.compClass === 'ButtonBarContainerComponent') {
      config.hostCssClasses = 'd-flex gap-3';
      this.isInsideButtonBarContainer = true;
    }

    this.logger.debug(`${this.logName}: visitGroupFieldComponentDefinition for '${String(field?.definition?.name ?? field?.definition?.id ?? '')}'.`);

    const fields: Record<string, unknown>[] = field?.definition?.fields ?? [];
    // this.logger.info(`Processing '${item.class}': with ${fields.length} fields at ${JSON.stringify(this.v4FormPath)}.`);
    fields.forEach((childField, index) => {
      if (childField?.class === 'Spacer' || childField?.compClass === 'SpacerComponent') {
        return;
      }

      const v4FormPathMore = ['definition', 'fields', index.toString()];
      // Create the instance from the v4 config
      const formComponent = this.constructFormComponent(childField, v4FormPathMore);

      // Visit children
      this.acceptV4FormConfigPath(
        formComponent,
        this.formPathHelper.lineagePathsForGroupFieldComponentDefinition(formComponent, index),
        v4FormPathMore
      );

      // Store the instance on the item
      config.componentDefinitions.push(formComponent);
    });

    if (field?.class === 'ButtonBarContainer' || field?.compClass === 'ButtonBarContainerComponent') {
      this.isInsideButtonBarContainer = false;
    }
  }

  visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new GroupFieldModelConfig();
    this.sharedPopulateFieldModelConfig(item.config, field);

    if (field?.class === 'ButtonBarContainer' || field?.compClass === 'ButtonBarContainerComponent') {
      item.config.disabled = true;
    }
  }

  visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Tab  */

  visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    const config = new TabFieldComponentConfig();
    item.config = config;
    this.sharedPopulateFieldComponentConfig(item.config, field);

    const fields: Record<string, unknown>[] = field?.definition?.fields ?? [];
    // this.logger.info(`Processing '${item.class}': with ${fields.length} fields at ${JSON.stringify(this.v4FormPath)}.`);
    fields.forEach((field, index) => {
      const v4FormPathMore = ['definition', 'fields', index.toString()];

      // TODO: Does this approach to mapping the tab content component lose data?
      // build tab component from field by setting 'placeholder' v4 class
      // TabContentContainer is not a real v4 class: it a placeholder to aid mapping to tab content component
      field.class = 'TabContentContainer';

      // Create the instance from the v4 config
      const formComponent = this.constructFormComponent(field, v4FormPathMore);
      if (
        isTypeFormComponentDefinitionName<TabContentFormComponentDefinitionFrame>(
          formComponent,
          TabContentComponentName
        )
      ) {
        // Visit children
        this.acceptV4FormConfigPath(
          formComponent,
          this.formPathHelper.lineagePathsForTabFieldComponentDefinition(formComponent, index),
          v4FormPathMore
        );

        // Store the instance on the item
        config.tabs.push(formComponent);
      }
    });
  }

  visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new TabFieldLayoutConfig();
    this.sharedPopulateFieldLayoutConfig(item.config, field);
  }

  visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /*  Tab Content */

  visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    const config = new TabContentFieldComponentConfig();
    item.config = config;
    this.sharedPopulateFieldComponentConfig(item.config, field);

    const fields: Record<string, unknown>[] = field?.definition?.fields ?? [];
    // this.logger.info(`Processing '${item.class}': with ${fields.length} fields at ${JSON.stringify(this.v4FormPath)}.`);
    fields.forEach((field, index) => {
      const v4FormPathMore = ['definition', 'fields', index.toString()];
      // Create the instance from the v4 config
      const formComponent = this.constructFormComponent(field, v4FormPathMore);

      // Visit children
      this.acceptV4FormConfigPath(
        formComponent,
        this.formPathHelper.lineagePathsForTabContentFieldComponentDefinition(formComponent, index),
        ['definition', 'fields', index.toString()]
      );

      // Store the instance on the item
      config.componentDefinitions.push(formComponent);
    });
  }

  visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new TabContentFieldLayoutConfig();
    if (field?.definition?.label) {
      item.config.buttonLabel = field?.definition?.label;
    }
    this.sharedPopulateFieldLayoutConfig(item.config, field);
  }

  visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Save Button  */

  visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new SaveButtonFieldComponentConfig();
    this.sharedPopulateFieldComponentConfig(item.config, field);
  }

  visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Cancel Button  */

  visitCancelButtonFieldComponentDefinition(item: CancelButtonFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new CancelButtonFieldComponentConfig();
    this.sharedPopulateFieldComponentConfig(item.config, field);

    this.sharedProps.setPropOverride('confirmationMessage', item.config, field?.definition);
    this.sharedProps.setPropOverride('confirmationTitle', item.config, field?.definition);
    this.sharedProps.setPropOverride('cancelButtonMessage', item.config, field?.definition);
    this.sharedProps.setPropOverride('confirmButtonMessage', item.config, field?.definition);
  }

  visitCancelButtonFormComponentDefinition(item: CancelButtonFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Tab Nav Button  */

  visitTabNavButtonFieldComponentDefinition(item: TabNavButtonFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new TabNavButtonFieldComponentConfig();
    this.sharedPopulateFieldComponentConfig(item.config, field);

    this.sharedProps.setPropOverride('prevLabel', item.config, field?.definition);
    this.sharedProps.setPropOverride('nextLabel', item.config, field?.definition);
    this.sharedProps.setPropOverride('targetTabContainerId', item.config, field?.definition);
    this.sharedProps.setPropOverride('endDisplayMode', item.config, field?.definition);
  }

  visitTabNavButtonFormComponentDefinition(item: TabNavButtonFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Text Area */

  visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new TextAreaFieldComponentConfig();
    this.sharedPopulateFieldComponentConfig(item.config, field);

    const colsRaw = field?.definition?.cols ?? field?.definition?.columns ?? undefined;
    const colsParsed = colsRaw === undefined ? undefined : Number.parseInt(String(colsRaw), 10);
    const cols = colsParsed !== undefined && Number.isFinite(colsParsed) ? colsParsed : undefined;
    this.sharedProps.setPropOverride('cols', item.config, { cols });

    const rowsRaw = field?.definition?.rows ?? undefined;
    const rowsParsed = rowsRaw === undefined ? undefined : Number.parseInt(String(rowsRaw), 10);
    const rows = rowsParsed !== undefined && Number.isFinite(rowsParsed) ? rowsParsed : undefined;
    this.sharedProps.setPropOverride('rows', item.config, { rows });
  }

  visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new TextAreaFieldModelConfig();
    this.sharedPopulateFieldModelConfig(item.config, field);
  }

  visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Rich Text Editor */

  visitRichTextEditorFieldComponentDefinition(item: RichTextEditorFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new RichTextEditorFieldComponentConfig();
    this.sharedPopulateFieldComponentConfig(item.config, field);

    const v4ClassName = field?.class?.toString() ?? '';
    if (v4ClassName === 'MarkdownTextArea') {
      item.config.outputFormat = 'markdown';
    }
  }

  visitRichTextEditorFieldModelDefinition(item: RichTextEditorFieldModelDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new RichTextEditorFieldModelConfig();
    this.sharedPopulateFieldModelConfig(item.config, field);
  }

  visitRichTextEditorFormComponentDefinition(item: RichTextEditorFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Map */

  visitMapFieldComponentDefinition(item: MapFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new MapFieldComponentConfig();
    this.sharedPopulateFieldComponentConfig(item.config, field);

    const rawDefinition = (field?.definition ?? {}) as Record<string, unknown>;
    const leafletOptions = this.readObject(rawDefinition.leafletOptions);
    const drawOptions = this.readObject(rawDefinition.drawOptions);

    const center = this.extractLegacyMapCenter(leafletOptions);
    if (center) {
      this.sharedProps.setPropOverride('center', item.config, { center });
    }
    const zoom = this.extractLegacyMapZoom(leafletOptions);
    if (zoom !== undefined) {
      this.sharedProps.setPropOverride('zoom', item.config, { zoom });
    }

    const tileLayers = this.extractLegacyMapTileLayers(rawDefinition);
    if (tileLayers.length > 0) {
      this.sharedProps.setPropOverride('tileLayers', item.config, { tileLayers });
    }

    const enabledModes = this.extractLegacyMapEnabledModes(drawOptions);
    if (enabledModes.length > 0) {
      this.sharedProps.setPropOverride('enabledModes', item.config, { enabledModes });
    }
  }

  visitMapFieldModelDefinition(item: MapFieldModelDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new MapFieldModelConfig();
    this.sharedPopulateFieldModelConfig(item.config, field);
    this.coerceMapFeatureCollection(item.config);
  }

  visitMapFormComponentDefinition(item: MapFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* File Upload */

  visitFileUploadFieldComponentDefinition(item: FileUploadFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new FileUploadFieldComponentConfig();
    this.sharedPopulateFieldComponentConfig(item.config, field);

    const restrictions = this.readObject(field?.definition?.restrictions);
    if (restrictions) {
      this.sharedProps.setPropOverride('restrictions', item.config, { restrictions });
    }

    const uppyDashboardNote = field?.definition?.uppyDashboardNote;
    if (uppyDashboardNote) {
      this.sharedProps.setPropOverride('uppyDashboardNote', item.config, { uppyDashboardNote });
    }

    const notesEnabled = field?.definition?.notesEnabled;
    if (typeof notesEnabled === 'boolean') {
      const metadataFields = notesEnabled
        ? [
          {
            id: 'notes',
            name: 'Notes',
            placeholder: 'Notes about this file.',
          },
        ]
        : [];
      this.sharedProps.setPropOverride('restrictions', item.config, {
        restrictions: {
          ...(item.config.restrictions ?? {}),
          metadataFields,
        },
      });
    }
  }

  visitFileUploadFieldModelDefinition(item: FileUploadFieldModelDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new FileUploadFieldModelConfig();
    this.sharedPopulateFieldModelConfig(item.config, field);
  }

  visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Default Layout  */

  visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new DefaultFieldLayoutConfig();
    this.sharedPopulateFieldLayoutConfig(item.config, field);
  }

  /* Checkbox Input */

  visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new CheckboxInputFieldComponentConfig();
    this.sharedPopulateFieldComponentConfig(item.config, field);

    const options = this.migrateOptions(field);
    this.sharedProps.setPropOverride('options', item.config, { options: options });
  }

  visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new CheckboxInputFieldModelConfig();
    this.sharedPopulateFieldModelConfig(item.config, field);
  }

  visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Checkbox Tree */

  visitCheckboxTreeFieldComponentDefinition(item: CheckboxTreeFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new CheckboxTreeFieldComponentConfig();
    this.sharedPopulateFieldComponentConfig(item.config, field);

    const rawDefinition = (field?.definition ?? {}) as Record<string, unknown>;
    const vocabRef = String(rawDefinition.vocabRef ?? rawDefinition.vocabId ?? '').trim();
    if (!vocabRef) {
      this.logger.warn(
        `${this.logName}: CheckboxTree migration missing vocabId/vocabRef at ${JSON.stringify(this.v4FormPath)}.`
      );
    } else {
      this.sharedProps.setPropOverride('vocabRef', item.config, { vocabRef });
    }

    const inlineVocab = this.parseLegacyBooleanFlag(rawDefinition.inlineVocab, undefined, 'inlineVocab');
    if (inlineVocab !== undefined) {
      this.sharedProps.setPropOverride('inlineVocab', item.config, { inlineVocab });
    }
    const leafOnly = this.parseLegacyBooleanFlag(rawDefinition.leafOnly, true, 'leafOnly');
    this.sharedProps.setPropOverride('leafOnly', item.config, { leafOnly });

    const maxDepth = this.parseLegacyPositiveInteger(rawDefinition.maxDepth, 'maxDepth');
    if (maxDepth !== undefined) {
      this.sharedProps.setPropOverride('maxDepth', item.config, { maxDepth });
    }

    if (this.isLegacyAndsVocabField(field)) {
      this.sharedProps.setPropOverride('labelTemplate', item.config, {
        labelTemplate: andsVocabDefaultLabelTemplate,
      });
    }

    this.warnOnMalformedLegacyRegex(rawDefinition);
  }

  visitCheckboxTreeFieldModelDefinition(item: CheckboxTreeFieldModelDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new CheckboxTreeFieldModelConfig();
    this.sharedPopulateFieldModelConfig(item.config, field);
    this.coerceCheckboxTreeDefaultValue(item.config);
  }

  visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Dropdown Input */

  visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new DropdownInputFieldComponentConfig();
    this.sharedPopulateFieldComponentConfig(item.config, field);

    const options = this.migrateOptions(field);
    this.sharedProps.setPropOverride('options', item.config, { options: options });
  }

  visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new DropdownInputFieldModelConfig();
    this.sharedPopulateFieldModelConfig(item.config, field);
  }

  visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Typeahead Input */

  visitTypeaheadInputFieldComponentDefinition(item: TypeaheadInputFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new TypeaheadInputFieldComponentConfig();
    this.sharedPopulateFieldComponentConfig(item.config, field);

    const definition = (field?.definition ?? {}) as Record<string, unknown>;
    const sourceType = this.resolveTypeaheadSourceType(definition);
    this.sharedProps.setPropOverride('sourceType', item.config, { sourceType });

    if (sourceType === 'namedQuery') {
      const queryId = String(definition.vocabQueryId ?? definition.queryId ?? '').trim();
      if (queryId) {
        this.sharedProps.setPropOverride('queryId', item.config, { queryId });
      } else {
        this.logger.warn(
          `${this.logName}: Typeahead migration missing queryId/vocabQueryId at ${JSON.stringify(this.v4FormPath)}.`
        );
      }
      const labelField = this.resolveLegacyLabelField(definition);
      this.sharedProps.setPropOverride('labelField', item.config, { labelField });
      const valueField = String(definition.valueFieldName ?? definition.valueField ?? 'value').trim() || 'value';
      this.sharedProps.setPropOverride('valueField', item.config, { valueField });
    } else if (sourceType === 'static') {
      const labelField = this.resolveLegacyLabelField(definition);
      const valueField = String(definition.valueFieldName ?? definition.valueField ?? 'value').trim() || 'value';
      const normalizedOptions = this.normalizeLegacyTypeaheadStaticOptions(definition, labelField, valueField);
      this.sharedProps.setPropOverride('options', item.config, { options: normalizedOptions });
      this.sharedProps.setPropOverride('staticOptions', item.config, { staticOptions: normalizedOptions });
    } else if (sourceType === 'vocabulary') {
      const vocabRef = String(definition.vocabRef ?? definition.vocabId ?? '').trim();
      if (vocabRef) {
        this.sharedProps.setPropOverride('vocabRef', item.config, { vocabRef });
      } else {
        this.logger.warn(
          `${this.logName}: Typeahead migration missing vocabRef/vocabId at ${JSON.stringify(this.v4FormPath)}.`
        );
      }
    }

    const allowFreeText = this.parseLegacyTypeaheadBoolean(definition.freeText, false, 'freeText');
    this.sharedProps.setPropOverride('allowFreeText', item.config, { allowFreeText });

    const storeLabelOnly = this.parseLegacyTypeaheadBoolean(definition.storeLabelOnly, true, 'storeLabelOnly');
    const valueMode = storeLabelOnly ? 'value' : 'optionObject';
    this.sharedProps.setPropOverride('valueMode', item.config, { valueMode });

    const readOnlyAfterSelect = this.parseLegacyTypeaheadBoolean(
      definition.disableEditAfterSelect,
      false,
      'disableEditAfterSelect'
    );
    if (readOnlyAfterSelect) {
      this.sharedProps.setPropOverride('readOnlyAfterSelect', item.config, { readOnlyAfterSelect });
    }

    this.warnOnDroppedLegacyTypeaheadProperties(definition);
  }

  visitTypeaheadInputFieldModelDefinition(item: TypeaheadInputFieldModelDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new TypeaheadInputFieldModelConfig();
    this.sharedPopulateFieldModelConfig(item.config, field);

    const definition = (field?.definition ?? {}) as Record<string, unknown>;
    const labelField = this.resolveLegacyLabelField(definition);
    const storeLabelOnly = this.parseLegacyTypeaheadBoolean(definition.storeLabelOnly, true, 'storeLabelOnly');
    const valueMode = storeLabelOnly ? 'value' : 'optionObject';

    if (item.config.defaultValue !== undefined) {
      item.config.defaultValue = this.coerceLegacyTypeaheadValue(item.config.defaultValue, valueMode, labelField);
    }
    if (item.config.value !== undefined) {
      item.config.value = this.coerceLegacyTypeaheadValue(item.config.value, valueMode, labelField);
    }
  }

  visitTypeaheadInputFormComponentDefinition(item: TypeaheadInputFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Radio Input */

  visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new RadioInputFieldComponentConfig();
    this.sharedPopulateFieldComponentConfig(item.config, field);

    const options = this.migrateOptions(field);
    this.sharedProps.setPropOverride('options', item.config, { options: options });
  }

  visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new RadioInputFieldModelConfig();
    this.sharedPopulateFieldModelConfig(item.config, field);
  }

  visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Date Input */

  visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new DateInputFieldComponentConfig();
    this.sharedPopulateFieldComponentConfig(item.config, field);
  }

  visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new DateInputFieldModelConfig();
    this.sharedPopulateFieldModelConfig(item.config, field);
  }

  visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Reusable */

  visitReusableFieldComponentDefinition(item: ReusableFieldComponentDefinitionOutline): void {
    const field = this.getV4Data();
    item.config = new ReusableFieldComponentConfig();
    this.sharedPopulateFieldComponentConfig(item.config, field);

    // Set up the reusable form config for ContributorField in the field component.
    const v4ClassName = field?.class?.toString() ?? '';
    if (v4ClassName === 'ContributorField') {
      const fieldDefinition = (field?.definition ?? {}) as Record<string, unknown>;

      // TODO: use more of the contributor field properties on the new component?
      const showHeader = field.showHeader ?? true;
      const required = fieldDefinition.required ?? false;
      const label = fieldDefinition.label?.toString() ?? '';
      const help = fieldDefinition.help ?? '';
      const role = fieldDefinition.role ?? '';
      const name = fieldDefinition.name?.toString() ?? '';
      const freeText = fieldDefinition.freeText ?? false;
      const forceLookupOnly = fieldDefinition?.forceLookupOnly ?? true;
      const vocabQueryId = fieldDefinition?.vocabQueryId ?? '';
      const sourceType = fieldDefinition?.sourceType ?? '';
      const fieldNames = fieldDefinition?.fieldNames ?? [];
      const searchFields = fieldDefinition?.searchFields ?? '';
      const titleFieldArr = fieldDefinition?.titleFieldArr ?? [];
      const titleFieldDelim = fieldDefinition?.titleFieldDelim ?? '';
      const nameColHdr = fieldDefinition?.nameColHdr ?? '';
      const emailColHdr = fieldDefinition?.emailColHdr ?? '';
      const orcidColHdr = fieldDefinition?.orcidColHdr ?? '';
      const showRole = fieldDefinition?.showRole ?? false;
      const placeHolder = fieldDefinition?.placeHolder ?? '';
      const activeValidators = fieldDefinition?.activeValidators ?? {};
      const publish = fieldDefinition?.publish ?? {};
      const validation_required_name = fieldDefinition?.validation_required_name ?? '';
      const validation_required_email = fieldDefinition?.validation_required_email ?? '';
      const validation_invalid_email = fieldDefinition?.validation_invalid_email ?? '';

      // Use the same field, so don't change the lineage path.
      const reusableComponentItemData = {
        name: 'standard_contributor_fields_group',
        overrides: { replaceName: '' },
        layout: { class: 'DefaultLayout', config: {} },
        component: { class: 'GroupComponent', config: {} },
      };
      const reusableComponentItem = this.sharedProps.sharedConstructFormComponent(reusableComponentItemData);

      // Visit children
      this.acceptV4FormConfigPath(
        reusableComponentItem,
        this.formPathHelper.lineagePathsForReusableFieldComponentDefinition(reusableComponentItem, 0)
      );

      // Store the instance on the item
      item.config.componentDefinitions.push(reusableComponentItem);
    }
  }

  visitReusableFormComponentDefinition(item: ReusableFormComponentDefinitionOutline): void {
    const field = this.getV4Data();

    const v4ClassName = field?.class?.toString() ?? '';

    // Set up the reusable form config for ContributorField in the form component.
    if (v4ClassName === 'ContributorField') {
      // Use a reusable form config.
      item.overrides = { reusableFormName: 'standard-contributor-fields-group' };

      // ReusableComponent cannot have a layout.
      item.layout = undefined;
    }

    this.populateFormComponent(item);
  }

  /* Shared */

  protected acceptV4FormConfigPath(item: CanVisit, more?: LineagePathsPartial, v4FormPath?: string[]): void {
    // Copy the original lineage paths so they can be restored.
    const original = [...(this.v4FormPath ?? [])];
    try {
      this.v4FormPath = [...original, ...(v4FormPath ?? [])];
      this.formPathHelper.acceptFormPath(item, more);
    } catch (error) {
      throw error;
    } finally {
      this.v4FormPath = original;
    }
  }

  protected mapV4ToV5(v4Field: Record<string, unknown>): V5ClassNames {
    const v4ClassName = v4Field?.class?.toString() ?? '';
    const v4CompClassName = v4Field?.compClass?.toString() ?? '';

    const matched = formConfigV4ToV5Mapping[v4ClassName]?.[v4CompClassName] ?? {};
    const v4ClassNames = { v4ClassName, v4CompClassName };
    return postProcessingFormConfigV4ToV5Mapping(v4Field, v4ClassNames, matched);
  }

  protected constructFormComponent(field: Record<string, any>, more?: LineagePath): AllFormComponentDefinitionOutlines {
    let { componentClassName, modelClassName, layoutClassName } = this.mapV4ToV5(field);

    const name =
      field?.definition?.name ||
      field?.definition?.id ||
      [componentClassName, ...this.v4FormPath, ...(more ?? [])].join('-');

    // Build the form component definition frame
    const currentData: FormComponentDefinitionFrame = {
      name: name,
      module: undefined,
      component: {
        class: componentClassName,
        config: {},
      },
    };
    if (modelClassName) {
      currentData.model = { class: modelClassName, config: {} };
    }
    // TODO: Give everything a layout for now.
    if (!layoutClassName) {
      layoutClassName = 'DefaultLayout';
    }
    currentData.layout = { class: layoutClassName, config: {} };

    // Set the constraints
    currentData.constraints = {};

    if (field?.editOnly === true || field?.viewOnly === true) {
      currentData.constraints.allowModes = [];
      if (field?.editOnly === true) {
        currentData.constraints.allowModes.push('edit');
      }
      if (field?.viewOnly === true) {
        currentData.constraints.allowModes.push('view');
      }
    }

    currentData.constraints.authorization = {};
    currentData.constraints.authorization.allowRoles = [];
    if (field?.roles?.length > 0) {
      currentData.constraints.authorization.allowRoles.push(...field?.roles);
    }

    // TODO: Set the expressions

    // If there is an error message or the form component class is not known,
    // create a content component instead.
    // The content is set when visiting the field component.

    const formComponentClass = this.formComponentMap?.get(componentClassName);
    if (!componentClassName || !formComponentClass) {
      currentData.component.class = ContentComponentName;
      currentData.layout = { class: DefaultLayoutName, config: {} };
      currentData.model = undefined;
      if (!currentData.component.config) {
        currentData.component.config = {};
      }
    }

    // Construct the form component instance from the built form config frame.
    return this.sharedProps.sharedConstructFormComponent(currentData);
  }

  protected populateFormComponent(item: FormComponentDefinitionOutline): void {
    // Continue visiting
    this.formPathHelper.acceptFormComponentDefinition(item);
    // this.acceptV4FormConfigPath(item.component, {formConfig: ['component']});
    // if (item.model) {
    //     this.acceptV4FormConfigPath(item.model, {formConfig: ['model']});
    // }
    // if (item.layout) {
    //     this.acceptV4FormConfigPath(item.layout, {formConfig: ['layout']});
    // }
  }

  protected sharedPopulateFieldComponentConfig(item: FieldComponentConfigFrame, field?: any) {
    const config = {
      label: field?.definition?.label || field?.definition?.name,
    };
    this.sharedProps.sharedPopulateFieldComponentConfig(item, config);
  }

  protected sharedPopulateFieldModelConfig(item: FieldModelConfigFrame<unknown>, field?: any) {
    if (!item.validators) {
      item.validators = [];
    }
    if (field?.definition?.required === true) {
      item.validators.push({ class: 'required' });
    }
    if (field?.definition?.maxLength !== undefined) {
      item.validators.push({ class: 'maxLength', config: { maxLength: field?.definition?.maxLength } });
    }
    const config = {
      defaultValue: field?.definition?.value ?? field?.definition?.defaultValue,
    };
    // TODO: Components that are a descendant of a repeatable element template cannot have a default value.
    //       The default values should be collected and set as the element template newEntryValue.
    if (this.isRepeatableElementTemplateDescendant()) {
      delete config['defaultValue'];
    }
    this.sharedProps.sharedPopulateFieldModelConfig(item, config);
  }

  protected sharedPopulateFieldLayoutConfig(item: FieldLayoutConfigFrame, field?: any) {
    const config = {
      label: this.isInsideButtonBarContainer ? undefined : field?.definition?.label,
      helpText: field?.definition?.help,
    };
    this.sharedProps.sharedPopulateFieldLayoutConfig(item, config);
  }

  protected getV4Data() {
    const data = this.v4FormConfig;
    const path = this.v4FormPath;

    const result =
      !path || path.length < 1
        ? data
        : _get(
          data,
          path.map(i => i.toString())
        );

    // this.logger.info(JSON.stringify({path, result}));
    return result;
  }

  private normaliseV4FormConfig(formConfig: any): Record<string, unknown> {
    if (formConfig === undefined || formConfig === null) {
      formConfig = {};
    }

    // If the top level is an array, assume it is an array of field definitions.
    if (Array.isArray(formConfig)) {
      formConfig = { fields: formConfig };
    }

    // If the top level has a 'form' property, assume it is an export in the structure form.forms[formId] = formConfig.
    if (Object.hasOwn(formConfig, 'form')) {
      const formIds = Object.keys(formConfig.form.forms ?? {}).filter(formId => formId !== '_dontMerge');
      if (formIds.length === 1) {
        this.logger.info(`Migrating form id: ${formIds[0]}`);
        formConfig = formConfig.form.forms[formIds[0]];
      } else {
        const topKeys = Object.keys(formConfig);
        const formKeys = Object.keys(formConfig.form ?? {});
        const formsKeys = Object.keys(formConfig.form?.forms ?? {});
        this.logger.error(
          `Cannot migrate due to more or less than one form id: ${JSON.stringify({
            topKeys,
            formKeys,
            formsKeys,
          })}`
        );
        formConfig = {};
      }
    }
    // Set the form config name if there isn't one.
    if (!formConfig.name) {
      formConfig.name = 'v4FormConfig';
    }
    return formConfig;
  }

  protected migrateOptions(field: Record<string, unknown>) {
    return (((field?.definition as Record<string, unknown>)?.options as string[]) ?? []).map((option: any) => {
      return {
        label: option?.label ?? '',
        value: option?.value ?? '',
        disabled: option?.disabled ?? option?.historicalOnly ?? undefined,
      };
    });
  }

  /**
   * Check whether the current form config path is a descendant (and not a match)
   * of the most recent repeatable element template path.
   * @protected
   */
  protected isRepeatableElementTemplateDescendant(): boolean {
    const mostRecentPath = this.mostRecentRepeatableElementTemplatePath ?? [];
    const formConfigPath = this.formPathHelper.formPath.formConfig;
    if (!mostRecentPath || mostRecentPath.length === 0 || !formConfigPath || formConfigPath.length === 0) {
      return false;
    }
    // The formConfig path might have ["[component|model|layout]", "config"] at the end (2 additional items),
    // but only the path up to ["config", "elementTemplate"] is relevant for this check.
    if (formConfigPath.length + 2 <= mostRecentPath.length) {
      return false;
    }
    return mostRecentPath.every((value, index) => value === formConfigPath[index]);
  }

  private parseLegacyBooleanFlag(
    rawValue: unknown,
    defaultValue: boolean | undefined,
    fieldName: string
  ): boolean | undefined {
    if (typeof rawValue === 'boolean') {
      return rawValue;
    }
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return defaultValue;
    }
    if (typeof rawValue === 'number') {
      return rawValue !== 0;
    }
    if (typeof rawValue === 'string') {
      const normalized = rawValue.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }
    this.logger.warn(
      `${this.logName}: CheckboxTree migration received malformed '${fieldName}' value, using safe default.`
    );
    return defaultValue;
  }

  private parseLegacyPositiveInteger(rawValue: unknown, fieldName: string): number | undefined {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return undefined;
    }
    const parsed = Number.parseInt(String(rawValue), 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
    this.logger.warn(`${this.logName}: CheckboxTree migration received invalid '${fieldName}' value, ignoring it.`);
    return undefined;
  }

  private warnOnMalformedLegacyRegex(definition: Record<string, unknown>): void {
    for (const key of ['regex', 'pattern', 'leafRegex']) {
      if (!Object.hasOwn(definition, key)) {
        continue;
      }
      const rawValue = definition[key];
      if (rawValue === undefined || rawValue === null || rawValue === '') {
        continue;
      }
      if (rawValue instanceof RegExp) {
        continue;
      }
      if (typeof rawValue === 'string') {
        try {
          // Validate regex string syntax to avoid carrying malformed values into v5 config.
          new RegExp(rawValue);
          continue;
        } catch {
          this.logger.warn(
            `${this.logName}: CheckboxTree migration found malformed regex in '${key}', using defaults.`
          );
          continue;
        }
      }
      this.logger.warn(
        `${this.logName}: CheckboxTree migration found unsupported regex value in '${key}', using defaults.`
      );
    }
  }

  private coerceCheckboxTreeDefaultValue(config: CheckboxTreeFieldModelConfig): void {
    const rawDefaultValue = config.defaultValue;
    if (rawDefaultValue === undefined || rawDefaultValue === null) {
      return;
    }
    if (!Array.isArray(rawDefaultValue)) {
      config.defaultValue = [];
      this.logger.warn(
        `${this.logName}: CheckboxTree migration coerced non-array default value to empty selection array.`
      );
      return;
    }

    const coerced = (rawDefaultValue as unknown[]).filter(item => {
      if (!item || typeof item !== 'object') {
        return false;
      }
      const notation = String((item as { notation?: unknown }).notation ?? '').trim();
      const label = String((item as { label?: unknown }).label ?? '').trim();
      const name = String((item as { name?: unknown }).name ?? '').trim();
      return Boolean(notation && label && name);
    });

    if (coerced.length !== rawDefaultValue.length) {
      this.logger.warn(`${this.logName}: CheckboxTree migration dropped malformed default selection entries.`);
    }
    config.defaultValue = coerced as CheckboxTreeFieldModelConfig['defaultValue'];
  }

  private coerceMapFeatureCollection(config: MapFieldModelConfigOutline): void {
    const emptyCollection = {
      type: 'FeatureCollection',
      features: [],
    } as MapFieldModelConfig['defaultValue'];

    const normalize = (value: unknown): MapFieldModelConfig['defaultValue'] => {
      if (!value || typeof value !== 'object') {
        return emptyCollection;
      }
      const source = value as Record<string, unknown>;
      const type = String(source.type ?? '');
      if (type !== 'FeatureCollection') {
        return emptyCollection;
      }
      const features = Array.isArray(source.features) ? source.features : [];
      return {
        type: 'FeatureCollection',
        features: features as MapFieldModelConfig['defaultValue']['features'],
      };
    };

    config.defaultValue = normalize(config.defaultValue);
    if (config.value !== undefined) {
      config.value = normalize(config.value);
    }
  }

  private extractLegacyMapCenter(leafletOptions: Record<string, unknown>): [number, number] | undefined {
    const center = leafletOptions.center;
    if (Array.isArray(center) && center.length >= 2) {
      const lat = Number(center[0]);
      const lng = Number(center[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return [lat, lng];
      }
    }
    if (center && typeof center === 'object') {
      const centerObj = center as Record<string, unknown>;
      const lat = Number(centerObj.lat);
      const lng = Number(centerObj.lng ?? centerObj.lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return [lat, lng];
      }
    }
    return undefined;
  }

  private extractLegacyMapZoom(leafletOptions: Record<string, unknown>): number | undefined {
    const zoom = Number(leafletOptions.zoom);
    if (Number.isFinite(zoom)) {
      return zoom;
    }
    return undefined;
  }

  private extractLegacyMapTileLayers(definition: Record<string, unknown>): MapTileLayerConfig[] {
    const layersControl = this.readObject(definition.layersControl);
    const baseLayers = this.readObject(layersControl.baseLayers);
    const tileLayers: MapTileLayerConfig[] = [];
    for (const [name, layerValue] of Object.entries(baseLayers)) {
      if (!layerValue || typeof layerValue !== 'object') {
        continue;
      }
      const layer = layerValue as Record<string, unknown>;
      const url = String(layer._url ?? '');
      if (!url) {
        continue;
      }
      tileLayers.push({
        name,
        url,
        options: this.readObject(layer.options),
      });
    }
    return tileLayers;
  }

  private extractLegacyMapEnabledModes(drawOptions: Record<string, unknown>): MapDrawingMode[] {
    const draw = this.readObject(drawOptions.draw);
    const enabledModes: MapDrawingMode[] = [];

    const modeMap: Array<{ key: string; mode: MapDrawingMode }> = [
      { key: 'marker', mode: 'point' },
      { key: 'polygon', mode: 'polygon' },
      { key: 'polyline', mode: 'linestring' },
      { key: 'rectangle', mode: 'rectangle' },
    ];
    for (const { key, mode } of modeMap) {
      const rawModeConfig = draw[key];
      if (rawModeConfig === false) {
        continue;
      }
      enabledModes.push(mode);
    }

    const hasLegacyEditConfig = Object.prototype.hasOwnProperty.call(drawOptions, 'edit');
    if (hasLegacyEditConfig && drawOptions.edit !== false) {
      enabledModes.push('select');
    }

    const deduped = [...new Set(enabledModes)];
    const invalidModes = deduped.filter(
      mode => !['point', 'polygon', 'linestring', 'rectangle', 'select'].includes(mode)
    );
    if (invalidModes.length > 0) {
      this.logger.warn(
        `${this.logName}: Map migration dropped unsupported enabledModes values at ${JSON.stringify(this.v4FormPath)}: ${JSON.stringify(invalidModes)}.`
      );
    }
    return deduped.filter(
      (mode): mode is MapDrawingMode =>
        mode === 'point' || mode === 'polygon' || mode === 'linestring' || mode === 'rectangle' || mode === 'select'
    );
  }

  private readObject(input: unknown): Record<string, unknown> {
    return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  }

  private resolveTypeaheadSourceType(definition: Record<string, unknown>): 'namedQuery' | 'vocabulary' | 'static' {
    const legacySourceType = String(definition.sourceType ?? '')
      .trim()
      .toLowerCase();
    if (legacySourceType === 'query' || legacySourceType === 'namedquery') {
      return 'namedQuery';
    }
    if (legacySourceType === 'vocabulary') {
      return 'vocabulary';
    }
    if (Array.isArray(definition.options) || Array.isArray(definition.staticOptions)) {
      return 'static';
    }
    if (definition.vocabQueryId || definition.queryId) {
      return 'namedQuery';
    }
    if (definition.vocabRef || definition.vocabId) {
      return 'vocabulary';
    }
    return 'namedQuery';
  }

  private normalizeLegacyTypeaheadStaticOptions(
    definition: Record<string, unknown>,
    labelField: string,
    valueField: string
  ): Array<{ label: string; value: string }> {
    const options = this.resolvePreferredLegacyTypeaheadStaticOptions(definition);
    const normalized = options
      .map(entry => this.normalizeLegacyTypeaheadStaticOption(entry, labelField, valueField))
      .filter((entry): entry is { label: string; value: string } => entry !== null);

    if (options.length > 0 && normalized.length !== options.length) {
      this.logger.warn(
        `${this.logName}: Typeahead migration dropped malformed static option entries at ${JSON.stringify(this.v4FormPath)}.`
      );
    }

    return normalized;
  }

  private resolvePreferredLegacyTypeaheadStaticOptions(definition: Record<string, unknown>): unknown[] {
    const options = Array.isArray(definition.options) ? definition.options : [];
    const staticOptions = Array.isArray(definition.staticOptions) ? definition.staticOptions : [];
    if (options.length > 0) {
      return options;
    }
    if (staticOptions.length > 0) {
      return staticOptions;
    }
    return options.length > 0 ? options : staticOptions;
  }

  private normalizeLegacyTypeaheadStaticOption(
    entry: unknown,
    labelField: string,
    valueField: string
  ): { label: string; value: string } | null {
    if (entry === undefined || entry === null) {
      return null;
    }

    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      const normalized = String(entry).trim();
      return normalized ? { label: normalized, value: normalized } : null;
    }

    if (typeof entry !== 'object') {
      return null;
    }

    const source = entry as Record<string, unknown>;
    const resolvedLabel = String(
      source.label ??
      source.name ??
      source.title ??
      source.text ??
      source[labelField] ??
      source[valueField] ??
      source.value ??
      ''
    ).trim();
    const resolvedValue = String(
      source.value ?? source[valueField] ?? source.name ?? source[labelField] ?? source.title ?? source.label ?? ''
    ).trim();

    const label = resolvedLabel || resolvedValue;
    const value = resolvedValue || resolvedLabel;
    if (!label && !value) {
      return null;
    }

    return { label, value };
  }

  private resolveLegacyLabelField(definition: Record<string, unknown>): string {
    const titleFieldName = String(definition.titleFieldName ?? '').trim();
    if (titleFieldName) {
      return titleFieldName;
    }
    const stringLabelToField = String(definition.stringLabelToField ?? '').trim();
    if (stringLabelToField) {
      return stringLabelToField;
    }
    const titleFieldArr = Array.isArray(definition.titleFieldArr) ? definition.titleFieldArr : [];
    const firstTitleField = String(titleFieldArr[0] ?? '').trim();
    if (firstTitleField) {
      return firstTitleField;
    }
    return 'label';
  }

  private parseLegacyTypeaheadBoolean(rawValue: unknown, defaultValue: boolean, fieldName: string): boolean {
    if (typeof rawValue === 'boolean') {
      return rawValue;
    }
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return defaultValue;
    }
    if (typeof rawValue === 'number') {
      return rawValue !== 0;
    }
    if (typeof rawValue === 'string') {
      const normalized = rawValue.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }
    this.logger.warn(
      `${this.logName}: Typeahead migration received malformed '${fieldName}' value, using safe default.`
    );
    return defaultValue;
  }

  private coerceLegacyTypeaheadValue(
    rawValue: unknown,
    valueMode: 'value' | 'optionObject',
    labelField: string
  ): TypeaheadInputFieldModelConfig['value'] {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return null;
    }

    if (valueMode === 'value') {
      if (typeof rawValue === 'string') {
        return rawValue;
      }
      if (typeof rawValue === 'object') {
        const source = rawValue as Record<string, unknown>;
        const candidate = String(source[labelField] ?? source.title ?? source.label ?? source.value ?? '').trim();
        if (candidate) {
          return candidate;
        }
      }
      this.logger.warn(`${this.logName}: Typeahead migration coerced malformed legacy value to null.`);
      return null;
    }

    if (typeof rawValue === 'string') {
      return {
        label: rawValue,
        value: rawValue,
        sourceType: 'freeText',
      };
    }
    if (typeof rawValue === 'object') {
      const source = rawValue as Record<string, unknown>;
      const label = String(source.label ?? source[labelField] ?? source.title ?? source.value ?? '').trim();
      const value = String(source.value ?? source[labelField] ?? source.label ?? source.title ?? '').trim();
      if (!label && !value) {
        this.logger.warn(`${this.logName}: Typeahead migration coerced malformed legacy object value to null.`);
        return null;
      }
      const sourceType = String(source.sourceType ?? '').trim();
      const normalizedSourceType = ['static', 'vocabulary', 'namedQuery', 'freeText'].includes(sourceType)
        ? (sourceType as 'static' | 'vocabulary' | 'namedQuery' | 'freeText')
        : undefined;
      return {
        label: label || value,
        value: value || label,
        sourceType: normalizedSourceType,
      };
    }

    this.logger.warn(`${this.logName}: Typeahead migration coerced malformed legacy value to null.`);
    return null;
  }

  private warnOnDroppedLegacyTypeaheadProperties(definition: Record<string, unknown>): void {
    const droppedProps = [
      'forceClone',
      'completerService',
      'lookupService',
      'publish',
      'subscribe',
      'disableLookupIcon',
      'searchFields',
      'fieldNames',
      'titleFieldDelim',
    ];
    for (const key of droppedProps) {
      if (
        Object.hasOwn(definition, key) &&
        definition[key] !== undefined &&
        definition[key] !== null &&
        definition[key] !== ''
      ) {
        this.logger.warn(
          `${this.logName}: Typeahead migration dropped legacy property '${key}' at ${JSON.stringify(this.v4FormPath)}.`
        );
      }
    }
  }

  private isLegacyAndsVocabField(field: Record<string, unknown>): boolean {
    const v4Class = String(field?.class ?? '').trim();
    const v4CompClass = String(field?.compClass ?? '').trim();
    return v4Class === 'ANDSVocab' || v4CompClass === 'ANDSVocabComponent';
  }
}
