
import {FormConfigFrame} from "@researchdatabox/sails-ng-common";
const formConfig: FormConfigFrame = {
  "name": "v4FormConfig",
  "enabledValidationGroups": [
    "all"
  ],
  "validators": [],
  "validationGroups": {
    "all": {
      "description": "Validate all fields with validators.",
      "initialMembership": "all"
    },
    "none": {
      "description": "Validate none of the fields.",
      "initialMembership": "none"
    }
  },
  "componentDefinitions": [
    {
      "name": "citation",
      "constraints": {
        "authorization": {
          "allowRoles": []
        },
        "allowModes": []
      },
      "component": {
        "class": "GroupComponent",
        "config": {
          "readonly": false,
          "visible": true,
          "editMode": true,
          "label": "@dataPublication-citation-tab",
          "disabled": false,
          "autofocus": false,
          "componentDefinitions": [
            {
              "name": "ContentComponent-fields-0-definition-fields-0",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "ContentComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "disabled": false,
                  "autofocus": false,
                  "template": "<span role=\"heading\" aria-level=\"3\">{{content}}</span>",
                  "content": "@dataPublication-citation-tab-heading"
                }
              },
              "layout": {
                "class": "DefaultLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false
                }
              }
            },
            {
              "name": "citation_doi",
              "constraints": {
                "authorization": {
                  "allowRoles": [
                    "Admin",
                    "Librarians"
                  ]
                },
                "allowModes": [
                  "edit"
                ]
              },
              "component": {
                "class": "SimpleInputComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dataPublication-citation-identifier",
                  "disabled": false,
                  "autofocus": false,
                  "type": "text"
                }
              },
              "model": {
                "class": "SimpleInputModel",
                "config": {
                  "validators": []
                }
              },
              "layout": {
                "class": "DefaultLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dataPublication-citation-identifier",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false
                }
              }
            },
            {
              "name": "citation_doi",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": [
                  "view"
                ]
              },
              "component": {
                "class": "SimpleInputComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dataPublication-citation-identifier",
                  "disabled": false,
                  "autofocus": false,
                  "type": "text"
                }
              },
              "model": {
                "class": "SimpleInputModel",
                "config": {
                  "validators": []
                }
              },
              "layout": {
                "class": "DefaultLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dataPublication-citation-identifier",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false
                }
              }
            },
            {
              "name": "requestIdentifier",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": [
                  "edit"
                ]
              },
              "component": {
                "class": "CheckboxInputComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "requestIdentifier",
                  "disabled": false,
                  "autofocus": false,
                  "options": [
                    {
                      "label": "@dataPublication-citation-request-identifier",
                      "value": "request"
                    }
                  ]
                }
              },
              "model": {
                "class": "CheckboxInputModel",
                "config": {
                  "validators": []
                }
              },
              "layout": {
                "class": "DefaultLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false
                }
              }
            },
            {
              "name": "finalIdentifiers",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "RepeatableComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dataPublication-identifiers",
                  "disabled": false,
                  "autofocus": false,
                  "elementTemplate": {
                    "name": "",
                    "constraints": {
                      "authorization": {
                        "allowRoles": []
                      },
                      "allowModes": []
                    },
                    "component": {
                      "class": "SimpleInputComponent",
                      "config": {
                        "readonly": false,
                        "visible": true,
                        "editMode": true,
                        "disabled": false,
                        "autofocus": false,
                        "type": "text"
                      }
                    },
                    "model": {
                      "class": "SimpleInputModel",
                      "config": {
                        "validators": []
                      }
                    },
                    "layout": {
                      "class": "RepeatableElementLayout",
                      "config": {
                        "readonly": false,
                        "visible": true,
                        "editMode": true,
                        "disabled": false,
                        "autofocus": false,
                        "labelRequiredStr": "*",
                        "cssClassesMap": {},
                        "helpTextVisibleOnInit": false,
                        "helpTextVisible": false
                      }
                    }
                  }
                }
              },
              "model": {
                "class": "RepeatableModel",
                "config": {
                  "validators": []
                }
              },
              "layout": {
                "class": "DefaultLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dataPublication-identifiers",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "helpText": "@dataPublication-identifiers-help",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false
                }
              }
            },
            {
              "name": "citation_title",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "SimpleInputComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dataPublication-citation-title",
                  "disabled": false,
                  "autofocus": false,
                  "type": "text"
                }
              },
              "model": {
                "class": "SimpleInputModel",
                "config": {
                  "validators": [
                    {
                      "class": "required"
                    }
                  ]
                }
              },
              "layout": {
                "class": "DefaultLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dataPublication-citation-title",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "helpText": "@dataPublication-citation-title-help",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false
                }
              }
            },
            {
              "name": "creators",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "RepeatableComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "creators",
                  "disabled": false,
                  "autofocus": false,
                  "elementTemplate": {
                    "name": "",
                    "constraints": {
                      "authorization": {
                        "allowRoles": []
                      },
                      "allowModes": []
                    },
                    "overrides": {
                      "reusableFormName": "standard-contributor-fields-group"
                    },
                    "component": {
                      "class": "ReusableComponent",
                      "config": {
                        "readonly": false,
                        "visible": true,
                        "editMode": true,
                        "label": "@dataPublication-creators",
                        "disabled": false,
                        "autofocus": false,
                        "componentDefinitions": [
                          {
                            "name": "standard_contributor_fields_group",
                            "constraints": {
                              "authorization": {
                                "allowRoles": []
                              },
                              "allowModes": []
                            },
                            "overrides": {
                              "replaceName": ""
                            },
                            "component": {
                              "class": "GroupComponent",
                              "config": {
                                "readonly": false,
                                "visible": true,
                                "editMode": true,
                                "label": "@dataPublication-creators",
                                "disabled": false,
                                "autofocus": false,
                                "componentDefinitions": []
                              }
                            },
                            "model": {
                              "class": "GroupModel",
                              "config": {
                                "validators": []
                              }
                            },
                            "layout": {
                              "class": "DefaultLayout",
                              "config": {
                                "readonly": false,
                                "visible": true,
                                "editMode": true,
                                "label": "@dataPublication-creators",
                                "disabled": false,
                                "autofocus": false,
                                "labelRequiredStr": "*",
                                "helpText": "@dataPublication-creators-help",
                                "cssClassesMap": {},
                                "helpTextVisibleOnInit": false,
                                "helpTextVisible": false
                              }
                            }
                          }
                        ]
                      }
                    }
                  }
                }
              },
              "model": {
                "class": "RepeatableModel",
                "config": {
                  "validators": []
                }
              },
              "layout": {
                "class": "DefaultLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "creators",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false
                }
              }
            },
            {
              "name": "citation_publisher",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "SimpleInputComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dataPublication-citation-publisher",
                  "disabled": false,
                  "autofocus": false,
                  "type": "text"
                }
              },
              "model": {
                "class": "SimpleInputModel",
                "config": {
                  "defaultValue": "@dataPublication-citation-publisher-default",
                  "validators": [
                    {
                      "class": "required"
                    }
                  ]
                }
              },
              "layout": {
                "class": "DefaultLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dataPublication-citation-publisher",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "helpText": "@dataPublication-citation-publisher-help",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false
                }
              }
            },
            {
              "name": "citation_url",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "ContentComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dataPublication-citation-url",
                  "disabled": false,
                  "autofocus": false,
                  "content": "Not yet implemented in v5: v4ClassName \"LinkValueComponent\" v4CompClassName \"\" v4Name \"citation_url\". At path '[\"fields\",\"0\",\"definition\",\"fields\",\"8\"]'."
                }
              },
              "layout": {
                "class": "DefaultLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dataPublication-citation-url",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "helpText": "@dataPublication-citation-url-help",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false
                }
              }
            },
            {
              "name": "citation_publication_date",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "DateInputComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dataPublication-citation-publication-date",
                  "disabled": false,
                  "autofocus": false,
                  "placeholder": "",
                  "dateFormat": "DD/MM/YYYY",
                  "showWeekNumbers": false,
                  "containerClass": "theme-dark-blue",
                  "enableTimePicker": false,
                  "bsFullConfig": null
                }
              },
              "model": {
                "class": "DateInputModel",
                "config": {
                  "validators": []
                }
              },
              "layout": {
                "class": "DefaultLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dataPublication-citation-publication-date",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "helpText": "@dataPublication-citation-publication-datel-help",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false
                }
              }
            },
            {
              "name": "citation_generated",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "SimpleInputComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dataPublication-citation-generated-label",
                  "disabled": false,
                  "autofocus": false,
                  "type": "text"
                }
              },
              "model": {
                "class": "SimpleInputModel",
                "config": {
                  "validators": []
                }
              },
              "layout": {
                "class": "DefaultLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dataPublication-citation-generated-label",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false
                }
              }
            },
            {
              "name": "dataowner_name",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "SimpleInputComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "dataowner_name",
                  "disabled": false,
                  "autofocus": false,
                  "type": "hidden"
                }
              },
              "model": {
                "class": "SimpleInputModel",
                "config": {
                  "validators": []
                }
              },
              "layout": {
                "class": "DefaultLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false
                }
              }
            },
            {
              "name": "dataowner_email",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "SimpleInputComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "dataowner_email",
                  "disabled": false,
                  "autofocus": false,
                  "type": "hidden"
                }
              },
              "model": {
                "class": "SimpleInputModel",
                "config": {
                  "validators": []
                }
              },
              "layout": {
                "class": "DefaultLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false
                }
              }
            },
            {
              "name": "contributor_ci",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "SimpleInputComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "contributor_ci",
                  "disabled": false,
                  "autofocus": false,
                  "type": "hidden"
                }
              },
              "model": {
                "class": "SimpleInputModel",
                "config": {
                  "validators": []
                }
              },
              "layout": {
                "class": "DefaultLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false
                }
              }
            },
            {
              "name": "contributor_data_manager",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "SimpleInputComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "contributor_data_manager",
                  "disabled": false,
                  "autofocus": false,
                  "type": "hidden"
                }
              },
              "model": {
                "class": "SimpleInputModel",
                "config": {
                  "validators": []
                }
              },
              "layout": {
                "class": "DefaultLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false
                }
              }
            },
            {
              "name": "contributor_supervisor",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "SimpleInputComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "contributor_supervisor",
                  "disabled": false,
                  "autofocus": false,
                  "type": "hidden"
                }
              },
              "model": {
                "class": "SimpleInputModel",
                "config": {
                  "validators": []
                }
              },
              "layout": {
                "class": "DefaultLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false
                }
              }
            }
          ]
        }
      },
      "model": {
        "class": "GroupModel",
        "config": {
          "validators": []
        }
      },
      "layout": {
        "class": "DefaultLayout",
        "config": {
          "readonly": false,
          "visible": true,
          "editMode": true,
          "label": "@dataPublication-citation-tab",
          "disabled": false,
          "autofocus": false,
          "labelRequiredStr": "*",
          "cssClassesMap": {},
          "helpTextVisibleOnInit": false,
          "helpTextVisible": false
        }
      }
    },
    {
      "name": "validation_summary",
      "constraints": {
        "authorization": {
          "allowRoles": []
        },
        "allowModes": []
      },
      "component": {
        "class": "ValidationSummaryComponent"
      }
    }
  ],
  "debugValue": true,
  "attachmentFields": []
};
module.exports = formConfig;
