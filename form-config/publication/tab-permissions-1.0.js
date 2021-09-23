module.exports = [
  // -------------------------------------------------------------------
  // Permissions Tab
  // -------------------------------------------------------------------
  {
  class: "Container",
  roles: ['Admin', 'Librarians'],
  editOnly: true,
  definition: {
    id: "permissions",
    label: "@record-permissions-tab",
    fields: [{
      class: 'Container',
      compClass: 'TextBlockComponent',
      definition: {
        value: "@record-permissions-tab-heading",
        type: 'h3'
      }
    },
    {
                  class: 'RecordPermissionsField',
                  showHeader: true,
                  definition: {
                    name: 'permissions'
                  }
                }]
  }
}];
