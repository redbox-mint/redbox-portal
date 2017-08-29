/**
* Form related configuration
*/
module.exports.form = {
  defaultForm: "default-1.0-draft",
  forms: {
    "default-1.0-draft": {
      name: 'default-1.0-draft',
      type: 'rdmp',
      skipValidationOnSave: true,
      editCssClasses: 'row col-md-12',
      viewCssClasses: 'row col-md-offset-1 col-md-10',
      messages: {
        "saving": "Saving, please wait...",
        "validationFail": "There are validation issues in the form, please check for error messages within each tab(s).",
        "saveSuccess": "Saved successfully.",
        "saveError": "Error while saving: "
      },
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
          class: "AnchorOrButton",
          viewOnly: true,
          definition: {
            label: 'Edit this plan',
            value: '/@branding/@portal/record/edit/@oid',
            cssClasses: 'btn btn-large btn-info margin-15',
            showPencil: true,
            controlType: 'anchor'
          }
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
            fields: [
              // -------------------------------------------------------------------
              // Welcome Tab
              // -------------------------------------------------------------------
              {
                class : "Container",
                editOnly: true,
                definition: {
                  id: "welcome",
                  label : "@dmpt-welcome-tab",
                  active: true,
                  fields: [
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: '@dmpt-welcome-heading',
                        type: 'h3'
                      }
                    },
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: '@dmpt-welcome-par1'
                      }
                    },
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: '@dmpt-welcome-par2'
                      }
                    },
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: '@dmpt-welcome-par3'
                      }
                    },
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: '@dmpt-welcome-par4'
                      }
                    }
                  ]
                }
              },
              // -------------------------------------------------------------------
              // Project Tab
              // -------------------------------------------------------------------
              {
                class : "Container",
                definition: {
                  id: "project",
                  label : "@dmpt-project-tab",
                  fields: [
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: '@dmpt-project-heading',
                        type: 'h3'
                      }
                    },
                    {
                      class: 'TextField',
                      editOnly: true,
                      definition: {
                        name: 'title',
                        label: '@dmpt-project-title',
                        help: '@dmpt-project-title-help',
                        type: 'text',
                        required: true
                      }
                    },
                    {
                      class: 'TextField',
                      editOnly: true,
                      definition: {
                        name: 'dc:identifier',
                        label: '@dmpt-project-id',
                        help: '@dmpt-project-id-help',
                        type: 'text',
                        required: true
                      }
                    },
                    {
                      class: 'TextArea',
                      compClass: 'TextAreaComponent',
                      editOnly: true,
                      definition: {
                        name: 'description',
                        label: '@dmpt-project-desc',
                        help: '@dmpt-project-desc-help',
                        rows: 10,
                        cols: 10,
                        required:true
                      }
                    },
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        type: 'hr'
                      }
                    },
                    {
                    class: 'RepeatableContainer',
                    compClass: 'RepeatableTextfieldComponent',
                      definition: {
                        label: "@dmpt-finalKeywords",
                        help: "@dmpt-finalKeywords-help",
                        name: "finalKeywords",
                        editOnly: true,
                        fields: [
                          {
                            class: 'TextField',
                            definition: {
                              type: 'text'
                            }
                          }
                        ]
                      }
                    },
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        type: 'hr'
                      }
                    },
                    {
                      class: 'TextField',
                        definition: {
                          name: 'dc:relation.bibo:Website',
                          label: '@dmpt-project-website',
                          help: '@dmpt-project-website-help',
                          type: 'text'
                      }
                    },
                    {
                      class: 'DateTime',
                        definition: {
                         name: "dc:coverage.vivo:DateTimeInterval.vivo:start",
                         label: "@dmpt-project-startdate",
                         help: '@dmpt-project-startdate-help',
                         datePickerOpts: {format: 'dd/mm/yyyy', icon: 'fa fa-calendar'},
                         timePickerOpts: false,
                         hasClearButton: false,
                         valueFormat: 'YYYY-MM-DD',
                         displayFormat: 'L',
                         onChange: {setStartDate: ['dc:coverage.vivo:DateTimeInterval.vivo:end']}
                        }
                    },
                    {
                    class: 'DateTime',
                      definition: {
                       name: "dc:coverage.vivo:DateTimeInterval.vivo:end",
                       label: "@dmpt-project-enddate",
                       help: '@dmpt-project-enddate-help',
                       datePickerOpts: {format: 'dd/mm/yyyy', icon: 'fa fa-calendar'},
                       timePickerOpts: false,
                       hasClearButton: false,
                       valueFormat: 'YYYY-MM-DD',
                       displayFormat: 'L'
                      }
                    },
                    {
                      class: 'SelectionField',
                      compClass: 'DropdownFieldComponent',
                      definition: {
                       name: 'dc:subject.anzsrc:toa.rdf:resource',
                       label: '@dmpt-project-activity-type',
                       help: '@dmpt-project-activity-type-help',
                       options: [
                         { value: "pure", label: "@dmpt-activity-type-pure" },
                         { value: "strategic", label: "@dmpt-activity-type-strategic"},
                         { value: "applied", label: "@dmpt-activity-type-applied"},
                         { value: "experimental", label: "@dmpt-activity-type-experimental"}
                       ]
                      }
                    },
                    {
                    class: 'RepeatableContainer',
                    compClass: 'RepeatableVocabComponent',
                      definition: {
                        label: "@dmpt-project-anzsrcFor",
                        help: "@dmpt-project-anzsrcFor-help",
                        name: "dc:subject.anzsrc:for",
                        forceClone: ['sourceData','completerService'],
                        fields: [
                          {
                            class: 'VocabField',
                            definition: {
                              vocabId: 'anzsrc-for',
                              "validationMessages" : {
                                  "required" : "Please select a valid value."
                              },
                              fieldNames: ['uri', 'label', 'notation'],
                              searchFields: 'notation,label',
                              titleFieldArr: ['notation', 'label']
                            }
                          }
                        ]
                      }
                    },
                    {
                     class: 'RepeatableContainer',
                     compClass: 'RepeatableVocabComponent',
                     definition: {
                       label: "@dmpt-project-anzsrcSeo",
                       help: "@dmpt-project-anzsrcSeo-help",
                       name: "dc:subject.anzsrc:seo",
                       forceClone: ['sourceData','completerService'],
                       fields: [
                         {
                           class: 'VocabField',
                           definition: {
                             vocabId: 'anzsrc-seo',
                             "validationMessages" : {
                                 "required" : "Please select a valid value."
                             },
                             fieldNames: ['uri', 'label', 'notation'],
                             searchFields: 'notation,label',
                             titleFieldArr: ['notation', 'label']
                           }
                         }
                       ]
                     }
                    }
                  ]
                }
              },
              // -------------------------------------------------------------------
              // People Tab
              // -------------------------------------------------------------------
              {
                class : "Container",
                definition: {
                  id: "people",
                  label : "@dmpt-people-tab",
                  fields: [
                    {
                     class: 'RepeatableContainer',
                     compClass: 'RepeatableContributorComponent',
                     definition: {
                       name: "contributors",
                       skipClone: ['showHeader'],
                       fields: [
                         {
                           class: 'ContributorField',
                           showHeader:true,
                           definition: {
                             required: true,
                             roles: [
                               "Chief Investigator",
                               "Data manager",
                               "Collaborator",
                               "Supervisor"
                             ],
                             validationMessages: {
                               required: {
                                 email: 'Email required',
                                 name: 'Name required',
                                 role: 'Select a role'
                               },
                               invalid: {
                                 email: 'Invalid email format'
                               }
                             }
                           }
                         }
                       ]
                     }
                    }
                  ]
                }
              },
              {
                class : "Container",
                definition: {
                  id: "dataCollection",
                  label : "@dmpt-data-collection-tab",
                  fields: [
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: '@dmpt-data-collection-heading',
                        type: 'h3'
                      }
                    },
                    {
                      class: 'TextArea',
                      compClass: 'TextAreaComponent',
                      definition: {
                        name: 'vivo:Dataset.redbox:DataCollectionMethodology',
                        label: '@dmpt-data-collection-methodology',
                        help: '@dmpt-data-collection-methodology-help',
                        rows: 5,
                        columns: 10,
                        required: true,
                        validationMessages: {
                          required: "@dmpt-data-collection-methodology-required"
                        }
                      }
                    },
                    {
                      class: 'TextArea',
                      compClass: 'TextAreaComponent',
                      definition: {
                        name: 'vivo:Dataset.dc.format',
                        label: '@dmpt-vivo:Dataset.dc.format',
                        help: '@dmpt-vivo:Dataset.dc.format-help',
                        rows: 5,
                        columns: 10,
                        required: true,
                        validationMessages: {
                          required: "@dmpt-vivo:Dataset.dc.format-required"
                        }
                      }
                    },
                    {
                      class: 'TextArea',
                      compClass: 'TextAreaComponent',
                      definition: {
                        name: 'vivo:Dataset.redbox:DataCollectionResources',
                        label: '@dmpt-vivo:Dataset.redbox:DataCollectionResources',
                        help: '@dmpt-vivo:Dataset.redbox:DataCollectionResources-help',
                        rows: 5,
                        columns: 10
                      }
                    },
                    {
                      class: 'TextArea',
                      compClass: 'TextAreaComponent',
                      definition: {
                        name: 'vivo:Dataset.redbox:DataAnalysisResources',
                        label: '@dmpt-vivo:Dataset.redbox:DataAnalysisResources',
                        help: '@dmpt-vivo:Dataset.redbox:DataAnalysisResources-help',
                        rows: 5,
                        columns: 10
                      }
                    },
                    {
                      class: 'TextArea',
                      compClass: 'TextAreaComponent',
                      definition: {
                        name: 'vivo:Dataset.redbox:MetadataStandard',
                        label: '@dmpt-vivo:Dataset.redbox:MetadataStandard',
                        help: '@dmpt-vivo:Dataset.redbox:MetadataStandard-help',
                        rows: 5,
                        columns: 10
                      }
                    },
                    {
                      class: 'TextArea',
                      compClass: 'TextAreaComponent',
                      definition: {
                        name: 'vivo:Dataset.redbox:DataStructureStandard',
                        label: '@dmpt-vivo:Dataset.redbox:DataStructureStandard',
                        help: '@dmpt-vivo:Dataset.redbox:DataStructureStandard-help',
                        rows: 5,
                        columns: 10
                      }
                    }
                  ]
                }
              },
              // -------------------------------------------------------------------
              // Storage Tab
              // -------------------------------------------------------------------
              {
                class : "Container",
                definition: {
                  id: "storage",
                  label : "@dmpt-storage-tab",
                  fields: [
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: '@dmpt-storage-heading',
                        type: 'h3'
                      }
                    },
                    {
                      class: 'SelectionField',
                      compClass: 'DropdownFieldComponent',
                      definition: {
                        name: 'vivo:Dataset.dc:extent',
                        label: '@dmpt-vivo:Dataset.dc:extent',
                        help: '@dmpt-vivo:Dataset.dc:extent-help',
                        options: [
                          { value: "@dmpt-vivo:Dataset.dc:extent-less-than-10GB", label: "@dmpt-vivo:Dataset.dc:extent-less-than-10GB" },
                          { value: "@dmpt-vivo:Dataset.dc:extent-10-20GB", label: "@dmpt-vivo:Dataset.dc:extent-10-20GB"},
                          { value: "@dmpt-vivo:Dataset.dc:extent-20-100GB", label: "@dmpt-vivo:Dataset.dc:extent-20-100GB"},
                          { value: "@dmpt-vivo:Dataset.dc:extent-more-than-100GB", label: "@dmpt-vivo:Dataset.dc:extent-more-than-100GB"}
                        ],
                        required: true,
                        validationMessages: {
                          required: "@dmpt-vivo:Dataset.dc:extent-required"
                        }
                      }
                    },
                    {
                      class: 'SelectionField',
                      compClass: 'DropdownFieldComponent',
                      definition: {
                        name: 'vivo:Dataset.dc:location.rdf:PlainLiteral',
                        label: '@dmpt-vivo:Dataset.dc:location.rdf:PlainLiteral',
                        help: '@dmpt-vivo:Dataset.dc:location.rdf:PlainLiteral-help',
                        options: [
                          { value: "@dmpt-vivo:Dataset.dc:location.rdf:PlainLiteral-personal", label: "@dmpt-vivo:Dataset.dc:location.rdf:PlainLiteral-personal" },
                          { value: "@dmpt-vivo:Dataset.dc:location.rdf:PlainLiteral-shared", label: "@dmpt-vivo:Dataset.dc:location.rdf:PlainLiteral-shared"},
                          { value: "@dmpt-vivo:Dataset.dc:location.rdf:PlainLiteral-uni", label: "@dmpt-vivo:Dataset.dc:location.rdf:PlainLiteral-uni"},
                          { value: "@dmpt-vivo:Dataset.dc:location.rdf:PlainLiteral-other", label: "@dmpt-vivo:Dataset.dc:location.rdf:PlainLiteral-other"}
                        ],
                        required: true,
                        validationMessages: {
                          required: "@dmpt-vivo:Dataset.dc:location.rdf:PlainLiteral-required"
                        }
                      }
                    },
                    {
                      class: 'TextArea',
                      compClass: 'TextAreaComponent',
                      definition: {
                        name: 'vivo:Dataset.dc:location.skos:note',
                        label: '@dmpt-vivo:Dataset.dc:location.skos:note',
                        rows: 5,
                        columns: 10
                      }
                    },
                    {
                      class: 'SelectionField',
                      compClass: 'DropdownFieldComponent',
                      definition: {
                        name: 'vivo:Dataset.dc:source.dc:location.rdf:PlainLiteral',
                        label: '@dmpt-vivo:Dataset.dc:source.dc:location.rdf:PlainLiteral',
                        help: '@dmpt-vivo:Dataset.dc:source.dc:location.rdf:PlainLiteral-help',
                        options: [
                          { value: "@dmpt-vivo:Dataset.dc:source.dc:location.rdf:PlainLiteral-personal", label: "@dmpt-vivo:Dataset.dc:source.dc:location.rdf:PlainLiteral-personal" },
                          { value: "@dmpt-vivo:Dataset.dc:source.dc:location.rdf:PlainLiteral-shared", label: "@dmpt-vivo:Dataset.dc:source.dc:location.rdf:PlainLiteral-shared"},
                          { value: "@dmpt-vivo:Dataset.dc:source.dc:location.rdf:PlainLiteral-uni", label: "@dmpt-vivo:Dataset.dc:source.dc:location.rdf:PlainLiteral-uni"},
                          { value: "@dmpt-vivo:Dataset.dc:source.dc:location.rdf:PlainLiteral-other", label: "@dmpt-vivo:Dataset.dc:source.dc:location.rdf:PlainLiteral-other"}
                        ],
                        required: true,
                        validationMessages: {
                          required: "@dmpt-vivo:Dataset.dc:source.dc:location.rdf:PlainLiteral-required"
                        }
                      }
                    },
                    {
                      class: 'TextArea',
                      compClass: 'TextAreaComponent',
                      definition: {
                        name: 'vivo:Dataset.dc:source.dc:location.skos:note',
                        label: '@dmpt-vivo:Dataset.dc:location.skos:note',
                        rows: 5,
                        columns: 10
                      }
                    }
                  ]
                }
              },
              // -------------------------------------------------------------------
              // Retention Tab
              // -------------------------------------------------------------------
              {
                class : "Container",
                definition: {
                  id: "retention",
                  label : "@dmpt-retention-tab",
                  fields: [
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: '@dmpt-retention-heading',
                        type: 'h3'
                      }
                    },
                    {
                      class: 'SelectionField',
                      compClass: 'DropdownFieldComponent',
                      definition: {
                        name: 'redbox:retentionPeriod.dc:date',
                        label: '@dmpt-redbox:retentionPeriod.dc:date',
                        help: '@dmpt-redbox:retentionPeriod.dc:date-help',
                        options: [
                          { value: "1year", label: "@dmpt-redbox:retentionPeriod.dc:date-1year" },
                          { value: "5years", label: "@dmpt-redbox:retentionPeriod.dc:date-5years"},
                          { value: "7years", label: "@dmpt-redbox:retentionPeriod.dc:date-7years"},
                          { value: "15years", label: "@dmpt-redbox:retentionPeriod.dc:date-15years"},
                          { value: "permanent", label: "@dmpt-redbox:retentionPeriod.dc:date-permanent"}
                        ],
                        required: true,
                        validationMessages: {
                          required: "@dmpt-redbox:retentionPeriod.dc:date-required"
                        }
                      }
                    },
                    {
                      class: 'SelectionField',
                      compClass: 'DropdownFieldComponent',
                      definition: {
                        name: 'redbox:retentionPeriod.dc:date.skos:note',
                        label: '@dmpt-redbox:retentionPeriod.dc:date.skos:note',
                        options: [
                          { value: "heritage", label: "@dmpt-redbox:retentionPeriod.dc:date.skos:note-heritage" },
                          { value: "controversial", label: "@dmpt-redbox:retentionPeriod.dc:date.skos:note-controversial"},
                          { value: "ofinterest", label: "@dmpt-redbox:retentionPeriod.dc:date.skos:note-ofinterest"},
                          { value: "costly_impossible", label: "@dmpt-redbox:retentionPeriod.dc:date.skos:note-costly_impossible"},
                          { value: "commercial", label: "@dmpt-redbox:retentionPeriod.dc:date.skos:note-commercial"}
                        ]
                      }
                    },
                    {
                      class: 'DateTime',
                      definition: {
                        name: "redbox:disposalDate",
                        label: "@dmpt-redbox:disposalDate",
                        help: '@dmpt-redbox:disposalDate-help',
                        datePickerOpts: {format: 'dd/mm/yyyy', icon: 'fa fa-calendar'},
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
              // Ownership Tab
              // -------------------------------------------------------------------
              {
                class : "Container",
                definition: {
                  id: "ownership",
                  label : "@dmpt-ownership-tab",
                  fields: [
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: '@dmpt-ownership-heading',
                        type: 'h3'
                      }
                    },
                    {
                      class: 'SelectionField',
                      compClass: 'DropdownFieldComponent',
                      definition: {
                        name: 'dc:rightsHolder.dc:name',
                        label: '@dmpt-dc:rightsHolder.dc:name',
                        help: '@dmpt-dc:rightsHolder.dc:name-help',
                        options: [
                          { value: "myUni", label: "@dmpt-dc:rightsHolder.dc:name-myUni" },
                          { value: "myUnjount", label: "@dmpt-dc:rightsHolder.dc:name-myUnjount"},
                          { value: "student", label: "@dmpt-dc:rightsHolder.dc:name-student"}
                        ],
                        required: true,
                        validationMessages: {
                          required: "@dmpt-dc:rightsHolder.dc:name-required"
                        }
                      }
                    },
                    {
                      class: 'TextArea',
                      compClass: 'TextAreaComponent',
                      definition: {
                        name: 'dc:rightsHolder.dc:description',
                        label: '@dmpt-dc:rightsHolder.dc:description',
                        help: '@dmpt-dc:rightsHolder.dc:description-help',
                        rows: 5,
                        columns: 10
                      }
                    },
                    {
                      class: 'TextArea',
                      compClass: 'TextAreaComponent',
                      definition: {
                        name: 'redbox:ContractualObligations',
                        label: '@dmpt-redbox:ContractualObligations',
                        help: '@dmpt-redbox:ContractualObligations-help',
                        rows: 5,
                        columns: 10
                      }
                    },
                    {
                    class: 'RepeatableContainer',
                    compClass: 'RepeatableTextfieldComponent',
                      definition: {
                        label: "@dmpt-dc:coverage.dc:identifier",
                        help: "@dmpt-dc:coverage.dc:identifier-help",
                        name: "dc:coverage.dc:identifier",
                        editOnly: true,
                        fields: [
                          {
                            class: 'TextField',
                            definition: {
                              type: 'text'
                            }
                          }
                        ]
                      }
                    }
                  ]
                }
              },
              // -------------------------------------------------------------------
              // Licensing Tab
              // -------------------------------------------------------------------
              {
                class : "Container",
                definition: {
                  id: "licensing",
                  label : "@dmpt-licensing-tab",
                  fields: [
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: '@dmpt-licensing-heading',
                        type: 'h3'
                      }
                    },
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: '@dmpt-licensing-access',
                        type: 'h4'
                      }
                    },
                    {
                      class: 'SelectionField',
                      compClass: 'SelectionFieldComponent',
                      definition: {
                        name: 'dc:accessRights',
                        label: '@dmpt-dc:accessRights',
                        help: '@dmpt-dc:accessRights-help',
                        defaultValue: '@dmpt-dc:accessRights-manager',
                        controlType: 'radio',
                        options: [
                          { value: "@dmpt-dc:accessRights-manager", label: "@dmpt-dc:accessRights-manager"},
                          { value: "@dmpt-dc:accessRights-open", label: "@dmpt-dc:accessRights-open"},
                          { value: "@dmpt-dc:accessRights-none-val", label: "@dmpt-dc:accessRights-none"}
                        ],
                        required: true
                      }
                    },
                    {
                      class: 'TextField',
                      definition: {
                        name: 'dataLicensingAccess.manager',
                        label: '@dmpt-dataLicensingAccess.manager',
                        type: 'text'
                      }
                    },
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        type: 'hr'
                      }
                    },
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: '@dmpt-licensing-licensing',
                        type: 'h4'
                      }
                    },
                    {
                      class: 'SelectionField',
                      compClass: 'DropdownFieldComponent',
                      definition: {
                        name: 'dc:license.dc:identifier',
                        label: '@dmpt-dc:license.dc:identifier',
                        help: '@dmpt-dc:license.dc:identifier-help',
                        options: [
                          { value: "http://creativecommons.org/licenses/by/3.0/au", label: "@dmpt-dc:license.dc:identifier-1" },
                          { value: "http://creativecommons.org/licenses/by-sa/3.0/au", label: "@dmpt-dc:license.dc:identifier-2"},
                          { value: "http://creativecommons.org/licenses/by-nd/3.0/au", label: "@dmpt-dc:license.dc:identifier-3"},
                          { value: "http://creativecommons.org/licenses/by-nc/3.0/au", label: "@dmpt-dc:license.dc:identifier-4"},
                          { value: "http://creativecommons.org/licenses/by-nc-sa/3.0/au", label: "@dmpt-dc:license.dc:identifier-5"},
                          { value: "http://creativecommons.org/licenses/by-nc-nd/3.0/au", label: "@dmpt-dc:license.dc:identifier-6" },
                          { value: "http://creativecommons.org/licenses/by/4.0", label: "@dmpt-dc:license.dc:identifier-7" },
                          { value: "http://creativecommons.org/licenses/by-sa/4.0", label: "@dmpt-dc:license.dc:identifier-8" },
                          { value: "http://creativecommons.org/licenses/by-nd/4.0", label: "@dmpt-dc:license.dc:identifier-9" },
                          { value: "http://creativecommons.org/licenses/by-nc/4.0", label: "@dmpt-dc:license.dc:identifier-10" },
                          { value: "http://creativecommons.org/licenses/by-nc-sa/4.0", label: "@dmpt-dc:license.dc:identifier-11" },
                          { value: "http://creativecommons.org/licenses/by-nc-nd/4.0", label: "@dmpt-dc:license.dc:identifier-12" },
                          { value: "http://opendatacommons.org/licenses/pddl/1.0/", label: "@dmpt-dc:license.dc:identifier-13" },
                          { value: "http://opendatacommons.org/licenses/by/1.0/", label: "@dmpt-dc:license.dc:identifier-14" },
                          { value: "http://opendatacommons.org/licenses/odbl/1.0/", label: "@dmpt-dc:license.dc:identifier-15" },
                        ]
                      }
                    },
                    {
                      class: 'TextField',
                      definition: {
                        name: 'dc:license.dc:identifier.other',
                        label: '@dmpt-dc:license.dc:identifier.other',
                        type: 'text'
                      }
                    },
                    {
                      class: 'TextField',
                      definition: {
                        name: 'dc:license.dc:identifier.url',
                        label: '@dmpt-dc:license.dc:identifier.url',
                        type: 'text'
                      }
                    },
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        type: 'hr'
                      }
                    },
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: '@dmpt-licensing-rights',
                        type: 'h4'
                      }
                    },
                    {
                      class: 'TextArea',
                      compClass: 'TextAreaComponent',
                      definition: {
                        name: 'dc:RightsStatement',
                        label: '@dmpt-dc:RightsStatement',
                        help: '@dmpt-dc:RightsStatement-help',
                        rows: 5,
                        columns: 10
                      }
                    },
                    {
                      class: 'TextArea',
                      compClass: 'TextAreaComponent',
                      definition: {
                        name: 'dc:rights.skos:note',
                        label: '@dmpt-dc:rights.skos:note',
                        help: '@dmpt-dc:rights.skos:note-help',
                        rows: 5,
                        columns: 10
                      }
                    }
                  ]
                }
              },
              // -------------------------------------------------------------------
              // Ethics Tab
              // -------------------------------------------------------------------
              {
                class : "Container",
                definition: {
                  id: "ethics",
                  label : "@dmpt-ethics-tab",
                  fields: [
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: '@dmpt-ethics-heading',
                        type: 'h3'
                      }
                    },
                    {
                      class: 'TextField',
                      definition: {
                        name: 'agls:policy.dc:identifier',
                        label: '@dmpt-agls:policy.dc:identifier',
                        help: '@dmpt-agls:policy.dc:identifier-help',
                        type: 'text'
                      }
                    },
                    {
                      class: 'TextArea',
                      compClass: 'TextAreaComponent',
                      definition: {
                        name: 'agls:policy.skos:note',
                        label: '@dmpt-agls:policy.skos:note',
                        help: '@dmpt-agls:policy.skos:note-help',
                        rows: 5,
                        columns: 10
                      }
                    },
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: '@dmpt-etchics-sensitivities-heading',
                        type: 'h4'
                      }
                    },
                    {
                      class: 'SelectionField',
                      compClass: 'SelectionFieldComponent',
                      definition: {
                        name: 'agls:protectiveMarking.dc:type',
                        label: '@dmpt-agls:protectiveMarking.dc:type',
                        help: '@dmpt-agls:protectiveMarking.dc:type-help',
                        controlType: 'checkbox',
                        options: [
                          { value: "agls:protectiveMarking.dc:type.redbox:CommerciallySensitive", label: "@dmpt-agls:protectiveMarking.dc:type-commercial"},
                          { value: "agls:protectiveMarking.dc:type.redbox:CulturallySensitive", label: "@dmpt-agls:protectiveMarking.dc:type-cultural"},
                          { value: "agls:protectiveMarking.dc:type.redbox:SecurityClassified", label: "@dmpt-agls:protectiveMarking.dc:type-security"},
                          { value: "agls:protectiveMarking.dc:type.redbox:NonPublic", label: "@dmpt-agls:protectiveMarking.dc:type-nonPublic"}
                        ]
                      }
                    },
                    {
                      class: 'TextArea',
                      compClass: 'TextAreaComponent',
                      definition: {
                        name: 'agls:protectiveMarking.skos:note',
                        label: '@dmpt-agls:protectiveMarking.skos:note',
                        help: '@dmpt-agls:protectiveMarking.skos:note-help',
                        rows: 5,
                        columns: 10
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
  }
};
