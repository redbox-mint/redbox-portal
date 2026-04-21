import {ReusableFormDefinitions} from "@researchdatabox/sails-ng-common";
import {buildRelatedObjectsFieldDefinition, reusableRelatedObjectsFormDefinitions} from "./reusableRelatedObjectsFormDefinition.config";
import {reusableViewFormDefinitions} from "./reusableViewFormDefinition.config";
import {reusableContributorFormDefinitions} from "./reusableContributorFormDefinition.config";

// Re-export the type for convenience
export {ReusableFormDefinitions};

// Provide convenience build methods.
export {buildRelatedObjectsFieldDefinition};

/**
 * Reusable Form Definitions Config Interface and Default Values
 *
 * Re-usable, server-side only, component templates.
 * Used as defaults for properties not defined.
 * The 'name' property for these templates can be used as the value
 * in the 'templateName' property in form component definitions.
 *
 * TODO: Think about how this could work if clients are allowed to define templates and store in db...
 */
export const reusableFormDefinitions: ReusableFormDefinitions = {
  ...reusableViewFormDefinitions,
  ...reusableContributorFormDefinitions,
  ...reusableRelatedObjectsFormDefinitions,

  /**
   * Question Tree components for single-answer input.
   */
  "questiontree-answer-one": [
    {
      name: "questiontree_answer_one",
      component: {class: "RadioInputComponent", config: {options: []}}
    }
  ],
  /**
   * Question Tree components for one or more-answer input.
   */
  "questiontree-answer-one-more": [
    {
      name: "questiontree_answer_one_more",
      component: {class: "CheckboxInputComponent", config: {options: []}}
    }
  ],
};
