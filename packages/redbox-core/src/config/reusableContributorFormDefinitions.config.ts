import {ReusableFormDefinitions} from "@researchdatabox/sails-ng-common";

export const reusableContributorFormDefinitions: ReusableFormDefinitions = {
  /**
   * Standard contributor field for title.
   */
  "standard-contributor-field-title": [
    {
      name: "title",
      component: {
        class: "SimpleInputComponent",
        config: {
          type: "text",
          hostCssClasses: "d-block",
          wrapperCssClasses: "rb-form-contributor-inline__field rb-form-contributor-inline__field--title",
          onItemSelect: {rawPath: 'metadata.title'},
        }
      },
      model: {class: "SimpleInputModel", config: {}},
      layout: {
        class: "InlineLayout",
        config: {label: "Title", hostCssClasses: "d-flex align-items-center gap-2"}
      },
    }
  ],
  /**
   * Standard contributor field for name, that has typeahead and allows entering freeform text.
   */
  "standard-contributor-field-name": [
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
          valueField: 'metadata.fullName',
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
    }
  ],
  /**
   * Standard contributor field for email.
   */
  "standard-contributor-field-email": [
    {
      name: "email",
      component: {
        class: "SimpleInputComponent",
        config: {
          type: "text",
          hostCssClasses: "flex-grow-1 d-block",
          wrapperCssClasses: "rb-form-contributor-inline__field",
          onItemSelect: {rawPath: 'metadata.email'},
        }
      },
      model: {class: "SimpleInputModel", config: {validators: [{class: "email"}]}},
      layout: {
        class: "InlineLayout",
        config: {label: "Email", hostCssClasses: "d-flex align-items-center gap-2"}
      },
    },
  ],
  /**
   * Standard contributor field for ORCID.
   */
  "standard-contributor-field-orcid": [
    {
      name: "orcid",
      component: {
        class: "SimpleInputComponent",
        config: {
          type: "text",
          hostCssClasses: "flex-grow-1 d-block",
          wrapperCssClasses: "rb-form-contributor-inline__field",
          onItemSelect: {rawPath: 'metadata.orcid'},
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
   * Standard contributor form fields.
   */
  "standard-contributor-fields": [
    {
      overrides: {reusableFormName: "standard-contributor-field-name"},
      name: "standard_contributor_field_name",
      component: {class: "ReusableComponent", config: {componentDefinitions: []}},
    },
    {
      overrides: {reusableFormName: "standard-contributor-field-email"},
      name: "standard_contributor_field_email",
      component: {class: "ReusableComponent", config: {componentDefinitions: []}},
    },
    {
      overrides: {reusableFormName: "standard-contributor-field-orcid"},
      name: "standard_contributor_field_orcid",
      component: {class: "ReusableComponent", config: {componentDefinitions: []}},
    },
  ],
  /**
   * Standard contributor form fields in lookup-only mode.
   */
  "standard-contributor-fields-lookup-only": [
    {
      overrides: {reusableFormName: "standard-contributor-field-name"},
      name: "standard_contributor_field_name",
      component: {
        class: "ReusableComponent", config: {
          componentDefinitions: [
            {
              name: "name", component: {class: "TypeaheadInputComponent", config: {requireSelection: true}}
            }
          ]
        }
      },
    },
    {
      overrides: {reusableFormName: "standard-contributor-field-email"},
      name: "standard_contributor_field_email",
      component: {
        class: "ReusableComponent", config: {
          componentDefinitions: [
            {
              name: "email", component: {class: "SimpleInputComponent", config: {readonly: true}}
            }
          ]
        }
      },
    },
    {
      overrides: {reusableFormName: "standard-contributor-field-orcid"},
      name: "standard_contributor_field_orcid",
      component: {class: "ReusableComponent", config: {componentDefinitions: []}},
    },
  ],
  /**
   * Standard contributor form fields with title for people sections.
   */
  "standard-contributor-fields-with-title": [
    {
      overrides: {reusableFormName: "standard-contributor-field-title"},
      name: "standard_contributor_field_title",
      component: {class: "ReusableComponent", config: {componentDefinitions: []}},
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
      overrides: {reusableFormName: "standard-contributor-field-title"},
      name: "standard_contributor_field_title",
      component: {class: "ReusableComponent", config: {componentDefinitions: []}},
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
  /**
   * Contributor DMP permissions repeatable.
   * Consuming configs should override syncSources and add expressions.
   */
  "contributor-dmp-permissions": [
    {
      name: "contributor_dmp_permissions_repeatable",
      component: {
        class: "RepeatableComponent",
        config: {
          addButtonShow: true,
          allowZeroRows: true,
          hideWhenZeroRows: false,
          syncSources: [
            {
              fieldName: "",
              blankCheckFields: ["name", "email", "orcid", "username"],
              defaultTemplate: {username: null, role: "View&Edit"}
            },
            {
              fieldName: "",
              blankCheckFields: ["name", "email", "orcid", "username"],
              defaultTemplate: {username: null, role: "View&Edit"}
            }
          ],
          elementTemplate: {
            name: "",
            overrides: {reusableFormName: "standard-contributor-fields-lookup-only-group"},
            component: {
              class: "ReusableComponent",
              config: {
                label: "@dmpt-user-permissions-tab-dmp-permissions",
                componentDefinitions: [
                  {
                    name: "standard_contributor_fields_lookup_only_group",
                    overrides: {replaceName: ""},
                    component: {
                      class: "GroupComponent",
                      config: {
                        componentDefinitions: [
                          {
                            overrides: {reusableFormName: "standard-contributor-fields-lookup-only"},
                            name: "standard_contributor_fields_lookup_only_reusable",
                            component: {class: "ReusableComponent", config: {componentDefinitions: []}},
                          },
                          {
                            name: "role",
                            component: {
                              class: "DropdownInputComponent",
                              config: {
                                hostCssClasses: "rb-form-contributor-inline__field rb-form-contributor-inline__field--role",
                                options: [
                                  {
                                    label: "View",
                                    value: "View"
                                  },
                                  {
                                    label: "Edit",
                                    value: "View&Edit"
                                  }
                                ]
                              }
                            },
                            model: {
                              class: "DropdownInputModel",
                              config: {
                                validators: [{class: "required"}]
                              }
                            },
                            layout: {
                              class: "InlineLayout",
                              config: {
                                label: "@dmpt-user-permissions-tab-role-hdr",
                                hostCssClasses: "d-flex align-items-center gap-2"
                              }
                            }
                          }
                        ],
                      },
                    },
                  },
                ],
              },
            },
            model: {
              class: "GroupModel",
              config: {
                value: {
                  role: "View"
                },
                newEntryValue: {
                  role: "View"
                },
                validators: [{class: "required"}],
              },
            },
            layout: {
              class: "DefaultLayout",
              config: {
                label: "@dmpt-user-permissions-tab-dmp-permissions",
                helpText: "@dmpt-user-permissions-tab-dmp-permission-help",
              },
            },
          } as never,
        },
      },
      model: {
        class: "RepeatableModel",
        config: {
          defaultValue: [
            {
              role: "View"
            }
          ],
          validators: [{class: "required"}],
        },
      },
      layout: {
        class: "DefaultLayout",
        config: {
          label: "@dmpt-user-permissions-tab-dmp-permissions",
          helpText: "@dmpt-user-permissions-tab-dmp-permission-help",
        },
      },
    },
  ],
}
