module.exports = [
  {
    class: 'Container',
    compClass: 'TextBlockComponent',
    viewOnly: true,
    definition: {
      name: 'title',
      type: 'h1'
    }
  },
  {
    class: "AnchorOrButton",
    viewOnly: true,
    definition: {
      label: 'Edit this publication',
      value: '/@branding/@portal/record/edit/@oid',
      cssClasses: 'btn btn-large btn-info margin-15',
      showPencil: true,
      controlType: 'anchor'
    },
    variableSubstitutionFields: ['value']
  },
  {
    class: "ActionButton",
    viewOnly: true,
    definition: {
      name: "ckanLocation"
    }
  },
  {
    class: 'MarkdownTextArea',
    viewOnly: true,
    definition: {
      name: 'description',
      label: 'Description'
    }
  }
];
