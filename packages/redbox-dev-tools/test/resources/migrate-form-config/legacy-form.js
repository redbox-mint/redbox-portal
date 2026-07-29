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
    },
    {
      class: 'Container',
      compClass: 'TextBlockComponent',
      definition: {
        name: 'temporal_heading',
        value: '@dataPublication-temporalcoverage-heading',
        help: '@dataPublication-temporalcoverage-heading-help',
        type: 'span',
        cssClasses: 'h4-header'
      }
    },
    {
      class: 'LinkValueComponent',
      definition: {
        name: 'citation_url',
        label: '@dataPublication-citation-url',
        help: '@dataPublication-citation-url-help',
        type: 'text'
      }
    }
  ]
};
