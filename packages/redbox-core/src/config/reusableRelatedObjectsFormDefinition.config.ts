import {
  AvailableFormComponentDefinitionFrames,
  ContentFormComponentDefinitionFrame,
  RepeatableFormComponentDefinitionFrame, ReusableFormDefinitions,
  SimpleInputFormComponentDefinitionFrame,
  TextAreaFormComponentDefinitionFrame
} from "@researchdatabox/sails-ng-common";

type RelatedLinkFieldKey = 'url' | 'title' | 'notes';

type RelatedLinkRepeatableFieldOptions = {
  reusableName: string;
  fieldName: string;
  fieldLabel: string;
  helpText: string;
  groupName: string;
  titleLabel: string;
  urlLabel: string;
  notesLabel: string;
  fieldOrder: RelatedLinkFieldKey[];
  titlePlaceholder?: string;
  urlPlaceholder?: string;
  notesPlaceholder?: string;
};

const inlineLayoutConfig = {
  readonly: false,
  visible: true,
  editMode: true,
  disabled: false,
  autofocus: false,
  showValidIndicator: false,
  labelRequiredStr: "*",
  cssClassesMap: {},
  helpTextVisibleOnInit: false,
  helpTextVisible: false
};

const buildInlineLayoutConfig = (label: string, visible = true) => ({
  ...inlineLayoutConfig,
  label,
  visible
});

const buildTextField = (name: string, label: string, placeholder = ""): SimpleInputFormComponentDefinitionFrame => ({
  name,
  constraints: {
    authorization: {
      allowRoles: []
    },
    allowModes: []
  },
  component: {
    class: "SimpleInputComponent",
    config: {
      readonly: false,
      visible: true,
      editMode: true,
      label,
      wrapperCssClasses: "rb-form-related-link-inline__field",
      disabled: false,
      autofocus: false,
      showValidIndicator: false,
      type: "text",
      placeholder
    }
  },
  model: {
    class: "SimpleInputModel",
    config: {
      validators: []
    }
  },
  layout: {
    class: "InlineLayout",
    config: buildInlineLayoutConfig(label)
  }
});

const buildTextAreaField = (name: string, label: string, placeholder = ""): TextAreaFormComponentDefinitionFrame => ({
  name,
  constraints: {
    authorization: {
      allowRoles: []
    },
    allowModes: []
  },
  component: {
    class: "TextAreaComponent",
    config: {
      readonly: false,
      visible: true,
      editMode: true,
      label,
      wrapperCssClasses: "rb-form-related-link-inline__field",
      disabled: false,
      autofocus: false,
      showValidIndicator: false,
      rows: 1,
      cols: 20,
      placeholder
    }
  },
  model: {
    class: "TextAreaModel",
    config: {
      validators: []
    }
  },
  layout: {
    class: "InlineLayout",
    config: buildInlineLayoutConfig(label)
  }
});

const buildUrlEditField = (label: string, placeholder = ""): SimpleInputFormComponentDefinitionFrame => ({
  name: "related_url",
  constraints: {
    authorization: {
      allowRoles: []
    },
    allowModes: [
      "edit"
    ]
  },
  component: {
    class: "SimpleInputComponent",
    config: {
      readonly: false,
      visible: true,
      editMode: true,
      label,
      wrapperCssClasses: "rb-form-related-link-inline__field",
      disabled: false,
      autofocus: false,
      showValidIndicator: false,
      type: "text",
      placeholder
    }
  },
  model: {
    class: "SimpleInputModel",
    config: {
      validators: []
    }
  },
  layout: {
    class: "InlineLayout",
    config: buildInlineLayoutConfig(label)
  }
});

const buildUrlViewFields = (label: string): AvailableFormComponentDefinitionFrames[] => {
  const linkField: ContentFormComponentDefinitionFrame = {
    name: "related_url-link-value",
    constraints: {
      authorization: {
        allowRoles: []
      },
      allowModes: [
        "view"
      ]
    },
    overrides: {
      formModeClasses: {
        view: {
          component: "ContentComponent"
        }
      }
    },
    component: {
      class: "ContentComponent",
      config: {
        readonly: false,
        visible: true,
        editMode: true,
        wrapperCssClasses: "rb-form-related-link-inline__field",
        disabled: false,
        autofocus: false,
        showValidIndicator: false,
        template: "{{#if (get formData content.valuePath \"\")}}<li class=\"key-value-pair padding-bottom-10\">{{#if content.label}}<span class=\"key\">{{t content.label}}</span>{{/if}}<span class=\"value\"><a href=\"{{get formData content.valuePath \"\"}}\" target=\"{{content.target}}\" rel=\"noopener noreferrer\">{{get formData content.valuePath \"\"}}</a></span></li>{{/if}}",
        content: {
          label,
          valuePath: "related_url",
          target: "_blank"
        }
      }
    },
    layout: {
      class: "InlineLayout",
      config: buildInlineLayoutConfig(label)
    }
  };
  const hiddenField: SimpleInputFormComponentDefinitionFrame = {
    name: "related_url",
    constraints: {
      authorization: {
        allowRoles: []
      },
      allowModes: [
        "view"
      ]
    },
    overrides: {
      formModeClasses: {
        view: {
          component: "SimpleInputComponent"
        }
      }
    },
    component: {
      class: "SimpleInputComponent",
      config: {
        readonly: false,
        visible: false,
        editMode: true,
        label,
        wrapperCssClasses: "rb-form-related-link-inline__field",
        disabled: false,
        autofocus: false,
        showValidIndicator: false,
        type: "hidden"
      }
    },
    model: {
      class: "SimpleInputModel",
      config: {
        validators: []
      }
    },
    layout: {
      class: "InlineLayout",
      config: buildInlineLayoutConfig(label, false)
    }
  };

  return [linkField, hiddenField];
};

