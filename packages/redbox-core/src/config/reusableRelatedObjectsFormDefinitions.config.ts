import {AvailableFormComponentDefinitionFrames, ReusableFormDefinitions} from "@researchdatabox/sails-ng-common";


export const buildRelatedObjectsFieldDefinition = function (options: {
  fieldReusable?: string,
  fieldName?: string, fieldLabel?: string, fieldHelp?: string,
  titleReusable?: string, titleName?: string, titleLabel?: string, titlePlaceholder?: string,
  urlReusable?: string, urlName?: string, urlLabel?: string, urlPlaceholder?: string,
  notesReusable?: string, notesName?: string, notesLabel?: string, notesPlaceholder?: string,
}): AvailableFormComponentDefinitionFrames[] {

  return [{
    name: "related_objects_fields_group_reusable",
    overrides: {reusableFormName: options.fieldReusable ?? "related-objects-fields-title-first-group"},
    component: {
      class: "ReusableComponent",
      config: {
        componentDefinitions: [{
          name: "related_objects_fields_group",
          overrides: {replaceName: options.fieldName},
          component: {
            class: "RepeatableComponent", config: {
              elementTemplate: {
                name: "",
                component: {
                  class: "GroupComponent",
                  config: {
                    componentDefinitions: [{
                      overrides: {reusableFormName: options.titleReusable ?? "related-objects-field-title"},
                      name: "related_objects_field_title",
                      component: {
                        class: "ReusableComponent", config: {
                          componentDefinitions: [{
                            name: options.titleName ?? "related_title",
                            component: {
                              class: "SimpleInputComponent",
                              config: {label: options.titleLabel, placeholder: options.titlePlaceholder}
                            },
                            layout: {
                              class: "InlineLayout",
                              config: {label: options.titleLabel}
                            },
                          }]
                        }
                      }
                    }, {
                      overrides: {reusableFormName: options.urlReusable ?? "related-objects-field-url"},
                      name: "related_objects_field_url",
                      component: {
                        class: "ReusableComponent", config: {
                          componentDefinitions: [
                            {
                              name: options.urlName ?? "related_url",
                              component: {
                                class: "SimpleInputComponent",
                                config: {label: options.urlLabel, placeholder: options.urlPlaceholder}
                              },
                              layout: {class: "InlineLayout", config: {label: options.urlLabel}},
                            }
                          ]
                        }
                      }
                    }, {
                      overrides: {reusableFormName: options.notesReusable ?? "related-objects-field-notes"},
                      name: "related_objects_field_notes",
                      component: {
                        class: "ReusableComponent", config: {
                          componentDefinitions: [
                            {
                              name: options.notesName ?? "related_notes",
                              component: {
                                class: "TextAreaComponent",
                                config: {
                                  label: options.notesLabel,
                                  placeholder: options.notesPlaceholder,
                                  rows: 1,
                                  cols: 20
                                }
                              },
                              layout: {class: "InlineLayout", config: {label: options.notesLabel}},
                            }
                          ]
                        }
                      }
                    }]
                  }
                }
              }
            }
          },
          layout: {class: "DefaultLayout", config: {label: options.fieldLabel, helpText: options.fieldHelp}},
        }
        ]
      }
    },
  }];
}

