/**
 * Data record form
 */
module.exports = {
  name: 'dataRecord-1.0-draft',
  type: 'dataRecord',
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
        label: '@data-record-edit-record-link',
        value: '/@branding/@portal/record/edit/@oid',
        cssClasses: 'btn btn-large btn-info margin-15',
        showPencil: true,
        controlType: 'anchor'
      },
      variableSubstitutionFields: ['value']
    },
    {
      class: 'TextArea',
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
          // Why Tab
          // -------------------------------------------------------------------
          {
            class: "Container",
            definition: {
              id: "aim",
              label: "@dataRecord-aim-tab",
              active: true,
              fields: [
                {
                  class: "ParameterRetriever",
                  compClass: 'ParameterRetrieverComponent',
                  definition: {
                    name: 'parameterRetriever',
                    parameterName:'rdmpOid'
                  }
                },
                {
                  class: 'RecordMetadataRetriever',
                  compClass: 'RecordMetadataRetrieverComponent',
                  definition: {
                    name: 'rdmpGetter',
                    subscribe: {
                      'parameterRetriever': {
                        onValueUpdate: [{
                          action: 'publishMetadata'
                        }]
                      },
                      'rdmp': {
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
                    value: '@dataRecord-aim-heading',
                    type: 'h3'
                  }
                },
                {
                  class: 'RelatedObjectSelector',
                  compClass: 'RelatedObjectSelectorComponent',
                  definition: {
                    label: 'RDMP related to this data record',
                    name: 'rdmp',
                    recordType: 'rdmp'
                  }
                },
                {
                  class: 'TextField',
                  definition: {
                    name: 'aim_project_name',
                    label: '@dataRecord-aim-project-name',
                    type: 'text',
                    subscribe: {
                      'rdmpGetter': {
                        onValueUpdate: [{
                          action: 'utilityService.getPropertyFromObject',
                          field: 'title'
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
                      'rdmpGetter': {
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
                    publish: {
                      onValueUpdate: {
                        modelEventSource: 'valueChanges',
                        // optional, renames fields `{field: sourcefield}` accessed using _.get, remove to return the entire data set
                        fields: [{
                          'grant_number': 'grant_number[0]'
                        }, {
                          'dc_title': 'dc_title'
                        }]
                      }
                    },
                    subscribe: {
                      'rdmpGetter': {
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
                      'rdmpGetter': {
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
                      'rdmpGetter': {
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
          // What Tab
          // -------------------------------------------------------------------
          {
            class: "Container",
            definition: {
              id: "about",
              label: "@dataRecord-about-tab",
              fields: [
                {
                  class: 'Container',
                  compClass: 'TextBlockComponent',
                  definition: {
                    value: '@dataRecord-about-heading',
                    type: 'h3'
                  }
                },
                {
                  class: 'TextField',
                  definition: {
                    name: 'title',
                    label: '@dataRecord-title',
                    help: '@dataRecord-title-help',
                    type: 'text',
                    required: true
                  }
                },
                {
                  class: 'TextArea',
                  compClass: 'TextAreaComponent',
                  definition: {
                    name: 'description',
                    label: '@dataRecord-description',
                    help: '@dataRecord-description-help',
                    type: 'text',
                    required: true,
                    subscribe: {
                      'rdmpGetter': {
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
                    name: 'datatype',
                    label: '@dataRecord-datatype',
                    help: '@dataRecord-datatype-help',
                    required: true,
                    options: [{
                        value: "",
                        label: "@dataRecord-dataype-select:Empty"
                      },
                      {
                        value: "catalogueOrIndex",
                        label: "@dataRecord-dataype-select:catalogueOrIndex"
                      },
                      {
                        value: "collection",
                        label: "@dataRecord-dataype-select:collection"
                      },
                      {
                        value: "dataset",
                        label: "@dataRecord-dataype-select:dataset"
                      },
                      {
                        value: "registry",
                        label: "@dataRecord-dataype-select:registry"
                      },
                      {
                        value: "repository",
                        label: "@dataRecord-dataype-select:repository"
                      }
                    ]
                  }
                },
                {
                  class: 'RepeatableContainer',
                  compClass: 'RepeatableTextfieldComponent',
                  definition: {
                    label: "@dataRecord-keywords",
                    help: "@dataRecord-keywords-help",
                    name: "finalKeywords",
                    required: true,
                    fields: [{
                      class: 'TextField',
                      definition: {
                        required: true,
                        type: 'text',
                        validationMessages: {
                          required: "@dataRecord-keywords-required"
                        }
                      }
                    }],
                    subscribe: {
                      'rdmpGetter': {
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
          // People Tab
          // -------------------------------------------------------------------
          {
            class: "Container",
            definition: {
              id: "people",
              label: "@dataRecord-people-tab",
              fields: [{
                  class: 'Container',
                  compClass: 'TextBlockComponent',
                  definition: {
                    value: '@dataRecord-people-heading',
                    type: 'h3'
                  }
                },
                {
                  class: 'ContributorField',
                  showHeader: true,
                  definition: {
                    name: 'contributor_ci',
                    required: true,
                    label: '@dmpt-people-tab-ci',
                    help: '@dmpt-people-tab-ci-help',
                    role: "@dmpt-people-tab-ci-role",
                    freeText: false,
                    forceLookupOnly: true,
                    vocabId: 'Parties AND repository_name:People',
                    sourceType: 'mint',
                    disabledExpression: '<%= !_.isEmpty(oid) %>',
                    fieldNames: [{
                      'text_full_name': 'text_full_name'
                    }, {
                      'full_name_honorific': 'text_full_name_honorific'
                    }, {
                      'email': 'Email[0]'
                    }],
                    searchFields: 'text_given_name,text_family_name,text_full_name,text_full_name_honorific',
                    titleFieldArr: ['text_full_name'],
                    titleFieldDelim: '',
                    nameColHdr: '@dmpt-people-tab-name-hdr',
                    emailColHdr: '@dmpt-people-tab-email-hdr',
                    orcidColHdr: '@dmpt-people-tab-orcid-hdr',
                    validation_required_name: '@dmpt-people-tab-validation-name-required',
                    validation_required_email: '@dmpt-people-tab-validation-email-required',
                    validation_invalid_email: '@dmpt-people-tab-validation-email-invalid',
                    publish: {
                      onValueUpdate: {
                        modelEventSource: 'valueChanges'
                      }
                    },
                    subscribe: {
                      'this': {
                        onValueUpdate: []
                      },
                      'rdmpGetter': {
                        onValueUpdate: [{
                          action: 'utilityService.getPropertyFromObject',
                          field: 'contributor_ci'
                        }]
                      }
                    }
                  }
                },
                {
                  class: 'ContributorField',
                  showHeader: true,
                  definition: {
                    name: 'contributor_data_manager',
                    required: true,
                    label: '@dmpt-people-tab-data-manager',
                    help: '@dmpt-people-tab-data-manager-help',
                    role: "@dmpt-people-tab-data-manager-role",
                    freeText: false,
                    vocabId: 'Parties AND repository_name:People',
                    sourceType: 'mint',
                    disabledExpression: '<%= !_.isEmpty(oid) %>',
                    fieldNames: [{
                      'text_full_name': 'text_full_name'
                    }, {
                      'full_name_honorific': 'text_full_name_honorific'
                    }, {
                      'email': 'Email[0]'
                    }],
                    searchFields: 'text_given_name,text_family_name,text_full_name,text_full_name_honorific',
                    titleFieldArr: ['text_full_name'],
                    titleFieldDelim: '',
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
                      },
                      'rdmpGetter': {
                        onValueUpdate: [{
                          action: 'utilityService.getPropertyFromObject',
                          field: 'contributor_data_manager'
                        }]
                      }
                    },
                    value: {name: '@user_name', email: '@user_email', username: '@user_username', text_full_name: '@user_name'}
                  },
                  variableSubstitutionFields: ['value.name', 'value.email', 'value.username', 'value.text_full_name']
                },
                {
                  class: 'RepeatableContributor',
                  compClass: 'RepeatableContributorComponent',
                  definition: {
                    name: "contributors",
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
                        label: '@dmpt-people-tab-contributors',
                        help: '@dmpt-people-tab-contributors-help',
                        role: "@dmpt-people-tab-contributors-role",
                        freeText: false,
                        vocabId: 'Parties AND repository_name:People',
                        sourceType: 'mint',
                        fieldNames: [{
                          'text_full_name': 'text_full_name'
                        }, {
                          'full_name_honorific': 'text_full_name_honorific'
                        }, {
                          'email': 'Email[0]'
                        }],
                        searchFields: 'text_given_name,text_family_name,text_full_name,text_full_name_honorific',
                        titleFieldArr: ['text_full_name'],
                        titleFieldDelim: '',
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
                      'rdmpGetter': {
                        onValueUpdate: [{
                          action: 'utilityService.getPropertyFromObject',
                          field: 'contributors'
                        }]
                      }
                    }
                  }
                },
                {
                  class: 'ContributorField',
                  showHeader: true,
                  definition: {
                    name: 'contributor_supervisor',
                    required: false,
                    label: '@dmpt-people-tab-supervisor',
                    help: '@dmpt-people-tab-supervisor-help',
                    role: "@dmpt-people-tab-supervisor-role",
                    freeText: false,
                    forceLookupOnly: true,
                    vocabId: 'Parties AND repository_name:People',
                    sourceType: 'mint',
                    fieldNames: [{
                      'text_full_name': 'text_full_name'
                    }, {
                      'full_name_honorific': 'text_full_name_honorific'
                    }, {
                      'email': 'Email[0]'
                    }],
                    searchFields: 'text_given_name,text_family_name,text_full_name,text_full_name_honorific',
                    titleFieldArr: ['text_full_name'],
                    titleFieldDelim: '',
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
                      },
                      'rdmpGetter': {
                        onValueUpdate: [{
                          action: 'utilityService.getPropertyFromObject',
                          field: 'contributor_supervisor'
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
              label: "@dataRecord-relationships-tab",
              fields: [{
                  class: 'Container',
                  compClass: 'TextBlockComponent',
                  definition: {
                    value: '@dataRecord-relationships-heading',
                    type: 'h3'
                  }
                },
                {
                  class: 'SelectionField',
                  compClass: 'DropdownFieldComponent',
                  definition: {
                    name: 'redbox:retentionPeriod_dc:date',
                    label: '@dmpt-redbox:retentionPeriod_dc:date',
                    help: '@dmpt-redbox:retentionPeriod_dc:date-help',
                    options: [{
                        value: "",
                        label: "@dmpt-select:Empty"
                      },
                      {
                        value: "1year",
                        label: "@dmpt-redbox:retentionPeriod_dc:date-1year"
                      },
                      {
                        value: "5years",
                        label: "@dmpt-redbox:retentionPeriod_dc:date-5years"
                      },
                      {
                        value: "7years",
                        label: "@dmpt-redbox:retentionPeriod_dc:date-7years"
                      },
                      {
                        value: "15years",
                        label: "@dmpt-redbox:retentionPeriod_dc:date-15years"
                      },
                      {
                        value: "20years",
                        label: "@dmpt-redbox:retentionPeriod_dc:date-20years"
                      },
                      {
                        value: "permanent",
                        label: "@dmpt-redbox:retentionPeriod_dc:date-permanent"
                      }
                    ],
                    required: true,
                    validationMessages: {
                      required: "@dmpt-redbox:retentionPeriod_dc:date-required"
                    },
                    subscribe: {
                      'rdmpGetter': {
                        onValueUpdate: [{
                          action: 'utilityService.getPropertyFromObject',
                          field: 'redbox:retentionPeriod_dc:date'
                        }]
                      }
                    }
                  }
                },
                {
                  class: 'SelectionField',
                  compClass: 'DropdownFieldComponent',
                  definition: {
                    name: 'redbox:retentionPeriod_dc:date_skos:note',
                    label: '@dataRecord:retentionPeriod_dc:date_skos:note',
                    options: [{
                        value: "",
                        label: "@dmpt-select:Empty"
                      },
                      {
                        value: "heritage",
                        label: "@dmpt-redbox:retentionPeriod_dc:date_skos:note-heritage"
                      },
                      {
                        value: "controversial",
                        label: "@dmpt-redbox:retentionPeriod_dc:date_skos:note-controversial"
                      },
                      {
                        value: "ofinterest",
                        label: "@dmpt-redbox:retentionPeriod_dc:date_skos:note-ofinterest"
                      },
                      {
                        value: "costly_impossible",
                        label: "@dmpt-redbox:retentionPeriod_dc:date_skos:note-costly_impossible"
                      },
                      {
                        value: "commercial",
                        label: "@dmpt-redbox:retentionPeriod_dc:date_skos:note-commercial"
                      }
                    ],
                    subscribe: {
                      'rdmpGetter': {
                        onValueUpdate: [{
                          action: 'utilityService.getPropertyFromObject',
                          field: 'redbox:retentionPeriod_dc:date_skos:note'
                        }]
                      }
                    }
                  }
                },
                {
                  class: 'DateTime',
                  definition: {
                    name: "disposalDate",
                    label: "@dataRecord-disposalDate",
                    help: '@dataRecord-disposalDate-help',
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
                                name: 'related_url',
                                label: '@dmpt-related-publication-url',
                                type: 'text',
                                groupName: 'related_publication',
                                groupClasses: 'width-30',
                                cssClasses : "width-80 form-control"
                              }
                            },
                            {
                              class: 'TextField',
                              definition: {
                                name: 'related_title',
                                label: '@dmpt-related-publication-title',
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
                                label: '@dmpt-related-publication-notes',
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
                    ]
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
              label: "@dataRecord-data-tab",
              fields: [{
                  class: 'Container',
                  compClass: 'TextBlockComponent',
                  definition: {
                    value: '@dataRecord-data-heading',
                    type: 'h3'
                  }
                },
                {
                  class: 'DataLocation',
                  compClass: 'DataLocationComponent',
                  definition: {
                    name:"dataLocations",
                    maxFileSize: 524288000
                  }
                },
                {
                  class: 'TextArea',
                  definition: {
                    name: 'software_equipment',
                    label: '@dataRecord-data-software',
                    type: 'text'
                  }
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
        fields: [
          {
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
              redirectLocation: '/@branding/@portal/dashboard/dataRecord'
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
