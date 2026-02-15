/**
 * Reusable Form Definitions Config Interface and Default Values
 *
 * Re-usable, server-side only, component templates.
 * Used as defaults for properties not defined.
 * The 'name' property for these templates can be used as the value
 * in the 'templateName' property in form component definitions.
 *
 * Think about how this could work if clients are allowed to define templates and store in db...
 */

import { ReusableFormDefinitions } from "@researchdatabox/sails-ng-common";

// Re-export the type for convenience
export { ReusableFormDefinitions };

export const reusableFormDefinitions: ReusableFormDefinitions = {

    "standard-contributor-fields": [
        {
            name: "name",
            component: {
                class: "SimpleInputComponent",
                config: {type: "text", hostCssClasses: "flex-grow-1 d-block", wrapperCssClasses: "col-md-4 mb-3"}
            },
            model: {class: "SimpleInputModel", config: {}},
            layout: {
                class: "InlineLayout",
                config: {label: "Name", hostCssClasses: "d-flex align-items-center gap-2"}
            },
        },
        {
            name: "email",
            component: {
                class: "SimpleInputComponent",
                config: {type: "text", hostCssClasses: "flex-grow-1 d-block", wrapperCssClasses: "col-md-4 mb-3"}
            },
            model: {class: "SimpleInputModel", config: {validators: [{class: "email"}]}},
            layout: {
                class: "InlineLayout",
                config: {label: "Email", hostCssClasses: "d-flex align-items-center gap-2"}
            },
        },
        {
            name: "orcid",
            component: {
                class: "SimpleInputComponent",
                config: {type: "text", hostCssClasses: "flex-grow-1 d-block", wrapperCssClasses: "col-md-4 mb-3"}
            },
            model: {class: "SimpleInputModel", config: {validators: [{class: "orcid"}]}},
            layout: {
                class: "InlineLayout",
                config: {label: "ORCID", hostCssClasses: "d-flex align-items-center gap-2"}
            },
        },
    ],

    "standard-contributor-fields-group": [
        {
            name: "standard_contributor_fields_group",
            layout: {class: "DefaultLayout", config: {label: "Standard Contributor"}},
            model: {class: "GroupModel", config: {}},
            component: {
                class: "GroupComponent",
                config: {
                    hostCssClasses: "row g-3",
                    componentDefinitions: [
                        {
                            overrides: {reusableFormName: "standard-contributor-fields"},
                            name: "standard_contributor_fields_reusable",
                            component: {class: "ReusableComponent", config: {componentDefinitions: []}},
                        },
                    ],
                },
            },
        },
    ],

    // definition of a reusable form config - standard component definitions
    // The standard people field
    "standard-contributor-field": [
        {
            name: "name",
            component: { class: "SimpleInputComponent", config: { type: "text" } }
        },
        {
            name: "email",
            component: { class: "SimpleInputComponent", config: { type: "text" } }
        },
        {
            name: "orcid",
            component: {
                class: "GroupComponent",
                config: {
                    componentDefinitions: [
                        {
                            name: "example1",
                            component: { class: "SimpleInputComponent", config: { type: "text" } },
                        }
                    ]
                }
            }
        },
    ],
    // TODO: The standard people fields - ci, data manager, supervisor, contributor.
    // definition of a reusable form config that refers to another reusable form config
    // the component definition can be either a standard component def or the 'reusableName' format
    "standard-people-fields": [
        {
            // this element in the array is replaced by the 3 items in the "standard-contributor-field" array
            overrides: { reusableFormName: "standard-contributor-field" },
            // Name does not matter, this array element will be replaced
            name: "",
            component: {
                class: "ReusableComponent",
                config: {
                    componentDefinitions: [
                        {
                            // for the item in the array that matches the match name, change the name to replace
                            // merge all other properties, preferring the definitions here
                            overrides: { replaceName: "contributor_ci_name" },
                            name: "name",
                            component: { class: "ContentComponent", config: {} },
                        },
                        {
                            // refer to the item without changing it
                            // this is useful for referring to an item that has nested components that will be changed
                            name: "orcid",
                            component: {
                                class: "GroupComponent",
                                config: {
                                    componentDefinitions: [
                                        {
                                            overrides: { replaceName: "orcid_nested_example1" },
                                            name: "example1",
                                            component: { class: "ContentComponent", config: {} },
                                        }
                                    ]
                                }
                            }
                        }
                        // the 'email' item in the reusable definition array is copied with no changes
                    ]
                }
            },
        },
        {
            // this element is used as-is
            name: "contributor_data_manager",
            component: { class: "SimpleInputComponent", config: { type: "text" } }
        }
    ],
    // TODO: The standard project info fields: title, description, keywords, SEO codes, FOR codes
    "standard-project-info-fields": [],
};
