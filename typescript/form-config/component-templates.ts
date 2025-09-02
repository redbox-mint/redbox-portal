import {FormComponentDefinition, FormComponentDefinitionTemplate} from "@researchdatabox/sails-ng-common";

/**
 * Re-usable, server-side only, component templates.
 * Used as defaults for properties not defined.
 *
 * The 'name' property for these templates can be used as the value
 * in the 'templateName' property in form component definitions.
 *
 * Think about how this could work if clients are allowed to define templates and store in db...
 */
const componentTemplates: { [key: string]: (FormComponentDefinition | FormComponentDefinitionTemplate)[] } = {
    // The standard project info fields: title, description, keywords, SEO codes, FOR codes
    "standard-project-info-fields": [],
    // The standard people fields - ci, data manager, supervisor, contributor.
    "standard-people-fields": [
        {
            templateName: "standard-contributor-field",
            componentDefinitions: [
                {
                    componentName: "contributor",
                    overrideName: "contributor_ci",
                }
            ],
            name: "contributor_ci",
            component: {class: "SimpleInputComponent", config: {}}
        },
        {
            name: "contributor_data_manager",
            component: {class: "SimpleInputComponent", config: {}}
        }
    ],
    "standard-contributor-field": [
        {
            name: "contributor",
            component: {
                class: "",
                config: {}
            }
        },
    ]
};
module.exports = componentTemplates;