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
  // /**
  //  * The standard people fields for e.g. ci, data manager, supervisor, contributor.
  //  */
  // "standard-contributor-field": [
  //   {
  //     name: "name",
  //     component: {class: "SimpleInputComponent", config: {type: "text"}}
  //   },
  //   {
  //     name: "email",
  //     component: {class: "SimpleInputComponent", config: {type: "text"}}
  //   },
  //   {
  //     name: "orcid",
  //     component: {
  //       class: "GroupComponent",
  //       config: {
  //         componentDefinitions: [
  //           {
  //             name: "example1",
  //             component: {class: "SimpleInputComponent", config: {type: "text"}},
  //           }
  //         ]
  //       }
  //     }
  //   },
  // ],
  // /**
  //  * Reusable form definition used by tests.
  //  * TODO: change out this in tests for another definition that is used.
  //  */
  // "standard-people-fields": [
  //   {
  //     // this element in the array is replaced by the 3 items in the "standard-contributor-field" array
  //     overrides: {reusableFormName: "standard-contributor-field"},
  //     // Name does not matter, this array element will be replaced
  //     name: "",
  //     component: {
  //       class: "ReusableComponent",
  //       config: {
  //         componentDefinitions: [
  //           {
  //             // for the item in the array that matches the match name, change the name to replace
  //             // merge all other properties, preferring the definitions here
  //             overrides: {replaceName: "contributor_ci_name"},
  //             name: "name",
  //             component: {class: "SimpleInputComponent", config: {type: "tel"}},
  //           },
  //           {
  //             // refer to the item without changing it
  //             // this is useful for referring to an item that has nested components that will be changed
  //             name: "orcid",
  //             component: {
  //               class: "GroupComponent",
  //               config: {
  //                 componentDefinitions: [
  //                   {
  //                     overrides: {replaceName: "orcid_nested_example1"},
  //                     name: "example1",
  //                     component: {class: "ContentComponent", config: {}},
  //                   }
  //                 ]
  //               }
  //             }
  //           }
  //           // the 'email' item in the reusable definition array is copied with no changes
  //         ]
  //       }
  //     },
  //   },
  //   {
  //     // this element is used as-is
  //     name: "contributor_data_manager",
  //     component: {class: "SimpleInputComponent", config: {type: "text"}}
  //   }
  // ],

};
