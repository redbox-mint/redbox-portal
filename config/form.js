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
              {
                class : "Container",
                editOnly: true,
                definition: {
                  id: "intro",
                  label : "Introduction",
                  active: true,
                  fields: [
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: 'Welcome to the Data Management Plan form',
                        type: 'h3'
                      }
                    },
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: 'Some text to introduce the user to the form would go here.'
                      }
                    }
                  ]
                }
              },
              {
                class : "Container",
                definition: {
                  id: "overview",
                  label : "Overview",
                  fields: [
                    {
                      class: 'TextField',
                      editOnly: true,
                      definition: {
                        name: 'raid',
                        label: 'RAID (if you already have one)',
                        type: 'text'
                      }
                    },
                   {
                     class: 'TextField',
                     editOnly: true,
                     definition: {
                       name: 'title',
                       label: 'Project Title',
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
                       label: 'Project Description',
                       rows: 10,
                       cols: 10
                     }
                   },
                   {
                     class: 'VocabField',
                     definition: {
                       name: 'institution',
                       label: "Institution",
                       vocabId: 'grid',
                       sourceType: 'collection',
                       "required" : true,
                       "validationMessages" : {
                           "required" : "Please select a valid value."
                       },
                       fieldNames: ['name', 'email_address', 'grid_id', 'wikipedia_url', 'established'],
                       searchFields: 'name',
                       titleFieldArr: ['name']
                     }
                   },
                   {
                     class: 'DateTime',
                     definition: {
                       name: "startDate",
                       label: "Start Date",
                       datePickerOpts: {format: 'dd/mm/yyyy', icon: 'fa fa-calendar'},
                       timePickerOpts: false,
                       hasClearButton: false,
                       valueFormat: 'YYYY-MM-DD',
                       displayFormat: 'L',
                       onChange: {setStartDate: ['endDate']}
                     }
                   },
                   {
                     class: 'DateTime',
                     definition: {
                       name: "endDate",
                       label: "End Date",
                       datePickerOpts: {format: 'dd/mm/yyyy', icon: 'fa fa-calendar'},
                       timePickerOpts: false,
                       hasClearButton: false,
                       valueFormat: 'YYYY-MM-DD',
                       displayFormat: 'L'
                     }
                   },
                   {
                    class: 'RepeatableContainer',
                    compClass: 'RepeatableVocabComponent',
                    definition: {
                      label: "Field of Research Codes",
                      name: "anzsrcFor",
                      forceClone: ['sourceData','completerService'],
                      fields: [
                        {
                          class: 'VocabField',
                          definition: {
                            vocabId: 'anzsrc-for',
                            "required" : true,
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
              {
                class : "Container",
                definition: {
                  id: "contributors",
                  label : "Contributors",
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
                editOnly: true,
                definition: {
                  id: "submit",
                  label : "Submit",
                  fields: [
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: "Some text explaining to the user that once they've completed the form and are satisfied with the values, they can push the record to the \"active\" state which represents that the project is currently under way and that a RAID will be generated for the activity."
                      }
                    },
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: "With future service provisioning functionality, some text explaining that process could go in here as well."
                      }
                    },
                    {
                      class: 'WorkflowStepButton',
                      definition: {
                        label: "Make the plan active",
                        cssClasses: "btn btn-primary",
                        isDisabledFn: 'isSaving',
                        targetStep: 'active'
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      ]
    },
    "default-1.0-active": {
      name: 'default-1.0-active',
      type: 'rdmp',
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
          class: 'LinkValueComponent',
          viewOnly: true,
          definition: {
            label: 'RAID',
            name: 'raid'
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
              {
                class : "Container",
                editOnly: true,
                definition: {
                  id: "intro",
                  label : "Introduction",
                  active: true,
                  fields: [
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: 'Welcome to the Data Management Plan form',
                        type: 'h3'
                      }
                    },
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: 'Some text to introduce the user to the form would go here.'
                      }
                    }
                  ]
                }
              },
              {
                class : "Container",
                definition: {
                  id: "overview",
                  label : "Overview",
                  fields: [
                   {
                      class : "TextField",
                      editOnly: true,
                      definition : {
                        "name" : "raid",
                        "label" : "RAID",
                        "type" : "text",
                        "readOnly" : true
                      }
                   },
                   {
                     class: 'TextField',
                     editOnly: true,
                     definition: {
                       name: 'title',
                       label: 'Project Title',
                       type: 'text',
                       required: true
                     }
                   },
                   {
                     class: 'TextArea',
                     editOnly: true,
                     definition: {
                       name: 'description',
                       label: 'Project Description',
                       rows: 10,
                       cols: 10
                     }
                   },
                   {
                     class: 'VocabField',
                     definition: {
                       name: 'institution',
                       label: "Institution",
                       vocabId: 'grid',
                       sourceType: 'collection',
                       "required" : true,
                       "validationMessages" : {
                           "required" : "Please select a valid value."
                       },
                       fieldNames: ['name', 'email_address', 'grid_id', 'wikipedia_url', 'established'],
                       searchFields: 'name',
                       titleFieldArr: ['name']
                     }
                   },
                   {
                     class: 'DateTime',
                     definition: {
                       name: "startDate",
                       label: "Start Date",
                       datePickerOpts: {format: 'dd/mm/yyyy', icon: 'fa fa-calendar'},
                       timePickerOpts: false,
                       hasClearButton: false,
                       valueFormat: 'YYYY-MM-DD',
                       displayFormat: 'L',
                       onChange: {setStartDate: ['endDate']}
                     }
                   },
                   {
                     class: 'DateTime',
                     definition: {
                       name: "endDate",
                       label: "End Date",
                       datePickerOpts: {format: 'dd/mm/yyyy', icon: 'fa fa-calendar'},
                       timePickerOpts: false,
                       hasClearButton: false,
                       valueFormat: 'YYYY-MM-DD',
                       displayFormat: 'L',
                     }
                   },
                   {
                    class: 'RepeatableContainer',
                    compClass: 'RepeatableVocabComponent',
                    definition: {
                      label: "Field of Research Codes",
                      name: "anzsrcFor",
                      forceClone: ['sourceData','completerService'],
                      fields: [
                        {
                          class: 'VocabField',
                          definition: {
                            vocabId: 'anzsrc-for',
                            required : true,
                            validationMessages: {
                              required: "Please select a valid value."
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
              {
                class : "Container",
                definition: {
                  id: "contributors",
                  label : "Contributors",
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
                editOnly: true,
                definition: {
                  id: "submit",
                  label : "Submit",
                  fields: [
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: "Some text explaining to the user that they can push the record to the \"retired\" state which represents that the project is inactive."
                      }
                    },
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: "With future service provisioning functionality, some text explaining that process could go in here as well."
                      }
                    },
                    {
                      class: 'WorkflowStepButton',
                      definition: {
                        label: "Retire the plan",
                        cssClasses: "btn btn-primary",
                        isDisabledFn: 'isSaving',
                        targetStep: 'retired'
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      ]
    },
    "default-1.0-retired": {
      name: 'default-1.0-retired',
      type: 'rdmp',
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
          class: 'LinkValueComponent',
          viewOnly: true,
          definition: {
            label: 'RAID',
            name: 'raid'
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
              {
                class : "Container",
                editOnly: true,
                definition: {
                  id: "intro",
                  label : "Introduction",
                  active: true,
                  fields: [
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: 'Welcome to the Data Management Plan form',
                        type: 'h3'
                      }
                    },
                    {
                      class: 'Container',
                      compClass: 'TextBlockComponent',
                      definition: {
                        value: 'Some text to introduce the user to the form would go here.'
                      }
                    }
                  ]
                }
              },
              {
                class : "Container",
                definition: {
                  id: "overview",
                  label : "Overview",
                  fields: [
                   {
                      class : "TextField",
                      editOnly: true,
                      definition : {
                        "name" : "raid",
                        "label" : "RAID",
                        "type" : "text",
                        "readOnly" : true
                      }
                   },
                   {
                     class: 'TextField',
                     editOnly: true,
                     definition: {
                       name: 'title',
                       label: 'Project Title',
                       type: 'text',
                       required: true
                     }
                   },
                   {
                     class: 'TextArea',
                     editOnly: true,
                     definition: {
                       name: 'description',
                       label: 'Project Description',
                       rows: 10,
                       cols: 10
                     }
                   },
                   {
                     class: 'VocabField',
                     definition: {
                       name: 'institution',
                       label: "Institution",
                       vocabId: 'grid',
                       sourceType: 'collection',
                       "required" : true,
                       "validationMessages" : {
                           "required" : "Please select a valid value."
                       },
                       fieldNames: ['name', 'email_address', 'grid_id', 'wikipedia_url', 'established'],
                       searchFields: 'name',
                       titleFieldArr: ['name']
                     }
                   },
                   {
                     class: 'DateTime',
                     definition: {
                       name: "startDate",
                       label: "Start Date",
                       datePickerOpts: {format: 'dd/mm/yyyy', icon: 'fa fa-calendar'},
                       timePickerOpts: false,
                       hasClearButton: false,
                       valueFormat: 'YYYY-MM-DD',
                       displayFormat: 'L',
                       onChange: {setStartDate: ['endDate']}
                     }
                   },
                   {
                     class: 'DateTime',
                     definition: {
                       name: "endDate",
                       label: "End Date",
                       datePickerOpts: {format: 'dd/mm/yyyy', icon: 'fa fa-calendar'},
                       timePickerOpts: false,
                       hasClearButton: false,
                       valueFormat: 'YYYY-MM-DD',
                       displayFormat: 'L'
                     }
                   },
                   {
                    class: 'RepeatableContainer',
                    compClass: 'RepeatableVocabComponent',
                    definition: {
                      label: "Field of Research Codes",
                      name: "anzsrcFor",
                      forceClone: ['sourceData','completerService'],
                      fields: [
                        {
                          class: 'VocabField',
                          definition: {
                            vocabId: 'anzsrc-for',
                            "required" : true,
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
              {
                class : "Container",
                definition: {
                  id: "contributors",
                  label : "Contributors",
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
              }
            ]
          }
        }
      ]
    }
  }
};