export const reusableRelatedObjectsFormDefinitions: ReusableFormDefinitions = {
  "related-objects-field-title": [
    {
      name: "related_title",
      component: {
        class: "SimpleInputComponent",
        config: {wrapperCssClasses: "rb-form-related-link-inline__field", type: "text"}
      },
      model: {class: "SimpleInputModel"},
      layout: {class: "InlineLayout"}
    }
  ],
  "related-objects-field-url": [
    {
      name: "related_url",
      constraints: {allowModes: ["edit"]},
      component: {
        class: "SimpleInputComponent",
        config: {wrapperCssClasses: "rb-form-related-link-inline__field", type: "text"}
      },
      model: {class: "SimpleInputModel"},
      layout: {class: "InlineLayout"}
    },
    {
      name: "related_url-link-value",
      constraints: {allowModes: ["view"]},
      overrides: {formModeClasses: {view: {component: "ContentComponent"}}},
      component: {
        class: "ContentComponent",
        config: {
          wrapperCssClasses: "rb-form-related-link-inline__field",
          template: "{{#if (get formData content.valuePath \"\")}}<li class=\"key-value-pair padding-bottom-10\">{{#if content.label}}<span class=\"key\">{{t content.label}}</span>{{/if}}<span class=\"value\"><a href=\"{{get formData content.valuePath \"\"}}\" target=\"{{content.target}}\" rel=\"noopener noreferrer\">{{get formData content.valuePath \"\"}}</a></span></li>{{/if}}",
          content: {
            label: "@dmpt-related-publication-url",
            valuePath: "related_url",
            target: "_blank"
          }
        }
      },
      layout: {class: "InlineLayout"}
    },
    {
      name: "related_url",
      constraints: {allowModes: ["view"]},
      overrides: {formModeClasses: {view: {component: "SimpleInputComponent"}}},
      component: {
        class: "SimpleInputComponent",
        config: {
          label: "@dmpt-related-publication-url",
          wrapperCssClasses: "rb-form-related-link-inline__field",
          type: "hidden"
        }
      },
      model: {class: "SimpleInputModel"},
      layout: {class: "InlineLayout", config: {visible: false}}
    },
  ],
  "related-objects-field-notes": [
    {
      name: "related_notes",
      component: {
        class: "TextAreaComponent",
        config: {
          wrapperCssClasses: "rb-form-related-link-inline__field",
          rows: 1,
          cols: 20,
        }
      },
      model: {class: "TextAreaModel"},
      layout: {class: "InlineLayout"}
    }
  ],
  "related-objects-fields-group": [
    {
      name: "related_objects_fields_group",
      component: {
        class: "RepeatableComponent",
        config: {
          elementTemplate: {
            name: "",
            overrides: {formModeClasses: {view: {component: "GroupComponent"}}},
            component: {
              class: "GroupComponent",
              config: {
                hostCssClasses: "rb-form-related-link-inline",
                componentDefinitions: []
              }
            },
            model: {class: "GroupModel"},
            layout: {
              class: "RepeatableElementLayout",
              config: {
                hostCssClasses: "rb-form-action-row-layout",
                labelRequiredStr: "*",
                containerCssClass: "rb-form-action-row rb-form-action-row--legacy-inline",
                alignment: "start",
                wrap: true,
                slotCssClass: "rb-form-action-slot",
                compact: true
              }
            }
          },
          addButtonShow: true,
          allowZeroRows: false,
          hideWhenZeroRows: false
        }
      },
      model: {class: "RepeatableModel"},
      layout: {class: "DefaultLayout", config: {labelRequiredStr: "*"}}
    }
  ],
  "related-objects-fields-url-first-group": [
    {
      overrides: {reusableFormName: "related-objects-fields-group"},
      name: "related_objects_fields_url_first_group",
      component: {
        class: "ReusableComponent", config: {
          componentDefinitions: [
            {
              name: "related_objects_fields_group",
              component: {
                class: "RepeatableComponent", config: {
                  elementTemplate: {
                    name: "",
                    component: {
                      class: "GroupComponent", config: {
                        componentDefinitions: [
                          {
                            overrides: {reusableFormName: "related-objects-field-url"},
                            name: "related_objects_field_url",
                            component: {class: "ReusableComponent"}
                          },
                          {
                            overrides: {reusableFormName: "related-objects-field-title"},
                            name: "related_objects_field_title",
                            component: {class: "ReusableComponent"}
                          },
                          {
                            overrides: {reusableFormName: "related-objects-field-notes"},
                            name: "related_objects_field_notes",
                            component: {class: "ReusableComponent"}
                          }
                        ]
                      }
                    }
                  }
                }
              }
            }
          ]
        }
      }
    }
  ],
  "related-objects-fields-title-first-group": [
    {
      overrides: {reusableFormName: "related-objects-fields-group"},
      name: "related_objects_fields_title_first_group",
      component: {
        class: "ReusableComponent", config: {
          componentDefinitions: [
            {
              name: "related_objects_fields_group",
              component: {
                class: "RepeatableComponent", config: {
                  elementTemplate: {
                    name: "",
                    component: {
                      class: "GroupComponent", config: {
                        componentDefinitions: [
                          {
                            overrides: {reusableFormName: "related-objects-field-title"},
                            name: "related_objects_field_title",
                            component: {class: "ReusableComponent"}
                          },
                          {
                            overrides: {reusableFormName: "related-objects-field-url"},
                            name: "related_objects_field_url",
                            component: {class: "ReusableComponent"}
                          },
                          {
                            overrides: {reusableFormName: "related-objects-field-notes"},
                            name: "related_objects_field_notes",
                            component: {class: "ReusableComponent"}
                          }
                        ]
                      }
                    }
                  }
                }
              }
            }
          ]
        }
      }
    }
  ]
};
