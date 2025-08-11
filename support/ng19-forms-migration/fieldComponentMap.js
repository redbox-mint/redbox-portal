// fieldComponentMap.js
const _ = require('lodash');

// Common mapper applied to all fields
function applyCommonMapping(field) {
  return {
    editOnly: field?.editOnly ?? '',
    viewOnly: field?.viewOnly ?? '',
    visible: field?.visible ?? '',
    roles: field?.roles ?? '',
    showHeader: field?.showHeader ?? '',
    showRole: field?.showRole ?? '',
    variableSubstitutionFields: field?.variableSubstitutionFields ?? '',
    disabledExpression: field?.disabledExpression ?? '',
    id: field?.definition?.id ?? '',
    label: field?.definition?.label ?? '',
    name: field?.definition?.name ?? '',
    help: field?.definition?.help ?? '',
    defaultValue: field?.definition?.value ?? field?.definition?.defaultValue ?? '',
    type: field?.definition?.type ?? '',
    subscribe: field?.definition?.subscribe ?? '',
    required: field?.definition?.required ?? '',
    readOnly: field?.definition?.readOnly ?? '',
    visible: field?.definition?.visible ?? '',
    groupName: field?.definition?.groupName ?? '',
    groupClasses: field?.definition?.groupClasses ?? '',
    cssClasses: field?.definition?.cssClasses ?? '',
    validationMessages: field?.definition?.validationMessages?.required ?? '',
    visivibilityCriteria: field?.definition?.visivibilityCriteria?.template ?? '',
    publish: field?.definition?.publish ?? '',
    disabledExpression: field?.definition?.disabledExpression ?? '',
    controlType: field?.definition?.controlType ?? '',
    skip: field?.definition?.skip ?? ''
  };
}

function createBaseComponent({ field, componentClass, modelClass = null, componentConfig = {} }) {
  const common = applyCommonMapping(field);

  let componentDefinition = {
    name: common.name,
    layout: {
      class: 'DefaultLayoutComponent',
      config: {
        label: common.label,
        helpText: common.help,
      }
    },
    component: {
      class: componentClass,
      config: componentConfig
    }
  };

  if (modelClass) {
    componentDefinition.model = {
      class: modelClass,
      config: {
        defaultValue: common.defaultValue
      }
    };
  }

  if(!_.isEmpty(common.type)) {
    _.set(componentDefinition, 'component.config.type', common.type);
  }

  if(!_.isEmpty(common.controlType)) {
    _.set(componentDefinition, 'component.config.controlType', common.controlType);
  }

  if(!_.isEmpty(common.cssClasses)) {
    _.set(componentDefinition, 'component.config.cssClasses', common.cssClasses);
  }

  if(!_.isEmpty(common.required)) {
    _.set(componentDefinition, 'model.config.validators', [ { name: 'required' } ]);
  }

  if (!_.isEmpty(common.subscribe)) {
    // console.log(JSON.stringify(common.subscribe));
    _.set(componentDefinition,'unparsable.subscribe',common.subscribe);
  }

  if (!_.isEmpty(common.visivibilityCriteria)) {
    // console.log(JSON.stringify(common.visivibilityCriteria));
    _.set(componentDefinition,'unparsable.visivibilityCriteria',common.visivibilityCriteria);
  }

  if (!_.isEmpty(common.publish)) {
    // console.log(JSON.stringify(common.publish));
    _.set(componentDefinition, 'unparsable.publish',common.publish);
  }
  
  if (!_.isEmpty(common.disabledExpression)) {
    // console.log(JSON.stringify(common.disabledExpression));
    _.set(componentDefinition, 'unparsable.disabledExpression',common.disabledExpression);
  }

  return componentDefinition;
}


