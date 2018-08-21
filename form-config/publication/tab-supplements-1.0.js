module.exports = [
  // -------------------------------------------------------------------
  // Supplements Tab
  // -------------------------------------------------------------------
  {
    class: "Container",
    definition: {
      id: "relationships",
      label: "@dataPublication-relationships-tab",
      fields: [{
          class: 'Container',
          compClass: 'TextBlockComponent',
          definition: {
            value: '@dataPublication-relationships-heading',
            type: 'h3'
          }
        },
        {
          class: 'RepeatableContainer',
          compClass: 'RepeatableGroupComponent',
          definition: {
            name: "related_publications",
            label: "@dmpt-related-publication",
            help: "@dmpt-related-publication-help",
            forceClone: ['fields'],
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>',
            fields: [
              {
                class: 'Container',
                compClass: 'GenericGroupComponent',
                definition: {
                  name: "related_publication",
                  cssClasses: "form-inline",
                  fields: [
                    {
                      class: 'TextField',
                      definition: {
                        name: 'related_title',
                        label: '@dataPublication-related-publication-title',
                        type: 'text',
                        groupName: 'related_publication',
                        groupClasses: 'width-30',
                        cssClasses : "width-80 form-control"
                      }
                    },
                    {
                      class: 'TextField',
                      definition: {
                        name: 'related_url',
                        label: '@dataPublication-related-publication-url',
                        type: 'text',
                        groupName: 'related_publication',
                        groupClasses: 'width-30',
                        cssClasses : "width-80 form-control"
                      }
                    },
                    {
                      class: 'TextArea',
                      definition: {
                        name: 'related_notes',
                        label: '@dataPublication-related-publication-notes',
                        type: 'text',
                        groupName: 'related_publication',
                        groupClasses: 'width-30',
                        cssClasses : "width-80 form-control",
                        rows: "1"
                      }
                    }
                  ]
                }
              }
            ],
            subscribe: {
              'dataRecordGetter': {
                onValueUpdate: [{
                  action: 'utilityService.getPropertyFromObject',
                  field: 'related_publications'
                }]
              }
            }
          }
        },
        {
          class: 'RepeatableContainer',
          compClass: 'RepeatableGroupComponent',
          definition: {
            name: "related_websites",
            label: "@dmpt-related-website",
            help: "@dmpt-related-website-help",
            forceClone: ['fields', 'fieldMap'],
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>',
            fields: [{
              class: 'Container',
              compClass: 'GenericGroupComponent',
              definition: {
                name: "related_website",
                cssClasses: "form-inline",
                fields: [
                  {
                    class: 'TextField',
                    definition: {
                      name: 'related_title',
                      label: '@dataPublication-related-website-title',
                      type: 'text',
                      groupName: 'related_website',
                      groupClasses: 'width-30',
                      cssClasses: "width-80 form-control"
                    }
                  },
                  {
                    class: 'TextField',
                    definition: {
                      name: 'related_url',
                      label: '@dataPublication-related-website-url',
                      type: 'text',
                      groupName: 'related_website',
                      groupClasses: 'width-30',
                      cssClasses: "width-80 form-control"
                    }
                  },
                  {
                    class: 'TextArea',
                    definition: {
                      name: 'related_notes',
                      label: '@dataPublication-related-website-notes',
                      type: 'text',
                      groupName: 'related_website',
                      groupClasses: 'width-30',
                      cssClasses : "width-80 form-control",
                      rows: "1"
                    }
                  }
                ]
              }
            }]
          }
        },
        {
          class: 'RepeatableContainer',
          compClass: 'RepeatableGroupComponent',
          definition: {
            name: "related_metadata",
            label: "@dataPublication-related-metadata",
            help: "@dataPublication-related-metadata-help",
            forceClone: ['fields', 'fieldMap'],
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>',
            fields: [{
              class: 'Container',
              compClass: 'GenericGroupComponent',
              definition: {
                name: "related_metadata_group",
                cssClasses: "form-inline",
                fields: [
                  {
                    class: 'TextField',
                    definition: {
                      name: 'related_title',
                      label: '@dataPublication-related-metadata-title',
                      type: 'text',
                      groupName: 'related_metadata_group',
                      groupClasses: 'width-30',
                      cssClasses: "width-80 form-control"
                    }
                  },
                  {
                    class: 'TextField',
                    definition: {
                      name: 'related_url',
                      label: '@dataPublication-related-metadata-url',
                      type: 'text',
                      groupName: 'related_metadata_group',
                      groupClasses: 'width-30',
                      cssClasses: "width-80 form-control"
                    }
                  },
                  {
                    class: 'TextArea',
                    definition: {
                      name: 'related_notes',
                      label: '@dataPublication-related-metadata-notes',
                      type: 'text',
                      groupName: 'related_metadata_group',
                      groupClasses: 'width-30',
                      cssClasses : "width-80 form-control",
                      rows: "1"
                    }
                  }
                ]
              }
            }]
          }
        },
        {
          class: 'RepeatableContainer',
          compClass: 'RepeatableGroupComponent',
          definition: {
            name: "related_data",
            label: "@dmpt-related-data",
            help: "@dmpt-related-data-help",
            forceClone: ['fields', 'fieldMap'],
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>',
            fields: [{
              class: 'Container',
              compClass: 'GenericGroupComponent',
              definition: {
                name: "related_datum",
                cssClasses: "form-inline",
                fields: [
                  {
                    class: 'TextField',
                    editOnly: true,
                    definition: {
                      name: 'related_title',
                      label: '@dataPublication-related-data-title',
                      type: 'text',
                      groupName: 'related_datum',
                      groupClasses: 'width-30',
                      cssClasses: "width-80 form-control"
                    }
                  },
                  {
                    class: 'TextField',
                    editOnly: true,
                    definition: {
                      name: 'related_url',
                      label: '@dataPublication-related-data-url',
                      type: 'text',
                      groupName: 'related_datum',
                      groupClasses: 'width-30',
                      cssClasses: "width-80 form-control"
                    }
                  },
                  {
                    class: 'TextArea',
                    definition: {
                      name: 'related_notes',
                      label: '@dataPublication-related-data-notes',
                      type: 'text',
                      groupName: 'related_datum',
                      groupClasses: 'width-30',
                      cssClasses : "width-80 form-control",
                      rows: "1"
                    }
                  }
                ]
              }
            }]
          }
        },
        {
          class: 'RepeatableContainer',
          compClass: 'RepeatableGroupComponent',
          definition: {
            name: "related_services",
            label: "@dataPublication-related-services",
            help: "@dataPublication-related-services-help",
            forceClone: ['fields', 'fieldMap'],
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>',
            fields: [{
              class: 'Container',
              compClass: 'GenericGroupComponent',
              definition: {
                name: "related_service",
                cssClasses: "form-inline",
                fields: [
                  {
                    class: 'TextField',
                    editOnly: true,
                    definition: {
                      name: 'related_title',
                      label: '@dataPublication-related-service-title',
                      type: 'text',
                      groupName: 'related_service',
                      groupClasses: 'width-30',
                      cssClasses: "width-80 form-control"
                    }
                  },
                  {
                    class: 'TextField',
                    editOnly: true,
                    definition: {
                      name: 'related_url',
                      label: '@dataPublication-related-service-url',
                      type: 'text',
                      groupName: 'related_service',
                      groupClasses: 'width-30',
                      cssClasses: "width-80 form-control"
                    }
                  },
                  {
                    class: 'TextArea',
                    definition: {
                      name: 'related_notes',
                      label: '@dataPublication-related-service-notes',
                      type: 'text',
                      groupName: 'related_service',
                      groupClasses: 'width-30',
                      cssClasses : "width-80 form-control",
                      rows: "1"
                    }
                  }

                ]
              }
            }]
          }
        }
      ]
    }
  }
];
