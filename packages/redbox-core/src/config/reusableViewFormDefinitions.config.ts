import {ReusableFormDefinitions} from "@researchdatabox/sails-ng-common";

export const reusableViewFormDefinitions: ReusableFormDefinitions = {
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
        config: {template: "<span data-value=\"{{content.value}}\">{{#with @root}}{{t content.label}}{{/with}}</span>"}
      },
    },
  ],
  "view-template-leaf-option-multi": [
    {
      name: "view_template_leaf_option_multi",
      component: {
        class: "ContentComponent",
        config: {template: "<ul>{{#each content}}<li data-value=\"{{this.value}}\">{{#with @root}}{{t ../label}}{{/with}}</li>{{/each}}</ul>"}
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
  "view-template-leaf-data-location": [
    {
      name: "view_template_leaf_data_location",
      component: {
        class: "ContentComponent",
        config: {
          template: "{{#if [[valueExpr]]}}<div class=\"table-responsive mt-2\"><table class=\"table table-bordered table-striped table-hover mb-0 rb-view-data-location\"><thead><tr><th width=\"15%\">[[typeHeaderHtml]]</th><th width=\"40%\">[[locationHeaderHtml]]</th>[[notesHeaderCellHtml]][[iscHeaderCellHtml]]</tr></thead><tbody>{{#each [[valueExpr]]}}<tr><td>{{default this.typeLabel this.type}}</td><td>{{#if (or (eq this.type \"url\") (eq this.type \"attachment\"))}}<a href=\"{{default this.url this.location}}\" target=\"_blank\" rel=\"noopener noreferrer\">{{default this.name this.location}}</a>{{else}}<span>{{default this.name this.location}}</span>{{/if}}</td>[[notesCellHtml]][[iscCellHtml]]</tr>{{/each}}</tbody></table></div>{{/if}}"
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
