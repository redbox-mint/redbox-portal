import { ILogger } from '../../logger.interface';
import { FieldLayoutConfigFrame } from '../field-layout.outline';
import { FieldComponentConfigFrame } from '../field-component.outline';
import { FieldModelConfigFrame } from '../field-model.outline';
import { FormComponentDefinitionFrame, FormComponentDefinitionOutline } from '../form-component.outline';
import { CanVisit, FormConfigVisitorOutline } from './base.outline';
import { FormConstraintAuthorizationConfig, FormConstraintConfig } from '../form-component.model';
import {
  VisitorComponentClassDefMapType,
  FieldComponentDefinitionMap,
  FieldLayoutDefinitionMap,
  FieldModelDefinitionMap,
  VisitorFormComponentClassDefMapType,
  FormComponentDefinitionMap,
  KindNameDefaultsMap,
  KindNameDefaultsMapType,
  VisitorLayoutClassDefMapType,
  VisitorModelClassDefMapType,
} from '../dictionary.model';
import { buildLineagePaths, LineagePath, LineagePaths, LineagePathsPartial } from '../names/naming-helpers';
import { AllFormComponentDefinitionOutlines } from '../dictionary.outline';
import { FieldLayoutDefinitionKind, FieldModelDefinitionKind, FormComponentDefinitionKind } from '../shared.outline';

export class PropertiesHelper {
  private fieldComponentMap: VisitorComponentClassDefMapType;
  private fieldModelMap: VisitorModelClassDefMapType;
  private fieldLayoutMap: VisitorLayoutClassDefMapType;
  private formComponentMap: VisitorFormComponentClassDefMapType;
  private kindNameDefaultsMap: KindNameDefaultsMapType;

  constructor() {
    this.fieldComponentMap = FieldComponentDefinitionMap;
    this.fieldModelMap = FieldModelDefinitionMap;
    this.fieldLayoutMap = FieldLayoutDefinitionMap;
    this.formComponentMap = FormComponentDefinitionMap;
    this.kindNameDefaultsMap = KindNameDefaultsMap;
  }

  /**
   * Create a new instance of a form component.
   * Populate the common form component properties.
   * @param currentData The form component definition.
   */
  public sharedConstructFormComponent(currentData: FormComponentDefinitionFrame): AllFormComponentDefinitionOutlines {
    // The class to use is identified by the class property string values in the field definitions.
    const formComponentClassString = currentData?.component?.class;

    // The class to use is identified by the class property string values in the field definitions.
    // The form component is identifier the component field class string
    const formComponentClass = this.formComponentMap?.get(formComponentClassString);

    // Create new instance
    if (!formComponentClass) {
      throw new Error(
        `Could not find class for form component class name '${currentData?.component?.class}': : ${JSON.stringify(currentData)}`
      );
    }

    const item = new formComponentClass();

    // Set the simple properties
    item.name = currentData.name;
    item.module = currentData.module;

    // Set the constraints
    item.constraints = new FormConstraintConfig();
    item.constraints.allowModes = currentData?.constraints?.allowModes ?? [];

    item.constraints.authorization = new FormConstraintAuthorizationConfig();
    item.constraints.authorization.allowRoles = currentData?.constraints?.authorization?.allowRoles ?? [];

    // TODO: Commented out below while we decide on how to handle 'form-level' expressions
    // Set the expressions
    // item.expressions = new FormExpressionsConfig();
    // for (const [key, value] of Object.entries(currentData.expressions ?? {})) {
    //     item.expressions[key] = value;
    // }

    // Set the overrides, as they might be used to transform this component into other components.
    item.overrides = currentData.overrides;

    // Create the field component class instance.
    const componentClassString = currentData?.component?.class;
    const componentClass = this.fieldComponentMap?.get(componentClassString);
    if (!componentClass) {
      throw new Error(`Could not find class for field component class string '${componentClassString}'.`);
    }
    item.component = new componentClass();

    const sourceDefaultsMap = this.kindNameDefaultsMap.get(FormComponentDefinitionKind);
    const targetDefaultsMap = sourceDefaultsMap?.get(componentClassString);

    // Create the model class instance.
    // If there is no model class, use the default if there is one.
    const modelClassDefaultName = targetDefaultsMap?.get(FieldModelDefinitionKind);
    const modelClassString = currentData?.model?.class ?? modelClassDefaultName;
    const modelClass = modelClassString ? this.fieldModelMap?.get(modelClassString) : null;
    if (modelClassString && !modelClass) {
      throw new Error(`Could not find class for field model class string '${modelClassString}'.`);
    }
    const model = modelClass ? new modelClass() : undefined;
    item.model = model;
    if (model) {
      this.setFieldClassName(currentData, 'model', modelClassString);
    }

    // Create the layout class instance.
    // If there is no layout class, use the default if there is one.
    const layoutClassDefaultName = targetDefaultsMap?.get(FieldLayoutDefinitionKind);
    const layoutClassString = currentData?.layout?.class ?? layoutClassDefaultName;
    const layoutClass = layoutClassString ? this.fieldLayoutMap?.get(layoutClassString) : null;
    if (layoutClassString && !layoutClass) {
      throw new Error(`Could not find class for field layout class string '${layoutClassString}'.`);
    }
    const layout = layoutClass ? new layoutClass() : undefined;
    item.layout = layout;
    if (layout) {
      this.setFieldClassName(currentData, 'layout', layoutClassString);
    }

    return item;
  }

