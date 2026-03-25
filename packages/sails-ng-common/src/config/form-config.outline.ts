import { FormValidatorConfig, FormValidationGroups } from '../validation/form.model';
import { AvailableFormComponentDefinitionFrames, AvailableFormComponentDefinitionOutlines } from './dictionary.outline';
import { CanVisit } from './visitor/base.outline';
import { KeyValueStringNested, KeyValueStringProperty } from './shared.outline';
import { FormExpressionsConfigOutline } from './form-component.outline';
import { FormBehaviourConfigFrame } from './form-behaviour.outline';

/**
 * The top-level form config interface that provides typing for the object literal and schema.
 */
export interface FormConfigFrame {
  /**
   * optional form name, will be used to identify the form in the config
   */
  name: string;
  /**
   * the record type
   */
  type?: string;

  // -- DOM related config --

  /**
   * the dom element type to inject, e.g. div, span, etc. leave empty to use 'ng-container'
   */
  domElementType?: string;
  /**
   * optional form dom id property. When set, value will be injected into the overall dom node
   */
  domId?: string;
  /**
   * the optional css clases to be applied to the form dom node in view / read-only mode
   */
  viewCssClasses?: KeyValueStringProperty;
  /**
   * the optional css clases to be applied to the form dom node in edit mode
   */
  editCssClasses?: KeyValueStringProperty;
  /**
   * optional configuration to set in each component
   */
  defaultComponentConfig?: KeyValueStringNested;

  // -- validation-related config --

  /**
   * The validation groups to enable for the form.
   * The validation groups will be set as part of loading the form.
   * Default ["all"] if none specified.
   *
     * In the angular form:
     * - The available validation groups cannot change.
     * - The groups a validator belongs to cannot change.
     * - The currently enabled validation groups can change.
     *
     * TODO: It will be possible to change the enabled validation groups after the form has loaded.
     *       This is done by changing this property in the Form Component config.
     *       The 'enabledValidationGroups' property can be changed using component expressions.
     *
     * Use Cases for whether a validator is enabled or disabled in the angular form.
     *
     * Must change as the user is interacting with the form:
     *  - Enabled only when a component is visible (or hidden), and disabled otherwise.
     *  - Enabled based on the value in another component.
     *  - Enabled when a particular system integration / external state is activated or changed, and disabled otherwise.
     *
     *  Change based on state provided from the server that does not change in the angular form:
     *  - Disabled for a new form, but enabled for a saved form.
     *  - Enabled for some workflow stages, but disabled in other stages.
   */
  enabledValidationGroups?: string[];
  /**
   * The validators that are configured at the form level, usually because they involve two or more fields.
   */
  validators?: FormValidatorConfig[];

  /**
   * The validation groups available in this form.
   * These are the only validation group names that can be used in the validator config.
   */
  validationGroups?: FormValidationGroups;

  // -- Component-related config --

  /**
   * TODO: the default layout component
   */
  defaultLayoutComponent?: string;
  /**
   * the components of this form
   */
  componentDefinitions: AvailableFormComponentDefinitionFrames[];
  /**
   * debug: show the form JSON
   * Default false.
   */
  debugValue?: boolean;
  /**
   * A record with string keys and expression template values for defining expressions.
   */
  expressions?: FormExpressionsConfigOutline[];
  /**
   * Form-level automation rules introduced by the form behaviours v1 feature.
   *
   * Behaviours complement, rather than replace, component expressions:
   * expressions remain component-scoped and mostly synchronous, while behaviours
   * operate at form scope and may run async processor/action pipelines.
   */
  behaviours?: FormBehaviourConfigFrame[];
  /**
   * The list of fields that are attachments.
   * This is automatically populated by the form config visitor.
   */
  attachmentFields?: string[];
  // Optional resolved context variables (request scoped variables) available for this form response.
  contextVariables?: Record<string, unknown>;
}

export interface FormConfigOutline extends FormConfigFrame, CanVisit {
  componentDefinitions: AvailableFormComponentDefinitionOutlines[];
  expressions?: FormExpressionsConfigOutline[];
  behaviours?: FormBehaviourConfigFrame[];
}
