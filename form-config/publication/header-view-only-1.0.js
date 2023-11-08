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
    class: 'Container',
    compClass: 'TextBlockComponent',
    viewOnly: true,
    definition: {
      label: '@status-label',
      value: '@record[workflow.stageLabel]',
      cssClasses: 'badge badge-success',
      type: 'span'
    },
    variableSubstitutionFields: ['value']
  },
  {
    class: "AnchorOrButton",
    viewOnly: true,
    definition: {
      label: '@header-view-only-edit-label',
      value: '/@branding/@portal/record/edit/@oid',
      cssClasses: 'btn btn-large btn-info margin-15',
      showPencil: true,
      controlType: 'anchor'
    },
    variableSubstitutionFields: ['value']
  },
  {
    class: "AnchorOrButton",
    viewOnly: true,
    definition: {
      label: '@header-view-only-view-data-label',
      value: '/@branding/@portal/record/view/@metadata[dataRecord.oid]',
      cssClasses: 'btn btn-large btn-info',
      controlType: 'anchor'
    },
    variableSubstitutionFields: ['value']
  },
  {
    class: "AnchorOrButton",
    roles: ['Admin', 'Librarians'],
    viewOnly: true,
    definition: {
      label: '@view-record-audit-link',
      value: '/@branding/@portal/record/viewAudit/@oid',
      cssClasses: 'btn btn-large btn-info margin-15',
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
      label: '@header-view-only-description'
    }
  }
];
