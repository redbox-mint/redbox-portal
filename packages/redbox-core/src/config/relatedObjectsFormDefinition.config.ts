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

const buildTextField = (name: string, label: string, placeholder = ""): any => ({
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

const buildTextAreaField = (name: string, label: string, placeholder = ""): any => ({
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

const buildUrlEditField = (label: string, placeholder = ""): any => ({
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

const buildUrlViewFields = (label: string): any[] => ([
  {
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
        template: "{{#if (get formData content.valuePath \"\")}}<li class=\"key-value-pair padding-bottom-10\">{{#if content.label}}<span class=\"key\">{{t content.label}}</span>{{/if}}<span class=\"value\"><a href=\"{{get formData content.valuePath \"\"}}\"{{#if content.target}} target=\"{{content.target}}\" rel=\"noopener noreferrer\"{{/if}}>{{get formData content.valuePath \"\"}}</a></span></li>{{/if}}",
        content: {
          label,
          valuePath: "related_url",
          target: ""
        }
      }
    },
    layout: {
      class: "InlineLayout",
      config: buildInlineLayoutConfig(label)
    }
  },
  {
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
  }
]);

export const buildRelatedLinkRepeatableFieldDefinition = ({
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
}: RelatedLinkRepeatableFieldOptions): any[] => {
  const componentDefinitions: any[] = [];
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

  return [
    {
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
    }
  ];
};
