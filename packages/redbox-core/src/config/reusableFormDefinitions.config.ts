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

import {ReusableFormDefinitions} from "@researchdatabox/sails-ng-common";

// Re-export the type for convenience
export {ReusableFormDefinitions};

export const reusableFormDefinitions: ReusableFormDefinitions = {
  "view-template-leaf-plain": [
    {
      name: "view_template_leaf_plain",
      component: {class: "ContentComponent", config: {template: "<span>{{content}}</span>"}},
    },
  ],
  "view-template-leaf-date": [
    {
      name: "view_template_leaf_date",
      component: {
        class: "ContentComponent",
        config: {template: "<span data-value=\"{{content}}\">{{formatDate content}}</span>"}
      },
    },
  ],
  "view-template-leaf-option-empty": [
    {
      name: "view_template_leaf_option_empty",
      component: {class: "ContentComponent", config: {template: "<span></span>"}},
    },
  ],
  "view-template-leaf-option-single": [
    {
      name: "view_template_leaf_option_single",
      component: {
        class: "ContentComponent",
        config: {template: "<span data-value=\"{{content.value}}\">{{content.label}}</span>"}
      },
    },
  ],
  "view-template-leaf-option-multi": [
    {
      name: "view_template_leaf_option_multi",
      component: {
        class: "ContentComponent",
        config: {template: "<ul>{{#each content}}<li data-value=\"{{this.value}}\">{{this.label}}</li>{{/each}}</ul>"}
      },
    },
  ],
  "view-template-leaf-rich-text": [
    {
      name: "view_template_leaf_rich_text",
      component: {class: "ContentComponent", config: {template: "{{{markdownToHtml content outputFormat}}}"}},
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
      component: {class: "ContentComponent", config: {template: "<div class=\"rb-view-group\">[[rowsHtml]]</div>"}},
    },
  ],
  "view-template-group-row-with-label": [
    {
      name: "view_template_group_row_with_label",
      component: {
        class: "ContentComponent",
        config: {template: "<div class=\"rb-view-row\"><div class=\"rb-view-label\">[[labelHtml]]</div><div class=\"rb-view-value\">[[valueHtml]]</div></div>"}
      },
    },
  ],
  "view-template-group-row-no-label": [
    {
      name: "view_template_group_row_no_label",
      component: {
        class: "ContentComponent",
        config: {template: "<div class=\"rb-view-row\"><div class=\"rb-view-value\">[[valueHtml]]</div></div>"}
      },
    },
  ],
  "view-template-repeatable-table": [
    {
      name: "view_template_repeatable_table",
      component: {
        class: "ContentComponent",
        config: {template: "{{#if [[rootExpr]]}}<div class=\"rb-view-repeatable rb-view-repeatable-table-wrapper\"><table class=\"table table-striped table-sm rb-view-repeatable-table\"><thead><tr>[[headersHtml]]</tr></thead><tbody>{{#each [[rootExpr]]}}<tr>[[cellsHtml]]</tr>{{/each}}</tbody></table></div>{{/if}}"}
      },
    },
  ],
  "view-template-repeatable-list": [
    {
      name: "view_template_repeatable_list",
      component: {
        class: "ContentComponent",
        config: {template: "{{#if [[rootExpr]]}}<div class=\"rb-view-repeatable rb-view-repeatable-list\">{{#each [[rootExpr]]}}<div class=\"[[itemClass]]\">[[itemBodyHtml]]</div>{{/each}}</div>{{/if}}"}
      },
    },
  ],
  /**
   * Standard contributor form fields for the v4 ContributorField.
   */
  "standard-contributor-fields": [
    {
      name: "name",
      component: {
        class: "TypeaheadInputComponent",
        config: {
          hostCssClasses: "flex-grow-1 d-block",
          wrapperCssClasses: "rb-form-contributor-inline__field",
          vocabRef: 'party',
          sourceType: 'namedQuery',
          queryId: 'party',
          labelField: 'metadata.fullName',
          valueField: 'oid',
          placeholder: 'Start typing a party name...',
          minChars: 1,
          debounceMs: 250,
          maxResults: 25,
          valueMode: 'value',
        }
      },
      model: {class: "TypeaheadInputModel", config: {}},
      layout: {
        class: "InlineLayout",
        config: {label: "Name", hostCssClasses: "d-flex align-items-center gap-2"}
      },
    },
    {
      name: "email",
      component: {
        class: "SimpleInputComponent",
        config: {
          type: "text",
          hostCssClasses: "flex-grow-1 d-block",
          wrapperCssClasses: "rb-form-contributor-inline__field",
          onItemSelect: { rawPath: 'metadata.email' },
        }
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
        config: {
          type: "text",
          hostCssClasses: "flex-grow-1 d-block",
          wrapperCssClasses: "rb-form-contributor-inline__field",
          onItemSelect: { rawPath: 'metadata.orcid' },
        }
      },
      model: {class: "SimpleInputModel", config: {validators: [{class: "orcid"}]}},
      layout: {
        class: "InlineLayout",
        config: {label: "ORCID", hostCssClasses: "d-flex align-items-center gap-2"}
      },
    },
  ],
  /**
   * Standard contributor form fields with title for JCU people sections.
   */
  "standard-contributor-fields-with-title": [
    {
      name: "title",
      component: {
        class: "SimpleInputComponent",
        config: {
          type: "text",
          hostCssClasses: "d-block",
          wrapperCssClasses: "rb-form-contributor-inline__field rb-form-contributor-inline__field--title",
          onItemSelect: { rawPath: 'metadata.title' },
        }
      },
      model: {class: "SimpleInputModel", config: {}},
      layout: {
        class: "InlineLayout",
        config: {label: "Title", hostCssClasses: "d-flex align-items-center gap-2"}
      },
    },
    {
      overrides: {reusableFormName: "standard-contributor-fields"},
      name: "standard_contributor_fields_reusable_with_title",
      component: {class: "ReusableComponent", config: {componentDefinitions: []}},
    },
  ],
  /**
   * Standard contributor form fields group to match the v4 ContributorField.
   */
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
  /**
   * Standard contributor form fields group with title for JCU people sections.
   */
  "standard-contributor-fields-with-title-group": [
    {
      name: "standard_contributor_fields_with_title_group",
      layout: {class: "DefaultLayout", config: {label: "Standard Contributor"}},
      model: {class: "GroupModel", config: {}},
      component: {
        class: "GroupComponent",
        config: {
          hostCssClasses: "rb-form-contributor-inline rb-form-contributor-inline--with-title",
          componentDefinitions: [
            {
              overrides: {reusableFormName: "standard-contributor-fields-with-title"},
              name: "standard_contributor_fields_with_title_reusable",
              component: {class: "ReusableComponent", config: {componentDefinitions: []}},
            },
          ],
        },
      },
    },
  ],
  /**
   * The standard people fields for e.g. ci, data manager, supervisor, contributor.
   */
  "standard-contributor-field": [
    {
      name: "name",
      component: {class: "SimpleInputComponent", config: {type: "text"}}
    },
    {
      name: "email",
      component: {class: "SimpleInputComponent", config: {type: "text"}}
    },
    {
      name: "orcid",
      component: {
        class: "GroupComponent",
        config: {
          componentDefinitions: [
            {
              name: "example1",
              component: {class: "SimpleInputComponent", config: {type: "text"}},
            }
          ]
        }
      }
    },
  ],
  /**
   * Reusable form definition used by tests.
   * TODO: change out this in tests for another definition that is used.
   */
  "standard-people-fields": [
    {
      // this element in the array is replaced by the 3 items in the "standard-contributor-field" array
      overrides: {reusableFormName: "standard-contributor-field"},
      // Name does not matter, this array element will be replaced
      name: "",
      component: {
        class: "ReusableComponent",
        config: {
          componentDefinitions: [
            {
              // for the item in the array that matches the match name, change the name to replace
              // merge all other properties, preferring the definitions here
              overrides: {replaceName: "contributor_ci_name"},
              name: "name",
              component: {class: "SimpleInputComponent", config: {type: "tel"}},
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
                      overrides: {replaceName: "orcid_nested_example1"},
                      name: "example1",
                      component: {class: "ContentComponent", config: {}},
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
      component: {class: "SimpleInputComponent", config: {type: "text"}}
    }
  ],

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

  /**
   * Generic metadata display for the "generated-view-only" form.
   *
   * Renders all keys and values from the record metadata supplied as the content payload
   * definition list. Value rendering is delegated to the shared `renderMetadataValue`
   * Handlebars helper so nested objects and arrays are formatted consistently.
   */
  "generated-view-only-metadata-display": [
    {
      name: "generated_view_only_metadata_display",
      component: {
        class: "ContentComponent",
        config: {
          template: `<dl class="rb-view-metadata">
{{#each content}}
  <dt class="rb-view-metadata__key">{{@key}}</dt>
  <dd class="rb-view-metadata__value">
    {{{renderMetadataValue this}}}
  </dd>
{{/each}}
</dl>`,
        },
      },
    },
  ],
};
