/**
 * Data Publication form
 */
module.exports = {
  name: 'dataPublication-1.0-draft',
  type: 'dataPublication',
  skipValidationOnSave: false,
  editCssClasses: 'row col-md-12',
  viewCssClasses: 'row col-md-offset-1 col-md-10',
  messages: {
    "saving": ["@dmpt-form-saving"],
    "validationFail": ["@dmpt-form-validation-fail-prefix", "@dmpt-form-validation-fail-suffix"],
    "saveSuccess": ["@dmpt-form-save-success"],
    "saveError": ["@dmpt-form-save-error"]
  },
  attachmentFields: [
    "dataLocations"
  ],
  fields: [{
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
    },
    {
      class: "TabOrAccordionContainer",
      compClass: "TabOrAccordionContainerComponent",
      definition: {
        id: "mainTab",
        fields: [
          // -------------------------------------------------------------------
          // About Tab
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
                    required: true
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
          },
          // -------------------------------------------------------------------
          // Aim Tab
          // -------------------------------------------------------------------
          {
            class: "Container",
            definition: {
              id: "coverage",
              label: "@dataPublication-coverage-tab",
              fields: [{
                  class: 'Container',
                  compClass: 'TextBlockComponent',
                  definition: {
                    value: '@dataPublication-coverage-heading',
                    type: 'h3'
                  }
                },
                {
                  class: 'Container',
                  compClass: 'TextBlockComponent',
                  definition: {
                    value: '@dataPublication-temporalcoverage-heading',
                    type: 'h4'
                  }
                },
                {
                  class: 'DateTime',
                  definition: {
                    name: "startDate",
                    label: "@dataPublication-startDate",
                    help: '@dataPublication-startDate-help',
                    datePickerOpts: {
                      format: 'dd/mm/yyyy',
                      icon: 'fa fa-calendar',
                      autoclose: true
                    },
                    timePickerOpts: false,
                    hasClearButton: false,
                    valueFormat: 'YYYY-MM-DD',
                    displayFormat: 'L',
                    publish: {
                      onValueUpdate: {
                        modelEventSource: 'valueChanges'
                      }
                    }
                  }
                },
                {
                  class: 'DateTime',
                  definition: {
                    name: "endDate",
                    label: "@dataPublication-endDate",
                    help: '@dataPublication-endDate-help',
                    datePickerOpts: {
                      format: 'dd/mm/yyyy',
                      icon: 'fa fa-calendar',
                      autoclose: true
                    },
                    timePickerOpts: false,
                    hasClearButton: false,
                    valueFormat: 'YYYY-MM-DD',
                    displayFormat: 'L',
                    publish: {
                      onValueUpdate: {
                        modelEventSource: 'valueChanges'
                      }
                    }
                  }
                },
                {
                  class: 'TextField',
                  definition: {
                    name: 'timePeriod',
                    label: '@dataPublication-timePeriod',
                    help: '@dataPublication-timePeriod-help',
                    type: 'text'
                  }
                },
                {
                  class: 'MapField',
                  compClass: 'MapComponent',
                  definition: {
                    name: 'geospatial',
                    label: '@dataPublication-geospatial',
                    help: '@dataPublication-geospatial-help',
                    tabId: 'coverage'
                  }
                }
              ]
            }
          },
          // -------------------------------------------------------------------
          // Data Tab
          // -------------------------------------------------------------------
          {
            class: "Container",
            definition: {
              id: "data",
              label: "@dataPublication-data-tab",
              fields: [{
                  class: 'Container',
                  compClass: 'TextBlockComponent',
                  definition: {
                    value: '@dataPublication-data-heading',
                    type: 'h3'
                  }
                },
                {
                  class: 'Toggle',
                  compClass: 'ToggleComponent',
                  editOnly: true,
                  definition: {
                    name: 'accessRightsToggle',
                    defaultValue: false,
                    label: '@dataPublication-publish-metadata-only',
                    help: '@dataPublication-publish-metadata-only-help',
                    controlType: 'checkbox',
                    publish: {
                      onValueUpdate: {
                        modelEventSource: 'valueChanges'
                      }
                    },
                    subscribe: {
                      'form': {
                        onFormLoaded: [
                          { action: 'publishValueLoaded' }
                        ]
                      }
                    }
                  }
                },
                {
                  class: 'PublishDataLocationSelector',
                  compClass: 'PublishDataLocationSelectorComponent',
                  definition: {
                    name: "dataLocations", // this will create another entry on form group that will contain the list of those selected
                    visibilityCriteria: false, // hidden when access rights is unchecked
                    subscribe: {
                      'dataRecordGetter': {
                        onValueUpdate: [{
                          action: 'utilityService.getPropertyFromObject',
                          field: 'dataLocations'
                        }]
                      },
                      'accessRightsToggle': {
                        onValueUpdate: [
                          { action: 'setVisibility' }
                        ],
                        onValueLoaded: [
                          { action: 'setVisibility' }
                        ]
                      }
                    }
                  }
                },
                {
                  class: 'HtmlRaw',
                  compClass: 'HtmlRawComponent',
                  editOnly:true,
                  definition: {
                    name: "dataPub-dm-prefix-0",
                    value: '@dataPublication-data-manager',
                    visibilityCriteria: true, // visible when access rights is checked
                    subscribe: {
                      'accessRightsToggle': {
                        onValueUpdate: [
                          { action: 'setVisibility' }
                        ],
                        onValueLoaded: [
                          { action: 'setVisibility' }
                        ]
                      }
                    }
                  }
                },
                {
                  class: 'TextField',
                  definition: {
                    name: 'dataLicensingAccess_manager',
                    label: '@dataPublication-dataLicensingAccess_manager',
                    type: 'text',
                    readOnly: true,
                    visibilityCriteria: true, // visible when access rights is checked
                    subscribe: {
                      'dataRecordGetter': {
                        onValueUpdate: [{
                          action: 'utilityService.getPropertyFromObject',
                          field: 'contributor_data_manager.text_full_name'
                        }]
                      },
                      'accessRightsToggle': {
                        onValueUpdate: [
                          { action: 'setVisibility' }
                        ],
                        onValueLoaded: [
                          { action: 'setVisibility' }
                        ]
                      }
                    }
                  }
                },
                {
                  class: 'HtmlRaw',
                  compClass: 'HtmlRawComponent',
                  editOnly:true,
                  definition: {
                    name: "dataPub-dm-suffix-0",
                    value: '@dataPublication-data_manager-transferResponsibility',
                    visibilityCriteria: true, // visible when access rights is checked
                    subscribe: {
                      'accessRightsToggle': {
                        onValueUpdate: [
                          { action: 'setVisibility' }
                        ],
                        onValueLoaded: [
                          { action: 'setVisibility' }
                        ]
                      }
                    }
                  }
                },
                {
                  class: 'SelectionField',
                  compClass: 'SelectionFieldComponent',
                  definition: {
                    name: 'dc:accessRights',
                    label: '@dataPublication-dc:accessRights',
                    help: '@dataPublication-dc:accessRights-help',
                    defaultValue: '@dataPublication-dc:accessRights-open',
                    controlType: 'radio',
                    readOnly:true,
                    options: [
                      {
                        value: "@dataPublication-dc:accessRights-open",
                        label: "@dataPublication-dc:accessRights-open"
                      },
                      {
                        value: "@dataPublication-dc:accessRights-restricted-val",
                        label: "@dataPublication-dc:accessRights-restricted"
                      }
                    ],
                    subscribe: {
                      'accessRightsToggle': {
                        onValueUpdate: [{
                          action: 'utilityService.getPropertyFromObjectMapping',
                          mapping: [
                            {
                              key: 'true',
                              value: 'Restricted'
                            },
                            {
                              key: 'false',
                              value: 'Open'
                            }
                          ]
                        }]
                      }
                    }
                  }
                },
                {
                  class: 'TextField',
                  definition: {
                    name: 'accessRights_url',
                    label: '@dataPublication-accessRights_url',
                    help: '@dataPublication-accessRights_url-help',
                    type: 'text'
                  }
                }
              ]
            }
          },
          // -------------------------------------------------------------------
          // Relationships Tab
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
          },
          // -------------------------------------------------------------------
          // License Tab
          // -------------------------------------------------------------------
          {
            class: "Container",
            definition: {
              id: "license",
              label: "@dataPublication-license-tab",
              fields: [
                {
                  class: 'Container',
                  compClass: 'TextBlockComponent',
                  definition: {
                    value: '@dataPublication-license-heading',
                    type: 'h3'
                  }
                },
                {
                  class: 'SelectionField',
                  compClass: 'DropdownFieldComponent',
                  definition: {
                    name: 'license_identifier',
                    label: '@dataPublication-dc:license.dc:identifier',
                    help: '@dataPublication-dc:license.dc:identifier-help',
                    options: [
                      {
                          "value": "http://creativecommons.org/licenses/by/3.0/au",
                          "label": "CC BY: Attribution 3.0 AU"
                      },
                      {
                          "name": "http://creativecommons.org/licenses/by-sa/3.0/au",
                          "label": "CC BY-SA: Attribution-Share Alike 3.0 AU"
                      },
                      {
                          "name": "http://creativecommons.org/licenses/by-nd/3.0/au",
                          "label": "CC BY-ND: Attribution-No Derivative Works 3.0 AU"
                      },
                      {
                          "name": "http://creativecommons.org/licenses/by-nc/3.0/au",
                          "label": "CC BY-NC: Attribution-Noncommercial 3.0 AU"
                      },
                      {
                          "name": "http://creativecommons.org/licenses/by-nc-sa/3.0/au",
                          "label": "CC BY-NC-SA: Attribution-Noncommercial-Share Alike 3.0 AU"
                      },
                      {
                          "name": "http://creativecommons.org/licenses/by-nc-nd/3.0/au",
                          "label": "CC BY-NC-ND: Attribution-Noncommercial-No Derivatives 3.0 AU"
                      },
                      {
                          "name": "http://creativecommons.org/licenses/by/4.0",
                          "label": "CC BY 4.0: Attribution 4.0 International"
                      },
                      {
                          "name": "http://creativecommons.org/licenses/by-sa/4.0",
                          "label": "CC BY-SA 4.0: Attribution-Share Alike 4.0 International"
                      },
                      {
                          "name": "http://creativecommons.org/licenses/by-nd/4.0",
                          "label": "CC BY-ND 4.0: Attribution-No Derivative Works 4.0 International"
                      },
                      {
                          "name": "http://creativecommons.org/licenses/by-nc/4.0",
                          "label": "CC BY-NC 4.0: Attribution-Noncommercial 4.0 International"
                      },
                      {
                          "name": "http://creativecommons.org/licenses/by-nc-sa/4.0",
                          "label": "CC BY-NC-SA 4.0: Attribution-Noncommercial-Share Alike 4.0 International"
                      },
                      {
                          "name": "http://creativecommons.org/licenses/by-nc-nd/4.0",
                          "label": "CC BY-NC-ND 4.0: Attribution-Noncommercial-No Derivatives 4.0 International"
                      },
                      {
                          "name": "http://opendatacommons.org/licenses/pddl/1.0/",
                          "label": "PDDL - Public Domain Dedication and License 1.0"
                      },
                      {
                          "name": "http://opendatacommons.org/licenses/by/1.0/",
                          "label": "ODC-By - Attribution License 1.0"
                      },
                      {
                          "name": "http://opendatacommons.org/licenses/odbl/1.0/",
                          "label": "ODC-ODbL - Attribution Share-Alike for data/databases 1.0"
                      }
                    ]
                  }
                },
                {
                  class: 'MarkdownTextArea',
                  definition: {
                    name: 'license_notes',
                    label: '@dataPublication-dc:license.rdf:Alt.skos:prefLabel'
                  }
                },
                {
                  class: 'TextField',
                  definition: {
                    name: 'license_other_url',
                    label: '@dataPublication-dc:license.rdf:Alt.dc:identifier',
                    help: '@dataPublication-dc:license.rdf:Alt.dc:identifier-help',
                    type: 'text'
                  }
                },
                {
                  class: 'TextField',
                  definition: {
                    name: 'license_statement',
                    label: '@dataPublication-dc:accessRights.dc:RightsStatement.skos:prefLabel',
                    help: '@dataPublication-dc:accessRights.dc:RightsStatement.skos:prefLabel-help',
                    type: 'text',
                    required: true,
                    defaultValue: '@dataPublication-dc:accessRights.dc:RightsStatement.skos:prefLabel-default'
                  }
                },
                {
                  class: 'TextField',
                  definition: {
                    name: 'license_statement_url',
                    label: '@dataPublication-dc:accessRights.dc:RightsStatement.dc:identifier',
                    help: '@dataPublication-dc:accessRights.dc:RightsStatement.dc:identifier-help',
                    type: 'text'
                  }
                }
              ]
            }
          },
          // -------------------------------------------------------------------
          // Citation Tab
          // -------------------------------------------------------------------
          {
            class: "Container",
            definition: {
              id: "citation",
              label: "@dataPublication-citation-tab",
              fields: [
                {
                  class: 'Container',
                  compClass: 'TextBlockComponent',
                  definition: {
                    value: "@dataPublication-citation-tab-heading",
                    type: 'h3'
                  }
                },
                {
                  class: 'TextField',
                  definition: {
                    name: 'citation_doi',
                    label: '@dataPublication-citation-identifier',
                    type: 'text',
                    readOnly:true,
                    subscribe: {
                      'form': {
                        onFormLoaded: [
                          { action: 'publishValueLoaded' }
                        ]
                      },
                      'this': {
                        onValueLoaded: [
                          { action: 'setVisibility' }
                        ]
                      }
                    },
                    visibilityCriteria: {
                      type: 'function',
                      action: 'utilityService.hasValue'
                    }
                  }
                },
                {
                  class: 'SelectionField',
                  compClass: 'SelectionFieldComponent',
                  editOnly: true,
                  definition: {
                    name: 'requestIdentifier',
                    controlType: 'checkbox',
                    options: [
                      {
                        value: "request",
                        label: "@dataPublication-citation-request-identifier"
                      }
                    ],
                    visibilityCriteria: undefined, // when doi is undefined, this is visible
                    subscribe: {
                      'citation_doi': {
                        onValueLoaded: [
                          { action: 'setVisibility' }
                        ]
                      }
                    }
                  }
                },
                {
                  class: 'TextField',
                  definition: {
                    name: 'citation_title',
                    label: '@dataPublication-citation-title',
                    help: '@dataPublication-citation-title-help',
                    type: 'text',
                    required: true
                  }
                },
                {
                  class: 'RepeatableContributor',
                  compClass: 'RepeatableContributorComponent',
                  definition: {
                    name: "creators",
                    canSort: true,
                    skipClone: ['showHeader', 'initialValue'],
                    forceClone: [{
                        field: 'vocabField',
                        skipClone: ['injector']
                      }
                    ],
                    fields: [{
                      class: 'ContributorField',
                      showHeader: true,
                      definition: {
                        required: false,
                        label: '@dataPublication-creators',
                        help: '@dataPublication-creators-help',
                        freeText: true,
                        splitNames: true,
                        nameColHdr: '@dmpt-people-tab-name-hdr',
                        emailColHdr: '@dmpt-people-tab-email-hdr',
                        orcidColHdr: '@dmpt-people-tab-orcid-hdr',
                        publish: {
                          onValueUpdate: {
                            modelEventSource: 'valueChanges'
                          }
                        },
                        subscribe: {
                          'this': {
                            onValueUpdate: []
                          }
                        }
                      }
                    }],
                    subscribe: {
                      'dataRecordGetter': {
                        onValueUpdate: [{
                          action: 'utilityService.getPropertyFromObjectConcat',
                          field: ['contributor_ci', 'contributor_data_manager', 'contributors', 'contributor_supervisor']
                        }]
                      }
                    }
                  }
                },
                {
                  class: 'TextField',
                  definition: {
                    name: 'citation_publisher',
                    label: '@dataPublication-citation-publisher',
                    help: '@dataPublication-citation-publisher-help',
                    defaultValue: '@dataPublication-citation-publisher-default',
                    type: 'text',
                    required: true
                  }
                },
                {
                  class: 'TextField',
                  definition: {
                    name: 'citation_url',
                    label: '@dataPublication-citation-url',
                    help: '@dataPublication-citation-url-help',
                    type: 'text',
                    required: true
                  }
                },
                {
                  class: 'DateTime',
                  definition: {
                    name: "citation_publication_date",
                    label: "@dataPublication-citation-publication-date",
                    help: '@dataPublication-citation-publication-datel-help',
                    datePickerOpts: {
                      format: 'dd/mm/yyyy',
                      icon: 'fa fa-calendar',
                      autoclose: true
                    },
                    timePickerOpts: false,
                    hasClearButton: false,
                    valueFormat: 'YYYY-MM-DD',
                    displayFormat: 'L'
                  }
                }
              ]
            }
          },
          // -------------------------------------------------------------------
          // Publication Tab
          // -------------------------------------------------------------------
          {
            class: "Container",
            definition: {
              id: "publication",
              label: "@dataPublication-publication-tab",
              fields: [
                {
                  class: 'Container',
                  compClass: 'TextBlockComponent',
                  definition: {
                    value: '@dataPublication-publication-heading',
                    type: 'h3'
                  }
                },
                {
                  class: 'Toggle',
                  compClass: 'ToggleComponent',
                  editOnly: true,
                  definition: {
                    name: 'embargoByDate',
                    defaultValue: false,
                    label: '@dataPublication-embargoEnabled',
                    help: '@dataPublication-embargoEnabled-help',
                    controlType: 'checkbox',
                    publish: {
                      onValueUpdate: {
                        modelEventSource: 'valueChanges'
                      }
                    },
                    subscribe: {
                      'form': {
                        onFormLoaded: [
                          { action: 'publishValueLoaded' }
                        ]
                      }
                    }
                  }
                },
                {
                  class: 'DateTime',
                  definition: {
                    name: "embargoUntil",
                    label: "@dataPublication-embargoUntil",
                    help: '@dataPublication-embargoUntil-help',
                    datePickerOpts: {
                      format: 'dd/mm/yyyy',
                      icon: 'fa fa-calendar',
                      autoclose: true
                    },
                    timePickerOpts: false,
                    hasClearButton: false,
                    valueFormat: 'YYYY-MM-DD',
                    displayFormat: 'L',
                    publish: {
                      onValueUpdate: {
                        modelEventSource: 'valueChanges'
                      }
                    },
                    subscribe: {
                      'embargoByDate': {
                        onValueLoaded: [
                          { action: 'setRequiredAndClearValueOnFalse' }
                        ],
                        onValueUpdate: [
                          { action: 'setRequiredAndClearValueOnFalse' }
                        ]
                      }
                    }
                  }
                },
                {
                  class: 'TextArea',
                  definition: {
                    name: 'embargoNote',
                    label: '@dataPublication-embargoNote',
                    help: '@dataPublication-embargoNote-help'
                  }
                },
                {
                  class: 'TextArea',
                  definition: {
                    name: 'reviewerNote',
                    label: '@dataPublication-reviewerNote',
                    help: '@dataPublication-reviewerNote-help'
                  }
                },
                {
                  class: 'ActionButton',
                  definition: {
                    label: "Publish Record to CKAN",
                    name: "ckanLocation",
                    cssClasses: "btn btn-primary",
                    targetAction: "publishToCKAN"
                  }
                }
              ]
            }
          },
          {
            class: "Container",
            roles: ['Admin', 'Librarians'],
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
                  class: 'AsynchField',
                  definition: {
                    name: 'asynchprogress',
                    label:"@asynch-label",
                    nameLabel: "@asynch-name",
                    statusLabel: "@asynch-status",
                    dateStartedLabel: "@asynch-dateStarted",
                    dateCompletedLabel: "@asynch-dateCompleted",
                    startedByLabel: "@asynch-startedBy",
                    messageLabel: "@asynch-message",
                    completionLabel: "@asynch-completion",
                    lastUpdateLabel: "@asynch-lastUpdate",
                    listenType: "taskType",
                    taskType: "publication",
                    relatedRecordId: "@oid",
                    criteria: {
                      where: {
                        relatedRecordId: "@oid",
                        taskType: "publication"
                      }
                    },
                    dateFormat: 'L LT'
                  },
                  variableSubstitutionFields: ['relatedRecordId']
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
        ]
      }
    },
    {
      class: "ButtonBarContainer",
      compClass: "ButtonBarContainerComponent",
      definition: {
        fields: [{
            class: "TabNavButton",
            definition: {
              id: 'mainTabNav',
              prevLabel: "@tab-nav-previous",
              nextLabel: "@tab-nav-next",
              targetTabContainerId: "mainTab",
              cssClasses: 'btn btn-primary'
            }
          },
          {
            class: "Spacer",
            definition: {
              width: '50px',
              height: 'inherit'
            }
          },
          {
            class: "SaveButton",
            definition: {
              label: 'Save',
              cssClasses: 'btn-success'
            }
          },
          {
            class: "SaveButton",
            definition: {
              label: 'Save & Close',
              closeOnSave: true,
              redirectLocation: '/@branding/@portal/dashboard/dataPublication'
            },
            variableSubstitutionFields: ['redirectLocation']
          },
          {
            class: "SaveButton",
            definition: {
              label: '@dataPublication-withdraw',
              closeOnSave: true,
              redirectLocation: '/@branding/@portal/dashboard/dataPublication',
              additionalData: { withdraw: true }
            },
            variableSubstitutionFields: ['redirectLocation']
          },
          {
            class: "SaveButton",
            definition: {
              label: 'Submit for Publication',
              closeOnSave: true,
              redirectLocation: '/@branding/@portal/dashboard/dataPublication',
              targetStep: 'queued'
            },
            variableSubstitutionFields: ['redirectLocation']
          },
          {
            class: "CancelButton",
            definition: {
              label: 'Close',
            }
          }
        ]
      }
    },
    {
      class: "Container",
      definition: {
        id: "form-render-complete",
        label: "Test",
        fields: [{
          class: 'Container',
          compClass: 'TextBlockComponent',
          definition: {
            value: 'will be empty',
            type: 'span'
          }
        }]
      }
    }
  ]
};
