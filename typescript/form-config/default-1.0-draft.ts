import { FormConfig } from "@researchdatabox/sails-ng-common";
import { Sails } from "sails";

declare let sails: Sails;

const formConfig: FormConfig = {
  name: "default-1.0-draft",
  type: "rdmp",
  debugValue: true,
  domElementType: "form",
  defaultComponentConfig: {
    defaultComponentCssClasses: "row",
  },
  editCssClasses: "redbox-form form",

  // The validation definitions is the combination of redbox core validator definitions and
  // the validator definitions from the client hook form config.
  // The validation functions are placeholder strings - they need to be replaced with the real js functions
  // on the client-side.
  // The validator definitions are available in 'sails.config.validators'.
  validatorDefinitions: [],

  // TODO: a way to create groups of validators
  // This is not implemented yet.
  // each group has a name, plus either which validators to 'exclude' or 'include', but not both.
  // validatorProfiles: {
  //   // all: All validators (exclude none).
  //   all: { exclude: [] },
  //   // minimumSave: The minimum set of validators that must pass to be able to save (create or update).
  //   minimumSave: { include: ["project_title"] },
  // },

  // Validators that operate on multiple fields.
  validators: [
    { name: "different-values", config: { controlNames: ["text_1_event", "text_2"] } },
  ],

  componentDefinitions: [
    {
      name: "text_1_event",
      model: {
        name: "text_1_for_the_form",
        class: "TextFieldModel",
        config: {
          value: "hello world!",
          defaultValue: "hello world!",
          validators: [
            { name: "required" },
          ],
        },
      },
      component: {
        class: "TextFieldComponent",
      },
    },
    {
      name: "text_2",
      layout: {
        class: "DefaultLayoutComponent",
        config: {
          label: "TextField with default wrapper defined",
          helpText: "This is a help text",
        },
      },
      model: {
        class: "TextFieldModel",
        config: {
          value: "hello world 2!",
          validators: [
            { name: "pattern", config: { pattern: /prefix.*/, description: "must start with prefix" } },
            { name: "minLength", message: "@validator-error-custom-text_2", config: { minLength: 3 } },
          ],
        },
      },
      component: {
        class: "TextFieldComponent",
      },
    },
    {
      // first group component
      name: "group_1_component",
      layout: {
        class: "DefaultLayoutComponent",
        config: {
          label: "GroupField label",
          helpText: "GroupField help",
        },
      },
      model: {
        name: "group_1_model",
        class: "GroupFieldModel",
        config: {
          defaultValue: {},
        },
      },
      component: {
        class: "GroupFieldComponent",
        config: {
          componentDefinitions: [
            {
              name: "text_3",
              layout: {
                class: "DefaultLayoutComponent",
                config: {
                  label: "TextField with default wrapper defined",
                  helpText: "This is a help text",
                },
              },
              model: {
                class: "TextFieldModel",
                config: {
                  value: "hello world 3!",
                },
              },
              component: {
                class: "TextFieldComponent",
              },
            },
            {
              name: "text_4",
              model: {
                class: "TextFieldModel",
                config: {
                  value: "hello world 4!",
                  defaultValue: "hello world 4!",
                },
              },
              component: {
                class: "TextFieldComponent",
              },
            },
            {
              // second group component, nested in first group component
              name: "group_2_component",
              layout: {
                class: "DefaultLayoutComponent",
                config: {
                  label: "GroupField 2 label",
                  helpText: "GroupField 2 help",
                },
              },
              model: {
                name: "group_2_model",
                class: "GroupFieldModel",
                config: {
                  defaultValue: {},
                },
              },
              component: {
                class: "GroupFieldComponent",
                config: {
                  componentDefinitions: [
                    {
                      name: "text_5",
                      layout: {
                        class: "DefaultLayoutComponent",
                        config: {
                          label: "TextField with default wrapper defined",
                          helpText: "This is a help text",
                        },
                      },
                      model: {
                        class: "TextFieldModel",
                        config: {
                          value: "hello world 5!",
                        },
                      },
                      component: {
                        class: "TextFieldComponent",
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    },
    {
      name: "validation_summary_1",
      model: { name: "validation_summary_2", class: "ValidationSummaryFieldModel" },
      component: { class: "ValidationSummaryFieldComponent" },
    },
  ],
};
module.exports = formConfig;