  /**
   * Set the common field component config properties.
   * @param item Set the value of the named properties on this item.
   * @param config Get the value of the named properties from this config.
   */
  public sharedPopulateFieldComponentConfig(item: FieldComponentConfigFrame, config?: FieldComponentConfigFrame) {
    this.setPropOverride('readonly', item, config);
    this.setPropOverride('visible', item, config);
    this.setPropOverride('editMode', item, config);
    this.setPropOverride('label', item, config);
    this.setPropOverride('defaultComponentCssClasses', item, config);
    this.setPropOverride('hostCssClasses', item, config);
    this.setPropOverride('wrapperCssClasses', item, config);
    this.setPropOverride('disabled', item, config);
    this.setPropOverride('autofocus', item, config);
    this.setPropOverride('tooltip', item, config);
  }

  /**
   * Set the common field model config properties.
   * @param item Set the value of the named properties on this item.
   * @param config Get the value of the named properties from this config.
   */
  public sharedPopulateFieldModelConfig(item: FieldModelConfigFrame<unknown>, config?: FieldModelConfigFrame<unknown>) {
    this.setPropOverride('disableFormBinding', item, config);
    this.setPropOverride('value', item, config);
    this.setPropOverride('defaultValue', item, config);
    this.setPropOverride('validators', item, config);
    this.setPropOverride('wrapperCssClasses', item, config);
    this.setPropOverride('editCssClasses', item, config);
  }

  /**
   * Set the common field layout config properties.
   * @param item Set the value of the named properties on this item.
   * @param config Get the value of the named properties from this config.
   */
  public sharedPopulateFieldLayoutConfig(item: FieldLayoutConfigFrame, config?: FieldLayoutConfigFrame) {
    this.sharedPopulateFieldComponentConfig(item, config);
    this.setPropOverride('labelRequiredStr', item, config);
    this.setPropOverride('helpText', item, config);
    this.setPropOverride('cssClassesMap', item, config);
    this.setPropOverride('helpTextVisibleOnInit', item, config);
    this.setPropOverride('helpTextVisible', item, config);
  }

  /**
   * Set the property on target.
   * Retain the target property value if it is not undefined.
   * Use the value of the property from the first source with a non-undefined property of the same name.
   *
   * @param target Set the name property on the target.
   * @param name The property to set.
   * @param sources The sources that might have the name property.
   */
  public setPropDefault(
    name: string,
    target: { [x: string]: any },
    ...sources: ({ [x: string]: any } | null | undefined)[]
  ) {
    if (target === undefined || target === null) {
      throw new Error('Target provided to setPropDefault was undefined or null.');
    }
    if (name === undefined || name === null) {
      throw new Error('Property name provided to setPropDefault was undefined or null.');
    }

    const propValue = [target, ...sources].find(val => val?.[name] !== undefined)?.[name];
    if (propValue !== undefined) {
      target[name] = propValue;
    }
  }

  /**
   * Set the property on target.
   * Override the value of the property from the last source with a non-undefined property of the same name.
   * @param name The property to set.
   * @param target Set the name property on the target.
   * @param sources The sources that might have the name property.
   */
  public setPropOverride(
    name: string,
    target: { [x: string]: any },
    ...sources: ({ [x: string]: any } | null | undefined)[]
  ) {
    if (target === undefined || target === null) {
      throw new Error('Target provided to setPropOverride was undefined or null.');
    }
    if (name === undefined || name === null) {
      throw new Error('Property name provided to setPropOverride was undefined or null.');
    }

    const propValue = [target, ...sources].findLast(val => val?.[name] !== undefined)?.[name];
    if (propValue !== undefined) {
      target[name] = propValue;
    }
  }

  private setFieldClassName(
    currentData: FormComponentDefinitionFrame,
    fieldTypeName: 'model' | 'layout',
    className: string | null | undefined
  ) {
    if (currentData === undefined || currentData === null || className === undefined || className === null) {
      return;
    }
    if (currentData[fieldTypeName] === undefined || currentData[fieldTypeName] === null) {
      currentData[fieldTypeName] = { class: className };
      return;
    } else if (currentData[fieldTypeName]?.class === undefined || currentData[fieldTypeName]?.class === null) {
      currentData[fieldTypeName].class = className;
    }
  }
}

export class FormPathHelper {
  protected logName = 'FormPathHelper';

  protected logger: ILogger;
  private visitor: FormConfigVisitorOutline;

  private _formPath: LineagePaths;

