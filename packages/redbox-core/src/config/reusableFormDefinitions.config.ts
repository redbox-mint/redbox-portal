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
    "view-template-leaf-plain": [
        {
            name: "view_template_leaf_plain",
            component: { class: "ContentComponent", config: { template: "<span>{{content}}</span>" } },
        },
    ],
    "view-template-leaf-date": [
        {
            name: "view_template_leaf_date",
            component: { class: "ContentComponent", config: { template: "<span data-value=\"{{content}}\">{{formatDate content}}</span>" } },
        },
    ],
    "view-template-leaf-option-empty": [
        {
            name: "view_template_leaf_option_empty",
            component: { class: "ContentComponent", config: { template: "<span></span>" } },
        },
    ],
    "view-template-leaf-option-single": [
        {
            name: "view_template_leaf_option_single",
            component: { class: "ContentComponent", config: { template: "<span data-value=\"{{content.value}}\">{{content.label}}</span>" } },
        },
    ],
    "view-template-leaf-option-multi": [
        {
            name: "view_template_leaf_option_multi",
            component: { class: "ContentComponent", config: { template: "<ul>{{#each content}}<li data-value=\"{{this.value}}\">{{this.label}}</li>{{/each}}</ul>" } },
        },
    ],
    "view-template-leaf-rich-text": [
        {
            name: "view_template_leaf_rich_text",
            component: { class: "ContentComponent", config: { template: "{{{markdownToHtml content outputFormat}}}" } },
        },
    ],
    "view-template-leaf-file-upload": [
        {
            name: "view_template_leaf_file_upload",
            component: {
                class: "ContentComponent",
                config: {
                    template: "<ul class=\"rb-view-file-upload\">{{#each [[valueExpr]]}}<li>{{#if this.url}}<a href=\"{{this.url}}\" target=\"_blank\" rel=\"noopener\">{{default this.name this.fileId}}</a>{{else}}{{default this.name this.fileId}}{{/if}}{{#if this.notes}}<div class=\"text-muted\"><small>{{this.notes}}</small></div>{{/if}}</li>{{/each}}</ul>"
                }
            },
        },
    ],
    "view-template-group-container": [
        {
            name: "view_template_group_container",
            component: { class: "ContentComponent", config: { template: "<div class=\"rb-view-group\">[[rowsHtml]]</div>" } },
        },
    ],
    "view-template-group-row-with-label": [
        {
            name: "view_template_group_row_with_label",
            component: { class: "ContentComponent", config: { template: "<div class=\"rb-view-row\"><div class=\"rb-view-label\">[[labelHtml]]</div><div class=\"rb-view-value\">[[valueHtml]]</div></div>" } },
        },
    ],
    "view-template-group-row-no-label": [
        {
            name: "view_template_group_row_no_label",
            component: { class: "ContentComponent", config: { template: "<div class=\"rb-view-row\"><div class=\"rb-view-value\">[[valueHtml]]</div></div>" } },
        },
    ],
    "view-template-repeatable-table": [
        {
            name: "view_template_repeatable_table",
            component: { class: "ContentComponent", config: { template: "{{#if [[rootExpr]]}}<div class=\"rb-view-repeatable rb-view-repeatable-table-wrapper\"><table class=\"table table-striped table-sm rb-view-repeatable-table\"><thead><tr>[[headersHtml]]</tr></thead><tbody>{{#each [[rootExpr]]}}<tr>[[cellsHtml]]</tr>{{/each}}</tbody></table></div>{{/if}}" } },
        },
    ],
    "view-template-repeatable-list": [
        {
            name: "view_template_repeatable_list",
            component: { class: "ContentComponent", config: { template: "{{#if [[rootExpr]]}}<div class=\"rb-view-repeatable rb-view-repeatable-list\">{{#each [[rootExpr]]}}<div class=\"[[itemClass]]\">[[itemBodyHtml]]</div>{{/each}}</div>{{/if}}" } },
        },
    ],

    "standard-contributor-fields": [
        {
            name: "name",
            component: {
                class: "SimpleInputComponent",
                config: {type: "text", hostCssClasses: "flex-grow-1 d-block", wrapperCssClasses: "rb-form-contributor-inline__field"}
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
                config: {type: "text", hostCssClasses: "flex-grow-1 d-block", wrapperCssClasses: "rb-form-contributor-inline__field"}
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
                config: {type: "text", hostCssClasses: "flex-grow-1 d-block", wrapperCssClasses: "rb-form-contributor-inline__field"}
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
                    hostCssClasses: "rb-form-contributor-inline",
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
