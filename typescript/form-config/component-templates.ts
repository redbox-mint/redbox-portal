import {FormComponentDefinition} from "@researchdatabox/sails-ng-common";

/**
 * Re-usable, server-side only, component templates.
 * Used as defaults for properties not defined.
 *
 * The 'name' property for these templates can be used as the value
 * in the 'templateName' property in form component definitions.
 */
const componentTemplates: FormComponentDefinition[] = [
    {
        name: "",
        component: {

        }
    }
];
module.exports = componentTemplates;