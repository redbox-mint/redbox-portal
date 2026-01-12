/**
 * Reusable Form Definitions Config Interface and Default Values
 * Auto-generated from config/reusableFormDefinitions.js
 * 
 * Re-usable, server-side only, component templates.
 * Used as defaults for properties not defined.
 * The 'name' property for these templates can be used as the value
 * in the 'templateName' property in form component definitions.
 */

export interface ReusableFormComponentConfig {
    type?: string;
    componentDefinitions?: ReusableFormDefinition[];
    [key: string]: unknown;
}

export interface ReusableFormComponent {
    class: string;
    config: ReusableFormComponentConfig;
}

export interface ReusableFormDefinition {
    name: string;
    component: ReusableFormComponent;
    overrides?: {
        reusableFormName?: string;
        replaceName?: string;
    };
}

export interface ReusableFormDefinitionsConfig {
    [templateName: string]: ReusableFormDefinition[];
}

export const reusableFormDefinitions: ReusableFormDefinitionsConfig = {
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
    // Definition of a reusable form config that refers to another reusable form config
    "standard-people-fields": [
        {
            // This element in the array is replaced by the 3 items in the "standard-contributor-field" array
            overrides: { reusableFormName: "standard-contributor-field" },
            name: "",
            component: {
                class: "ReusableComponent",
                config: {
                    componentDefinitions: [
                        {
                            // For the item in the array that matches the match name, change the name to replace
                            overrides: { replaceName: "contributor_ci_name" },
                            name: "name",
                            component: { class: "ContentComponent", config: {} },
                        },
                        {
                            // Refer to the item without changing it
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
    // The standard project info fields
    "standard-project-info-fields": [],
};
