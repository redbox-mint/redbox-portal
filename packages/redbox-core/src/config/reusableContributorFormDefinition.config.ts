import {ReusableFormDefinitions} from "@researchdatabox/sails-ng-common";

export const reusableContributorFormDefinitions: ReusableFormDefinitions = {
  /**
   * Standard contributor form fields.
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
   * Standard contributor form fields in lookup-only mode.
   */
  "standard-contributor-fields-lookup-only": [
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
          requireSelection: true,
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
          readonly: true,
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
   * Standard contributor form fields with title for people sections.
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
   * Standard contributor form fields with title for people sections in lookup-only mode.
   */
  "standard-contributor-fields-with-title-lookup-only": [
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
      overrides: {reusableFormName: "standard-contributor-fields-lookup-only"},
      name: "standard_contributor_fields_lookup_only_reusable_with_title",
      component: {class: "ReusableComponent", config: {componentDefinitions: []}},
    },
  ],
  /**
   * Standard contributor form fields group.
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
   * Standard contributor form fields group in lookup-only mode.
   */
  "standard-contributor-fields-lookup-only-group": [
    {
      name: "standard_contributor_fields_lookup_only_group",
      layout: {class: "DefaultLayout", config: {label: "Standard Contributor"}},
      model: {class: "GroupModel", config: {}},
      component: {
        class: "GroupComponent",
        config: {
          hostCssClasses: "rb-form-contributor-inline",
          componentDefinitions: [
            {
              overrides: {reusableFormName: "standard-contributor-fields-lookup-only"},
              name: "standard_contributor_fields_lookup_only_reusable",
              component: {class: "ReusableComponent", config: {componentDefinitions: []}},
            },
          ],
        },
      },
    },
  ],
  /**
   * Standard contributor form fields group with title for people sections.
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
   * Standard contributor form fields group with title for people sections in lookup-only mode.
   */
  "standard-contributor-fields-with-title-lookup-only-group": [
    {
      name: "standard_contributor_fields_with_title_lookup_only_group",
      layout: {class: "DefaultLayout", config: {label: "Standard Contributor"}},
      model: {class: "GroupModel", config: {}},
      component: {
        class: "GroupComponent",
        config: {
          hostCssClasses: "rb-form-contributor-inline rb-form-contributor-inline--with-title",
          componentDefinitions: [
            {
              overrides: {reusableFormName: "standard-contributor-fields-with-title-lookup-only"},
              name: "standard_contributor_fields_with_title_lookup_only_reusable",
              component: {class: "ReusableComponent", config: {componentDefinitions: []}},
            },
          ],
        },
      },
    },
  ],
}
