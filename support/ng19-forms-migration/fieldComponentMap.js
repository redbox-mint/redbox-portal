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
    let textFieldConfig = {
      maxLength: field?.definition?.maxLength ?? 0,
      extraLabel: field?.definition?.extraLabel ?? ''
    }

    // console.log(JSON.stringify(field));
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'TextFieldComponent',
        modelClass: 'TextFieldModel'
    });

    if(textFieldConfig.maxLength > 0) {
    //   console.log(JSON.stringify(textFieldConfig));
      _.set(componentDefinition, 'model.config.validators', [ {name: 'maxLength', message: '', config: {maxLength: textFieldConfig.maxLength}} ]);
    }

    return componentDefinition;
  },
  TextBlockComponent: (field) => {
    let componentDefinition = createBaseComponent({
        field,
        componentClass: 'TextBlockComponent',
        modelClass: 'TextBlockModel'
    });

    _.unset(componentDefinition,'layout');

    return componentDefinition;
  },


  // Add more mappings as needed...
};
