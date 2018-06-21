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
                    ]
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
                    type: 'text',
                    required: true
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
                  class: 'PublishDataLocationSelector',
                  compClass: 'PublishDataLocationSelectorComponent',
                  definition: {
                    name: "dataLocations",
                    subscribe: {
                      'dataRecordGetter': {
                        onValueUpdate: [{
                          action: 'utilityService.getPropertyFromObject',
                          field: 'dataLocations'
                        }]
                      }
                    }
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
                        fields: [{
                            class: 'TextField',
                            definition: {
                              name: 'related_url',
                              label: '@dmpt-related-website-url',
                              type: 'text',
                              groupName: 'related_website',
                              groupClasses: 'width-30',
                              cssClasses: "width-80 form-control"
                            }
                          },
                          {
                            class: 'TextField',
                            definition: {
                              name: 'related_title',
                              label: '@dmpt-related-website-title',
                              type: 'text',
                              groupName: 'related_website',
                              groupClasses: 'width-30',
                              cssClasses: "width-80 form-control"
                            }
                          },
                          {
                            class: 'TextField',
                            definition: {
                              name: 'related_notes',
                              label: '@dmpt-related-website-notes',
                              type: 'text',
                              groupName: 'related_website',
                              groupClasses: 'width-30',
                              cssClasses: "width-80 form-control"
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
                        fields: [{
                            class: 'SelectionField',
                            compClass: 'DropdownFieldComponent',
                            definition: {
                              name: 'related_relationship',
                              label: '@dmpt-related-data-relationship',
                              groupName: 'related_datum',
                              groupClasses: 'width-40',
                              cssClasses: "width-80 form-control",
                              options: [{
                                value: "@dmpt-related-data-relationship-association-with-val",
                                label: "@dmpt-related-data-relationship-association-with"
                              }]
                            }
                          },
                          {
                            class: 'TextField',
                            editOnly: true,
                            definition: {
                              name: 'related_title',
                              label: '@dmpt-related-data-title',
                              type: 'text',
                              groupName: 'related_datum',
                              groupClasses: 'width-20',
                              cssClasses: "width-80 form-control"
                            }
                          },
                          {
                            class: 'TextField',
                            editOnly: true,
                            definition: {
                              name: 'related_url',
                              label: '@dmpt-related-data-url',
                              type: 'text',
                              groupName: 'related_datum',
                              groupClasses: 'width-40',
                              cssClasses: "width-80 form-control"
                            }
                          },
                          {
                            class: 'TextField',
                            editOnly: true,
                            definition: {
                              name: 'related_notes',
                              label: '@dmpt-related-data-notes',
                              type: 'text',
                              groupName: 'related_datum',
                              groupClasses: 'width-30',
                              cssClasses: "width-80 form-control"
                            }
                          },
                          {
                            class: 'SelectionField',
                            compClass: 'SelectionFieldComponent',
                            definition: {
                              name: 'related_localdata',
                              controlType: 'checkbox',
                              groupName: 'related_datum',
                              cssClasses: "width-80 form-control",
                              groupClasses: 'width-30',
                              options: [{
                                value: "@dmpt-related-data-local-val",
                                label: "@dmpt-related-data-local"
                              }]
                            }
                          },
                          {
                            class: 'SelectionField',
                            compClass: 'SelectionFieldComponent',
                            definition: {
                              name: 'related_publishrda',
                              controlType: 'checkbox',
                              groupName: 'related_datum',
                              groupClasses: 'width-30',
                              cssClasses: "width-80 form-control",
                              options: [{
                                value: "@dmpt-related-data-rda-val",
                                label: "@dmpt-related-data-rda"
                              }]
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
                        fields: [{
                            class: 'SelectionField',
                            compClass: 'DropdownFieldComponent',
                            definition: {
                              name: 'related_relationship',
                              label: '@dmpt-related-data-relationship',
                              groupName: 'related_service',
                              groupClasses: 'width-40',
                              cssClasses: "width-80 form-control",
                              options: [{
                                value: "@dmpt-related-data-relationship-association-with-val",
                                label: "@dmpt-related-data-relationship-association-with"
                              }]
                            }
                          },
                          {
                            class: 'TextField',
                            editOnly: true,
                            definition: {
                              name: 'related_title',
                              label: '@dmpt-related-data-title',
                              type: 'text',
                              groupName: 'related_service',
                              groupClasses: 'width-20',
                              cssClasses: "width-80 form-control"
                            }
                          },
                          {
                            class: 'TextField',
                            editOnly: true,
                            definition: {
                              name: 'service_identifer',
                              label: '@dataPublication-service-identifier',
                              type: 'text',
                              groupName: 'related_service',
                              groupClasses: 'width-40',
                              cssClasses: "width-80 form-control"
                            }
                          },
                          {
                            class: 'TextField',
                            editOnly: true,
                            definition: {
                              name: 'related_notes',
                              label: '@dmpt-related-data-notes',
                              type: 'text',
                              groupName: 'related_service',
                              groupClasses: 'width-30',
                              cssClasses: "width-80 form-control"
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
          // Technical Metadata Tab
          // -------------------------------------------------------------------
          {
            class: "Container",
            definition: {
              id: "technicalMetadata",
              label: "@dataPublication-technicalMetadata-tab",
              fields: [{
                class: 'Container',
                compClass: 'TextBlockComponent',
                definition: {
                  value: '@dataPublication-technicalMetadata-heading',
                  type: 'h3'
                }
              }]
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
              fields: [{
                  class: 'Container',
                  compClass: 'TextBlockComponent',
                  definition: {
                    value: '@dataPublication-publication-heading',
                    type: 'h3'
                  }
                },
                {
                  class: 'Container',
                  compClass: 'TextBlockComponent',
                  definition: {
                    value: '@dataPublication-embargo-heading',
                    type: 'h4'
                  }
                },
                {
                  class: 'SelectionField',
                  compClass: 'SelectionFieldComponent',
                  definition: {
                    name: 'embargoEnabled',
                    controlType: 'checkbox',
                    options: [{
                      value: "embargoed",
                      label: "@dataPublication-embargoEnabled"
                    }]
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
                    }
                  }
                },
                {
                  class: 'TextArea',
                  definition: {
                    name: 'embargoNote',
                    label: '@dataPublication-embargoNote'
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
