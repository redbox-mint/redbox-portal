module.exports = [
  // -------------------------------------------------------------------
  // Start Tab
  // -------------------------------------------------------------------
  {
    class: "Container",
    definition: {
      id: "about",
      label: "@dataPublication-about-tab",
      active: true,
      fields: [{
          class: "ParameterRetriever",
          compClass: 'ParameterRetrieverComponent',
          definition: {
            name: 'parameterRetriever',
            parameterName: 'dataRecordOid'
          }
        },
        {
          class: 'RecordMetadataRetriever',
          compClass: 'RecordMetadataRetrieverComponent',
          definition: {
            name: 'dataRecordGetter',
            subscribe: {
              'parameterRetriever': {
                onValueUpdate: [{
                  action: 'publishMetadata'
                }]
              },
              'dataRecord': {
                relatedObjectSelected: [{
                  action: 'publishMetadata'
                }]
              }
            }
          }
        },

        {
          class: 'Container',
          compClass: 'TextBlockComponent',
          definition: {
            value: '@dataPublication-about-heading',
            type: 'h3'
          }
        },
        {
          class: 'RelatedObjectSelector',
          compClass: 'RelatedObjectSelectorComponent',
          definition: {
            label: 'Data record related to this publication',
            name: 'dataRecord',
            recordType: 'dataRecord',
            required: true,
            subscribe: {
              'dataRecordGetter': {
                onValueUpdate: [{
                  action: 'recordSelected'
            }
          ]
          }
          }
        }
      },
        {
          class: 'TextField',
          definition: {
            name: 'title',
            label: '@dataPublication-title',
            help: '@dataPublication-title-help',
            type: 'text',
            required: true,
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>',
            subscribe: {
              'dataRecordGetter': {
                onValueUpdate: [{
                  action: 'utilityService.getPropertyFromObject',
                  field: 'title'
                }]
              }
            }
          }
        },
        {
          class: 'MarkdownTextArea',
          compClass: 'MarkdownTextAreaComponent',
          definition: {
            name: 'description',
            label: '@dataPublication-description',
            help: '@dataPublication-description-help',
            type: 'text',
            required: true,
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>',
            subscribe: {
              'dataRecordGetter': {
                onValueUpdate: [{
                  action: 'utilityService.getPropertyFromObject',
                  field: 'description'
                }]
              }
            }
          }
        },
        {
          class: 'SelectionField',
          compClass: 'DropdownFieldComponent',
          definition: {
            name: 'dc:subject_anzsrc:toa_rdf:resource',
            label: '@dataPublication-datatype',
            help: '@dataPublication-datatype-help',
            required: true,
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>',
            options: [{
                value: "",
                label: "@dataPublication-dataype-select:Empty"
              },
              {
                value: "catalogueOrIndex",
                label: "@dataPublication-dataype-select:catalogueOrIndex"
              },
              {
                value: "collection",
                label: "@dataPublication-dataype-select:collection"
              },
              {
                value: "dataset",
                label: "@dataPublication-dataype-select:dataset"
              },
              {
                value: "registry",
                label: "@dataPublication-dataype-select:registry"
              },
              {
                value: "repository",
                label: "@dataPublication-dataype-select:repository"
              }
            ],
            subscribe: {
              'dataRecordGetter': {
                onValueUpdate: [{
                  action: 'utilityService.getPropertyFromObject',
                  field: 'datatype'
                }]
              }
            }
          }
        },
        {
          class: 'RepeatableContainer',
          compClass: 'RepeatableTextfieldComponent',
          definition: {
            label: "@dataPublication-keywords",
            help: "@dataPublication-keywords-help",
            name: "finalKeywords",
            editOnly: true,
            required: true,
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>',
            fields: [{
              class: 'TextField',
              definition: {
                type: 'text'
              }
            }],
            subscribe: {
              'dataRecordGetter': {
                onValueUpdate: [{
                  action: 'utilityService.getPropertyFromObject',
                  field: 'finalKeywords'
                }]
              }
            }
          }
        },
        {
          class: 'RepeatableVocab',
          compClass: 'RepeatableVocabComponent',
          definition: {
            name: 'foaf:fundedBy_foaf:Agent',
            label: "@dmpt-foaf:fundedBy_foaf:Agent",
            help: "@dmpt-foaf:fundedBy_foaf:Agent-help",
            forceClone: ['lookupService', 'completerService'],
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>',
            fields: [{
              class: 'VocabField',
              definition: {
                disableEditAfterSelect: false,
                vocabId: 'Funding Bodies',
                sourceType: 'mint',
                fieldNames: ['dc_title', 'dc_identifier', 'ID', 'repository_name'],
                searchFields: 'dc_title',
                titleFieldArr: ['dc_title'],
                stringLabelToField: 'dc_title'
              }
            }],
            subscribe: {
              'dataRecordGetter': {
                onValueUpdate: [{
                  action: 'utilityService.getPropertyFromObject',
                  field: 'foaf:fundedBy_foaf:Agent'
                }]
              }
            }
          }
        },
        {
          class: 'RepeatableVocab',
          compClass: 'RepeatableVocabComponent',
          definition: {
            name: 'foaf:fundedBy_vivo:Grant',
            label: "@dmpt-foaf:fundedBy_vivo:Grant",
            help: "@dmpt-foaf:fundedBy_vivo:Grant-help",
            forceClone: ['lookupService', 'completerService'],
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>',
            fields: [{
              class: 'VocabField',
              definition: {
                disableEditAfterSelect: false,
                vocabId: 'Research Activities',
                sourceType: 'mint',
                fieldNames: ['dc_title', 'grant_number', 'foaf_name', 'dc_identifier', 'known_ids', 'repository_name'],
                searchFields: 'grant_number,dc_title',
                titleFieldArr: ['grant_number', 'repository_name', 'dc_title'],
                titleFieldDelim: [{
                    prefix: '[',
                    suffix: ']'
                  },
                  {
                    prefix: ' (',
                    suffix: ')'
                  },
                  {
                    prefix: ' ',
                    suffix: ''
                  }
                ],
                stringLabelToField: 'dc_title'
              }
            }],
            subscribe: {
              'dataRecordGetter': {
                onValueUpdate: [{
                  action: 'utilityService.getPropertyFromObject',
                  field: 'foaf:fundedBy_vivo:Grant'
                }]
              }
            }
          }
        },
        {
          class: 'ANDSVocab',
          compClass: 'ANDSVocabComponent',
          definition: {
            label: "@dmpt-project-anzsrcFor",
            help: "@dmpt-project-anzsrcFor-help",
            name: "dc:subject_anzsrc:for",
            vocabId: 'anzsrc-for',
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>',
            subscribe: {
              'dataRecordGetter': {
                onValueUpdate: [{
                  action: 'utilityService.getPropertyFromObject',
                  field: 'dc:subject_anzsrc:for'
                }]
              }
            }
          }
        },
        {
          class: 'ANDSVocab',
          compClass: 'ANDSVocabComponent',
          definition: {
            label: "@dmpt-project-anzsrcSeo",
            help: "@dmpt-project-anzsrcSeo-help",
            name: "dc:subject_anzsrc:seo",
            vocabId: 'anzsrc-seo',
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>',
            subscribe: {
              'dataRecordGetter': {
                onValueUpdate: [{
                  action: 'utilityService.getPropertyFromObject',
                  field: 'dc:subject_anzsrc:seo'
                }]
              }
            }
          }
        }
      ]
    }
  }
];
