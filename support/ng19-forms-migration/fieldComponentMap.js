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
        componentClass: 'SimpleInputComponent',
        modelClass: 'SimpleInputModel'
    });

    if(fieldConfig.maxLength > 0) {
      _.set(componentDefinition, 'model.config.validators', [ {name: 'maxLength', message: '', config: {maxLength: fieldConfig.maxLength}} ]);
    }

    return componentDefinition;
  },
  TextBlockComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'ContentComponent'
    });

    let fieldConfig = {
      type: field?.definition?.type ?? '',
      content: field?.definition?.value ?? field?.definition?.name ?? ''
    }

    if(!_.isEmpty(fieldConfig.type)) {
      // The below template is a reference that needs to be taken into account for legacy compatibility
      //
      // <span *ngSwitchCase="'h1'" role="heading" aria-level="1" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
      // <span *ngSwitchCase="'h2'" role="heading" aria-level="2" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
      // <span *ngSwitchCase="'h3'" role="heading" aria-level="3" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
      // <span *ngSwitchCase="'h4'" role="heading" aria-level="4" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
      // <span *ngSwitchCase="'h5'" role="heading" aria-level="5" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
      // <span *ngSwitchCase="'h6'" role="heading" aria-level="6" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
      // <hr *ngSwitchCase="'hr'" [ngClass]="field.cssClasses">
      // <span *ngSwitchCase="'span'" [ngClass]="field.cssClasses">{{field.label == null? '' : field.label + ': '}}{{field.value == null? '' : field.value}}</span>
      // <p *ngSwitchDefault [ngClass]="field.cssClasses" [innerHtml]="field.value == null? '' : field.value"></p>
      //
      switch(fieldConfig.type) {
        case 'h1':
          _.set(componentDefinition,'component.config.template','<h1>{{content}}</h1>');
        break;
        case 'h2':
          _.set(componentDefinition,'component.config.template','<h2>{{content}}</h2>');
        break;
        case 'h3':
          _.set(componentDefinition,'component.config.template','<h3>{{content}}</h3>');
        break;
        case 'h4':
          _.set(componentDefinition,'component.config.template','<h4>{{content}}</h4>');
        break;
        case 'h5':
          _.set(componentDefinition,'component.config.template','<h5>{{content}}</h5>');
        break;
        case 'h6':
          _.set(componentDefinition,'component.config.template','<h6>{{content}}</h6>');
        break;
        case 'hr':
          _.set(componentDefinition,'component.config.template','<hr>{{content}}</hr>');
        break;
        case 'p':
          _.set(componentDefinition,'component.config.template','<p>{{content}}</p>');
        break;
        case 'span':
          _.set(componentDefinition,'component.config.template','<span>{{content}}</span>');
        break;
        default:
          _.set(componentDefinition,'component.config.template','<h1>{{content}}</h1>');
        break;
    }

    _.set(componentDefinition,'component.config.content',fieldConfig.content);
    }

    _.unset(componentDefinition,'layout');
    _.unset(componentDefinition,'component.config.type');

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
        componentClass: 'AnchorOrButtonComponent',
        modelClass: 'AnchorOrButtonModel'
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
        componentClass: 'TextAreaComponent',
        modelClass: 'TextAreaModel'
    });

    return componentDefinition;
  },
  MarkdownTextArea: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'MarkdownTextAreaComponent',
        modelClass: 'MarkdownTextAreaModel'
    });

    return componentDefinition;
  },
  GenericGroupComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'GroupComponent'
    });

    _.unset(componentDefinition,'name');
    _.unset(componentDefinition,'layout');

    return componentDefinition;
  },
  ButtonBarContainer: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'GroupComponent'
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
        componentClass: 'SimpleInputComponent',
        modelClass: 'SimpleInputModel'
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
        componentClass: 'VocabComponent'
    });
    return componentDefinition;
  },
  ContributorField: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'GroupComponent',
        modelClass: 'GroupModel'
    });
    return componentDefinition;
  },
  HiddenValue: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'HiddenValueComponent'
    });
    _.unset(componentDefinition,'layout');
    return componentDefinition;
  },
  ANDSVocab: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'ANDSVocabComponent'
    });
    return componentDefinition;
  },
  TreeSelector: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'TreeSelectorComponent',
        modelClass: 'TreeSelectorModel'
    });
    return componentDefinition;
  },
  SelectionComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'SelectionComponent',
        modelClass: 'SelectionModel'
    });
    return componentDefinition;
  },
  DropdownComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'DropdownComponent',
        modelClass: 'DropdownModel'
    });
    return componentDefinition;
  },
  DateTime: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'DateTimeComponent'
    });
    return componentDefinition;
  },
  TabNavButton: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'TabNavButtonComponent'
    });
    _.unset(componentDefinition,'layout');
    return componentDefinition;
  },
  SaveButton: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'SaveButtonComponent'
    });
    _.unset(componentDefinition,'layout');
    return componentDefinition;
  },
  CancelButton: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'CancelButtonComponent'
    });
    _.unset(componentDefinition,'layout');
    return componentDefinition;
  },
  RelatedObjectSelector: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'RelatedObjectSelectorComponent'
    });
    _.unset(componentDefinition,'layout');
    return componentDefinition;
  },
  WorkspaceSelectorComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'WorkspaceComponent'
    });
    _.unset(componentDefinition,'layout');
    return componentDefinition;
  },
  WorkspaceSelectorComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'WorkspaceComponent'
    });
    _.unset(componentDefinition,'layout');
    return componentDefinition;
  },
  CopyGroupComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'CopyComponent'
    });
    return componentDefinition;
  },
  RelatedFileUpload: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'RelatedFileComponent'
    });
    return componentDefinition;
  }, 
  //TODO not sure if we need any of these
  // Spacer: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'SpacerComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  // EventHandler: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'EventHandlerComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  // ParameterRetriever: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'ParameterRetrieverComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  // RecordMetadataRetriever: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'RecordMetadataRetrieverComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  // LinkValueComponent: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'RecordMetadataRetrieverComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  // RecordPermissionsField: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'RecordPermissionsComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  //DataLocation: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'DataLocationComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  //RelatedObjectDataField: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'RelatedObjectDataComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  // Toggle: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'ToggleComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  // HtmlRaw: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'HtmlRawComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },
  //Timer: (field) => {
  //   let componentDefinition = createBaseComponent({
  //       field,
  //       componentClass: 'TimerComponent'
  //   });
  //   _.unset(componentDefinition,'layout');
  //   return componentDefinition;
  // },

  // Add more mappings as needed...
};