  constructor(logger: ILogger, visitor: FormConfigVisitorOutline) {
    this.logger = logger;
    this.visitor = visitor;

    this._formPath = buildLineagePaths();
  }

  /**
     * Get the current form paths.
     */
    get formPath(): LineagePaths {
        // Return a copy so the current form paths cannot be changed.
        return {
            angularComponents: [...this._formPath.angularComponents],
            angularComponentsJsonPointer: this._formPath.angularComponentsJsonPointer?.toString(),
            dataModel: [...this._formPath.dataModel],
            formConfig: [...this._formPath.formConfig],
        };
    }

    /**
     * Get the current model name.
     */
    get modelName(): string | null {
        if (this._formPath.dataModel.length > 0) {
            return this._formPath.dataModel[this._formPath.dataModel.length - 1]?.toString();
        }
        return null;
  }

  public reset() {
    this._formPath = buildLineagePaths();
  }

  /**
   * Call accept on the provided item and set the current path with the given suffix.
   * Set the current path to the previous value after the accept method is done.
   * @param item The item to visit.
   * @param more The lineage paths to add to the end of the current paths.
   */
  public acceptFormPath(item: CanVisit, more?: LineagePathsPartial): void {
    if (!item) {
      this.logger?.warn?.(`${this.logName}: acceptFormPath requires an item: ${JSON.stringify(item)}`);
      return;
    }
    // Copy the original lineage paths so they can be restored.
    const original = buildLineagePaths(this._formPath);
    try {
      this._formPath = buildLineagePaths(original, more);
      item.accept(this.visitor);
    } catch (error) {
      throw error;
    } finally {
      this._formPath = original;
    }
  }

  /**
   * Call accept on the properties of the form component definition outline that can be visited.
   * @param item The form component definition outline.
   */
  public acceptFormComponentDefinition(item: FormComponentDefinitionOutline): void {
    this.acceptFormPath(item.component, { formConfig: ['component'] });
    if (item.model) {
      this.acceptFormPath(item.model, { formConfig: ['model'] });
    }
    if (item.layout) {
      this.acceptFormPath(item.layout, { formConfig: ['layout'] });
    }
  }

  public lineagePathsForFormConfigComponentDefinition(
    item: FormComponentDefinitionOutline,
    index: number
  ): LineagePathsPartial {
    return {
      formConfig: ['componentDefinitions', index.toString()],
      dataModel: this.getFormPathDataModel(item),
      angularComponents: this.getFormPathAngularComponents(item),
    };
  }

  public lineagePathsForGroupFieldComponentDefinition(
    item: FormComponentDefinitionOutline,
    index: number
  ): LineagePathsPartial {
    return {
      formConfig: ['config', 'componentDefinitions', index.toString()],
      dataModel: this.getFormPathDataModel(item),
      angularComponents: this.getFormPathAngularComponents(item),
    };
  }

  public lineagePathsForTabFieldComponentDefinition(
    item: FormComponentDefinitionOutline,
    index: number
  ): LineagePathsPartial {
    return {
      formConfig: ['config', 'tabs', index.toString()],
      dataModel: this.getFormPathDataModel(item),
      angularComponents: this.getFormPathAngularComponents(item),
    };
  }

  public lineagePathsForTabContentFieldComponentDefinition(
    item: FormComponentDefinitionOutline,
    index: number
  ): LineagePathsPartial {
    return {
      formConfig: ['config', 'componentDefinitions', index.toString()],
      dataModel: this.getFormPathDataModel(item),
      angularComponents: this.getFormPathAngularComponents(item),
    };
  }

  public lineagePathsForRepeatableFieldComponentDefinition(item: FormComponentDefinitionOutline): LineagePathsPartial {
    return {
      formConfig: ['config', 'elementTemplate'],
      dataModel: this.getFormPathDataModel(item),
      angularComponents: this.getFormPathAngularComponents(item),
    };
  }

  public lineagePathsForReusableFieldComponentDefinition(
    item: FormComponentDefinitionOutline,
    index: number
  ): LineagePathsPartial {
    return {
      formConfig: ['config', 'componentDefinitions', index.toString()],
      dataModel: this.getFormPathDataModel(item),
      angularComponents: this.getFormPathAngularComponents(item),
    };
  }

  private getFormPathDataModel(item: FormComponentDefinitionOutline): string[] {
    const itemName = item?.name ?? '';

    // NOTE: The repeatable elementTemplate should not be part of the data model path.
    // This is done by also checking the name - it has a model, but it must have a 'falsy' name.

    // TODO: does this need to cater for components that have no model but need the model data, like content component?

    const dataModel = [];
    if (itemName && item.model !== undefined && item.model !== null) {
      dataModel.push(itemName);
    }

    return dataModel;
  }

  private getFormPathAngularComponents(item: FormComponentDefinitionOutline) {
    const itemName = item?.name ?? '';
    const angularComponents: LineagePath = [];
    // TODO: don't include the top-level form config name
    if (itemName) {
      angularComponents.push(itemName);
    }
    return angularComponents;
  }
}
