module.exports = [
  {
    class: "Container",
    roles: ['Admin', 'Librarians'],
    editOnly:true,
    definition: {
      id: "reviewer",
      label: "@dataPublication-reviewer-tab",
      fields: [
        {
          class: 'Container',
          compClass: 'TextBlockComponent',
          definition: {
            value: "@dataPublication-reviewer-tab-heading",
            type: 'h3'
          }
        },
        {
          class: "SaveButton",
          roles: ["Admin"],
          definition: {
            name: "confirmDelete",
            label: '@dataPublication-delete',
            closeOnSave: true,
            redirectLocation: '/@branding/@portal/dashboard/dataPublication',
            cssClasses: 'btn-danger',
            confirmationMessage: '@dataPublication-confirmDelete',
            confirmationTitle: '@dataPublication-confirmDeleteTitle',
            cancelButtonMessage: '@dataPublication-cancelButtonMessage',
            confirmButtonMessage: '@dataPublication-confirmButtonMessage',
            isDelete: true
          },
          variableSubstitutionFields: ['redirectLocation']
        }
      ]
    }
  }
];