module.exports = {

  TextField: (field) => {

    //component specific mapping
    let fieldConfig = {
      maxLength: field?.definition?.maxLength ?? 0,
      extraLabel: field?.definition?.extraLabel ?? ''
    }

    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'TextFieldComponent',
        modelClass: 'TextFieldModel'
    });

    if(fieldConfig.maxLength > 0) {
      _.set(componentDefinition, 'model.config.validators', [ {name: 'maxLength', message: '', config: {maxLength: fieldConfig.maxLength}} ]);
    }

    return componentDefinition;
  },
  TextBlockComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'TextBlockFieldComponent',
        modelClass: 'TextBlockFieldModel'
    });

    _.unset(componentDefinition,'layout');

    return componentDefinition;
  },
  AnchorOrButton: (field) => {
    
    //component specific mapping
    let fieldConfig = {
      showPencil: field?.definition?.showPencil ?? '',
      needsEditAccess: field?.needsEditAccess ?? '',
      name: field?.definition?.label ?? ''
    }
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'AnchorOrButtonFieldComponent',
        modelClass: 'AnchorOrButtonFieldModel'
    });

    if(!_.isEmpty(fieldConfig.showPencil)) {
      _.set(componentDefinition, 'component.config.showPencil');
    }
    
    if(!_.isEmpty(fieldConfig.needsEditAccess)) {
      _.set(componentDefinition, 'component.config.needsEditAccess');
    }
    
    if(!_.isEmpty(fieldConfig.name)) {
      _.set(componentDefinition,'name',fieldConfig.name);
    }
    
    _.unset(componentDefinition,'layout');

    return componentDefinition;
  },
  TextArea: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'TextAreaFieldComponent',
        modelClass: 'TextAreaFieldModel'
    });

    return componentDefinition;
  },
  MarkdownTextArea: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'MarkdownTextAreaFieldComponent',
        modelClass: 'MarkdownTextAreaFieldModel'
    });

    return componentDefinition;
  },
  GenericGroupComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'GroupFieldComponent'
    });

    _.unset(componentDefinition,'name');
    _.unset(componentDefinition,'layout');

    return componentDefinition;
  },
  ButtonBarContainer: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'GroupFieldComponent'
    });

    _.unset(componentDefinition,'name');
    _.unset(componentDefinition,'layout');

    return componentDefinition;
  },
  RepeatableVocabComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'RepeatableComponent',
        modelClass: 'RepeatableComponentModel'
    });

    _.unset(componentDefinition,'name');
    _.unset(componentDefinition,'layout');

    return componentDefinition;
  },
  RepeatableContributorComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'RepeatableComponent',
        modelClass: 'RepeatableComponentModel'
    });

    _.unset(componentDefinition,'name');
    _.unset(componentDefinition,'layout');

    return componentDefinition;
  },
  RepeatableTextfieldComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'TextfieldComponent',
        modelClass: 'TextfieldModel'
    });

    return componentDefinition;
  },
  RepeatableGroupComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'RepeatableComponent',
        modelClass: 'RepeatableComponentModel'
    });

    _.unset(componentDefinition,'name');
    _.unset(componentDefinition,'layout');

    return componentDefinition;
  },
  VocabField: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'VocabFieldComponent'
    });
    return componentDefinition;
  },
  ContributorField: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'GroupFieldComponent',
        modelClass: 'GroupFieldModel'
    });
    return componentDefinition;
  },
  HiddenValue: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'HiddenValueFieldComponent'
    });
    _.unset(componentDefinition,'layout');
    return componentDefinition;
  },
  ANDSVocab: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'ANDSVocabFieldComponent'
    });
    return componentDefinition;
  },
  TreeSelector: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'TreeSelectorFieldComponent',
        modelClass: 'TreeSelectorFieldModel'
    });
    return componentDefinition;
  },
  SelectionFieldComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'SelectionFieldComponent',
        modelClass: 'SelectionFieldModel'
    });
    return componentDefinition;
  },
  DropdownFieldComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'DropdownFieldComponent',
        modelClass: 'DropdownFieldModel'
    });
    return componentDefinition;
  },
  DateTime: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'DateTimeFieldComponent'
    });
    return componentDefinition;
  },
  TabNavButton: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'TabNavButtonFieldComponent'
    });
    _.unset(componentDefinition,'layout');
    return componentDefinition;
  },
  SaveButton: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'SaveButtonFieldComponent'
    });
    _.unset(componentDefinition,'layout');
    return componentDefinition;
  },
  CancelButton: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'CancelButtonFieldComponent'
    });
    _.unset(componentDefinition,'layout');
    return componentDefinition;
  },
  RelatedObjectSelector: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'RelatedObjectSelectorFieldComponent'
    });
    _.unset(componentDefinition,'layout');
    return componentDefinition;
  },
  WorkspaceSelectorComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'WorkspaceFieldComponent'
    });
    _.unset(componentDefinition,'layout');
    return componentDefinition;
  },
  WorkspaceSelectorFieldComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'WorkspaceFieldComponent'
    });
    _.unset(componentDefinition,'layout');
    return componentDefinition;
  },
  CopyGroupComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'CopyFieldComponent'
    });
    return componentDefinition;
  },
  RelatedFileUpload: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'RelatedFileFieldComponent'
    });
    return componentDefinition;
  }, 
  //TODO not sure if we need any of these
  // Spacer: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'SpacerFieldComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  // EventHandler: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'EventHandlerFieldComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  // ParameterRetriever: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'ParameterRetrieverFieldComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  // RecordMetadataRetriever: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'RecordMetadataRetrieverFieldComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  // LinkValueComponent: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'RecordMetadataRetrieverFieldComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  // RecordPermissionsField: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'RecordPermissionsFieldComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  //DataLocation: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'DataLocationFieldComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  //RelatedObjectDataField: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'RelatedObjectDataFieldComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  // Toggle: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'ToggleFieldComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  // HtmlRaw: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'HtmlRawFieldComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  //Timer: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'TimerFieldComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },

  // Add more mappings as needed...
};
