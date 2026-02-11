module.exports = {
  name: 'fixture-1.0-draft',
  type: 'rdmp',
  skipValidationOnSave: false,
  editCssClasses: 'redbox-form form',
  fields: [
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
      class: 'TextField',
      definition: {
        name: 'title',
        label: '@title',
        type: 'text'
      }
    }
  ]
};