export const buildRelatedLinkRepeatableFieldDefinition = (
  {
    reusableName,
    fieldName,
    fieldLabel,
    helpText,
    groupName,
    titleLabel,
    urlLabel,
    notesLabel,
    fieldOrder,
    titlePlaceholder = "Full citation or publication title",
    urlPlaceholder = "https://doi.org/...",
    notesPlaceholder = "Open access, in press, or other context"
  }: RelatedLinkRepeatableFieldOptions
): AvailableFormComponentDefinitionFrames[] => {
  const componentDefinitions: AvailableFormComponentDefinitionFrames[] = [];
  fieldOrder.forEach(fieldKey => {
    switch (fieldKey) {
      case 'url':
        componentDefinitions.push(
          buildUrlEditField(urlLabel, urlPlaceholder),
          ...buildUrlViewFields(urlLabel)
        );
        break;
      case 'title':
        componentDefinitions.push(buildTextField('related_title', titleLabel, titlePlaceholder));
        break;
      case 'notes':
        componentDefinitions.push(buildTextAreaField('related_notes', notesLabel, notesPlaceholder));
        break;
    }
  });

  const definition: RepeatableFormComponentDefinitionFrame = {
    name: reusableName,
    constraints: {
      authorization: {
        allowRoles: []
      },
      allowModes: []
    },
    overrides: {
      replaceName: fieldName
    },
    component: {
      class: "RepeatableComponent",
      config: {
        readonly: false,
        visible: true,
        editMode: true,
        label: fieldLabel,
        disabled: false,
        autofocus: false,
        showValidIndicator: false,
        elementTemplate: {
          name: "",
          constraints: {
            authorization: {
              allowRoles: []
            },
            allowModes: []
          },
          overrides: {
            formModeClasses: {
              view: {
                component: "GroupComponent"
              }
            }
          },
          component: {
            class: "GroupComponent",
            config: {
              readonly: false,
              visible: true,
              editMode: true,
              label: groupName,
              hostCssClasses: "rb-form-related-link-inline",
              disabled: false,
              autofocus: false,
              showValidIndicator: false,
              componentDefinitions
            }
          },
          model: {
            class: "GroupModel",
            config: {
              validators: []
            }
          },
          layout: {
            class: "RepeatableElementLayout",
            config: {
              readonly: false,
              visible: true,
              editMode: true,
              label: groupName,
              hostCssClasses: "rb-form-action-row-layout",
              disabled: false,
              autofocus: false,
              showValidIndicator: false,
              labelRequiredStr: "*",
              cssClassesMap: {},
              helpTextVisibleOnInit: false,
              helpTextVisible: false,
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
    model: {
      class: "RepeatableModel",
      config: {
        validators: []
      }
    },
    layout: {
      class: "DefaultLayout",
      config: {
        readonly: false,
        visible: true,
        editMode: true,
        label: fieldLabel,
        disabled: false,
        autofocus: false,
        showValidIndicator: false,
        labelRequiredStr: "*",
        helpText,
        cssClassesMap: {},
        helpTextVisibleOnInit: false,
        helpTextVisible: false
      }
    }
  };

  return [
    definition
  ];
};

export const buildRelatedObjectsFieldDefinition = function (options: {
  fieldReusable?: string,
  fieldName?: string, fieldLabel?: string, fieldHelp?: string,
  titleReusable?: string, titleName?: string, titleLabel?: string, titlePlaceholder?: string,
  urlReusable?: string, urlName?: string, urlLabel?: string, urlPlaceholder?: string,
  notesReusable?: string, notesName?: string, notesLabel?: string, notesPlaceholder?: string,
}): AvailableFormComponentDefinitionFrames[] {

  return [{
    name: "related-objects-fields-title-first-group",
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
                      component: {class: "ReusableComponent", config: {componentDefinitions: [
                            {
                              name: options.titleName ?? "related_title",
                              component: {
                                class: "SimpleInputComponent",
                                config: {
                                  label: options.titleLabel,
                                  placeholder: options.titlePlaceholder,
                                }
                              },
                              layout: {
                                class: "InlineLayout",
                                config: {label: options.titleLabel}
                              },
                            }
                          ]}}
                    },{
                      overrides: {reusableFormName: options.urlReusable ?? "related-objects-field-url"},
                      name: "related_objects_field_url",
                      component: {class: "ReusableComponent", config: {componentDefinitions:[
                            {
                              name: options.urlName ?? "related_url",
                              component: {
                                class: "SimpleInputComponent",
                                config: {
                                  label: options.urlLabel,
                                  placeholder: options.urlPlaceholder,
                                }
                              },
                              layout: {class: "InlineLayout", config: {label: options.urlLabel}},
                            }
                          ]}}
                    }, {
                      overrides: {reusableFormName: options.notesReusable ?? "related-objects-field-notes"},
                      name: "related_objects_field_notes",
                      component: {class: "ReusableComponent", config: {componentDefinitions:[
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
                          ]}}
                    }
                    ]
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
      constraints: {
        authorization: {
          allowRoles: []
        },
        allowModes: []
      },
      component: {
        class: "SimpleInputComponent",
        config: {
          readonly: false,
          visible: true,
          editMode: true,
          wrapperCssClasses: "rb-form-related-link-inline__field",
          disabled: false,
          autofocus: false,
          showValidIndicator: false,
          type: "text",
        }
      },
      model: {
        class: "SimpleInputModel",
        config: {
          validators: []
        }
      },
      layout: {        class: "InlineLayout"      }
    }
  ],
  "related-objects-field-url": [
    {
      name: "related_url",
      constraints: {allowModes: ["edit"]},
      component: {
        class: "SimpleInputComponent",
        config: {
          readonly: false,
          visible: true,
          editMode: true,
          wrapperCssClasses: "rb-form-related-link-inline__field",
          disabled: false,
          autofocus: false,
          showValidIndicator: false,
          type: "text",
        }
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
          readonly: false,
          visible: true,
          editMode: true,
          wrapperCssClasses: "rb-form-related-link-inline__field",
          disabled: false,
          autofocus: false,
          showValidIndicator: false,
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
          readonly: false,
          visible: false,
          editMode: true,
          label: "@dmpt-related-publication-url",
          wrapperCssClasses: "rb-form-related-link-inline__field",
          disabled: false,
          autofocus: false,
          showValidIndicator: false,
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
          readonly: false,
          visible: true,
          editMode: true,
          wrapperCssClasses: "rb-form-related-link-inline__field",
          disabled: false,
          autofocus: false,
          showValidIndicator: false,
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
          readonly: false,
          visible: true,
          editMode: true,
          disabled: false,
          autofocus: false,
          showValidIndicator: false,
          elementTemplate: {
            name: "",
            overrides: {formModeClasses: {view: {component: "GroupComponent"}}},
            component: {
              class: "GroupComponent",
              config: {
                readonly: false,
                visible: true,
                editMode: true,
                hostCssClasses: "rb-form-related-link-inline",
                disabled: false,
                autofocus: false,
                showValidIndicator: false,
                componentDefinitions: []
              }
            },
            model: {class: "GroupModel"},
            layout: {
              class: "RepeatableElementLayout",
              config: {
                readonly: false,
                visible: true,
                editMode: true,
                hostCssClasses: "rb-form-action-row-layout",
                disabled: false,
                autofocus: false,
                showValidIndicator: false,
                labelRequiredStr: "*",
                cssClassesMap: {},
                helpTextVisibleOnInit: false,
                helpTextVisible: false,
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
      layout: {
        class: "DefaultLayout",
        config: {
          readonly: false,
          visible: true,
          editMode: true,
          disabled: false,
          autofocus: false,
          showValidIndicator: false,
          labelRequiredStr: "*",
          cssClassesMap: {},
          helpTextVisibleOnInit: false,
          helpTextVisible: false
        }
      }
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
  ],


  "related-objects-url-first": buildRelatedLinkRepeatableFieldDefinition({
    reusableName: "related_objects_url_first",
    fieldName: "related_publications",
    fieldLabel: "@dmpt-related-publication",
    helpText: "@dmpt-related-publication-help",
    groupName: "related_publication",
    titleLabel: "@dmpt-related-publication-title",
    urlLabel: "@dmpt-related-publication-url",
    notesLabel: "@dmpt-related-publication-notes",
    fieldOrder: ['url', 'title', 'notes']
  }),
  "related-objects-title-first": buildRelatedLinkRepeatableFieldDefinition({
    reusableName: "related_objects_title_first",
    fieldName: "related_publications",
    fieldLabel: "@dmpt-related-publication",
    helpText: "@dmpt-related-publication-help",
    groupName: "related_publication",
    titleLabel: "@dmpt-related-publication-title",
    urlLabel: "@dataPublication-related-publication-url",
    notesLabel: "@dataPublication-related-publication-notes",
    fieldOrder: ['title', 'url', 'notes']
  }),
};
