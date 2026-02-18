import { FormConfigFrame } from '@researchdatabox/sails-ng-common';

const formConfig: FormConfigFrame = {
  "name": "default-1.0-draft",
  "type": "rdmp",
  "viewCssClasses": "redbox-form form rb-form-view",
  "editCssClasses": "redbox-form form rb-form-edit",
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
      "name": "ContentComponent-fields-0",
      "constraints": {
        "authorization": {
          "allowRoles": []
        },
        "allowModes": [
          "edit"
        ]
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
          "content": "@dmpt-form-heading"
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
      "name": "title",
      "constraints": {
        "authorization": {
          "allowRoles": []
        },
        "allowModes": [
          "view"
        ]
      },
      "component": {
        "class": "ContentComponent",
        "config": {
          "readonly": false,
          "visible": true,
          "editMode": true,
          "label": "title",
          "disabled": false,
          "autofocus": false,
          "template": "<span role=\"heading\" aria-level=\"1\">{{content}}</span>",
          "content": ""
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
      "name": "GroupComponent-fields-2",
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
          "disabled": false,
          "autofocus": false,
          "componentDefinitions": [
            {
              "name": "SaveButtonComponent-fields-2-definition-fields-0",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": [
                  "view"
                ]
              },
              "component": {
                "class": "SaveButtonComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmp-edit-record-link",
                  "disabled": false,
                  "autofocus": false
                }
              },
              "layout": {
                "class": "InlineLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmp-edit-record-link",
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
              "name": "SaveButtonComponent-fields-2-definition-fields-1",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": [
                  "view"
                ]
              },
              "component": {
                "class": "SaveButtonComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmp-create-datarecord-link",
                  "disabled": false,
                  "autofocus": false
                }
              },
              "layout": {
                "class": "InlineLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmp-create-datarecord-link",
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
              "name": "pdf",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": [
                  "view"
                ]
              },
              "component": {
                "class": "ContentComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "pdf",
                  "disabled": false,
                  "autofocus": false,
                  "content": "Not yet implemented in v5: v4ClassName \"PDFList\" v4CompClassName \"\" v4Name \"pdf\". At path '[\"fields\",\"2\",\"definition\",\"fields\",\"2\"]'."
                }
              },
              "layout": {
                "class": "DefaultLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "pdf",
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
              "name": "-fields-2-definition-fields-3",
              "constraints": {
                "authorization": {
                  "allowRoles": [
                    "Admin",
                    "Librarians"
                  ]
                },
                "allowModes": [
                  "view"
                ]
              },
              "component": {
                "class": "ContentComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@legacy-record-notice",
                  "disabled": false,
                  "autofocus": false,
                  "content": "Not yet implemented in v5: v4ClassName \"AnchorOrButton\" v4CompClassName \"TextBlockComponent\" v4Name undefined. At path '[\"fields\",\"2\",\"definition\",\"fields\",\"3\"]'."
                }
              },
              "layout": {
                "class": "DefaultLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@legacy-record-notice",
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
      "name": "description",
      "constraints": {
        "authorization": {
          "allowRoles": []
        },
        "allowModes": [
          "view"
        ]
      },
      "component": {
        "class": "TextAreaComponent",
        "config": {
          "readonly": false,
          "visible": true,
          "editMode": true,
          "label": "Description",
          "disabled": false,
          "autofocus": false,
          "rows": 2,
          "cols": 20,
          "placeholder": ""
        }
      },
      "model": {
        "class": "TextAreaModel",
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
          "label": "Description",
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
      "name": "mainTab",
      "constraints": {
        "authorization": {
          "allowRoles": []
        },
        "allowModes": []
      },
      "component": {
        "class": "TabComponent",
        "config": {
          "readonly": false,
          "visible": true,
          "editMode": true,
          "hostCssClasses": "tab-content",
          "disabled": false,
          "autofocus": false,
          "tabs": [
            {
              "name": "welcome",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": [
                  "edit"
                ]
              },
              "component": {
                "class": "TabContentComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmpt-welcome-tab",
                  "disabled": false,
                  "autofocus": false,
                  "componentDefinitions": [
                    {
                      "name": "ContentComponent-fields-4-definition-fields-0-definition-fields-0",
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
                          "content": "@dmpt-welcome-heading"
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
                      "name": "ContentComponent-fields-4-definition-fields-0-definition-fields-1",
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
                          "template": "<p>{{content}}</p>",
                          "content": "@dmpt-welcome-par2"
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
                      "name": "ContentComponent-fields-4-definition-fields-0-definition-fields-2",
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
                          "template": "<p>{{content}}</p>",
                          "content": "@dmpt-welcome-par3"
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
                      "name": "ContentComponent-fields-4-definition-fields-0-definition-fields-3",
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
                          "template": "<p>{{content}}</p>",
                          "content": "@dmpt-welcome-par4"
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
                  ],
                  "selected": false
                }
              },
              "layout": {
                "class": "TabContentLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmpt-welcome-tab",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false,
                  "buttonLabel": "@dmpt-welcome-tab"
                }
              }
            },
            {
              "name": "project",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "TabContentComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmpt-project-tab",
                  "disabled": false,
                  "autofocus": false,
                  "componentDefinitions": [
                    {
                      "name": "ContentComponent-fields-4-definition-fields-1-definition-fields-0",
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
                          "content": "@dmpt-project-heading"
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
                      "name": "title",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
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
                          "label": "@dmpt-project-title",
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
                          "label": "@dmpt-project-title",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-project-title-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "description",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "TextAreaComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-project-desc",
                          "disabled": false,
                          "autofocus": false,
                          "rows": 10,
                          "cols": 10,
                          "placeholder": ""
                        }
                      },
                      "model": {
                        "class": "TextAreaModel",
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
                          "label": "@dmpt-project-desc",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-project-desc-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "finalKeywords",
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
                          "label": "@dmpt-finalKeywords",
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
                          "label": "@dmpt-finalKeywords",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-finalKeywords-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "dc:relation_bibo:Website",
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
                          "label": "@dmpt-project-website",
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
                          "label": "@dmpt-project-website",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-project-website-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "dc:coverage_vivo:DateTimeInterval_vivo:start",
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
                          "label": "@dmpt-project-startdate",
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
                          "label": "@dmpt-project-startdate",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-project-startdate-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "dc:coverage_vivo:DateTimeInterval_vivo:end",
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
                          "label": "@dmpt-project-enddate",
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
                          "label": "@dmpt-project-enddate",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-project-enddate-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "foaf:fundedBy_foaf:Agent",
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
                          "label": "@dmpt-foaf:fundedBy_foaf:Agent",
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
                              "class": "TypeaheadInputComponent",
                              "config": {
                                "readonly": false,
                                "visible": true,
                                "editMode": true,
                                "disabled": false,
                                "autofocus": false,
                                "sourceType": "namedQuery",
                                "staticOptions": [],
                                "queryId": "fundingBody",
                                "labelField": "dc_description",
                                "valueField": "value",
                                "minChars": 2,
                                "debounceMs": 250,
                                "maxResults": 25,
                                "allowFreeText": false,
                                "valueMode": "value",
                                "cacheResults": true,
                                "multiSelect": false
                              }
                            },
                            "model": {
                              "class": "TypeaheadInputModel",
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
                          "label": "@dmpt-foaf:fundedBy_foaf:Agent",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-foaf:fundedBy_foaf:Agent-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "foaf:fundedBy_vivo:Grant",
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
                          "label": "@dmpt-foaf:fundedBy_vivo:Grant",
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
                              "class": "TypeaheadInputComponent",
                              "config": {
                                "readonly": false,
                                "visible": true,
                                "editMode": true,
                                "disabled": false,
                                "autofocus": false,
                                "sourceType": "namedQuery",
                                "staticOptions": [],
                                "queryId": "activity",
                                "labelField": "dc_title",
                                "valueField": "value",
                                "minChars": 2,
                                "debounceMs": 250,
                                "maxResults": 25,
                                "allowFreeText": false,
                                "valueMode": "value",
                                "cacheResults": true,
                                "multiSelect": false
                              }
                            },
                            "model": {
                              "class": "TypeaheadInputModel",
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
                          "label": "@dmpt-foaf:fundedBy_vivo:Grant",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-foaf:fundedBy_vivo:Grant-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "dc:subject_anzsrc:toa_rdf:resource",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "DropdownInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-project-activity-type",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@dmpt-select:Empty",
                              "value": ""
                            },
                            {
                              "label": "@dmpt-activity-type-pure",
                              "value": "pure"
                            },
                            {
                              "label": "@dmpt-activity-type-strategic",
                              "value": "strategic"
                            },
                            {
                              "label": "@dmpt-activity-type-applied",
                              "value": "applied"
                            },
                            {
                              "label": "@dmpt-activity-type-experimental",
                              "value": "experimental"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "DropdownInputModel",
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
                          "label": "@dmpt-project-activity-type",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-project-activity-type-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "dc:subject_anzsrc:for-2008",
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
                          "label": "@dmpt-project-anzsrcFor-2008",
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
                              "class": "TypeaheadInputComponent",
                              "config": {
                                "readonly": false,
                                "visible": true,
                                "editMode": true,
                                "disabled": false,
                                "autofocus": false,
                                "sourceType": "namedQuery",
                                "staticOptions": [],
                                "labelField": "name",
                                "valueField": "value",
                                "minChars": 2,
                                "debounceMs": 250,
                                "maxResults": 25,
                                "allowFreeText": false,
                                "valueMode": "value",
                                "cacheResults": true,
                                "multiSelect": false,
                                "readOnlyAfterSelect": true
                              }
                            },
                            "model": {
                              "class": "TypeaheadInputModel",
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
                          "label": "@dmpt-project-anzsrcFor-2008",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-project-anzsrcFor-2008-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "dc:subject_anzsrc:for",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "CheckboxTreeComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-project-anzsrcFor",
                          "disabled": false,
                          "autofocus": false,
                          "vocabRef": "anzsrc-2020-for",
                          "treeData": [],
                          "leafOnly": true,
                          "labelTemplate": "{{default (split notation \"/\" -1) notation}} - {{label}}"
                        }
                      },
                      "model": {
                        "class": "CheckboxTreeModel",
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
                          "label": "@dmpt-project-anzsrcFor",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-project-anzsrcFor-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "dc:subject_anzsrc:seo-2008",
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
                          "label": "@dmpt-project-anzsrcSeo-2008",
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
                              "class": "TypeaheadInputComponent",
                              "config": {
                                "readonly": false,
                                "visible": true,
                                "editMode": true,
                                "disabled": false,
                                "autofocus": false,
                                "sourceType": "namedQuery",
                                "staticOptions": [],
                                "labelField": "name",
                                "valueField": "value",
                                "minChars": 2,
                                "debounceMs": 250,
                                "maxResults": 25,
                                "allowFreeText": false,
                                "valueMode": "value",
                                "cacheResults": true,
                                "multiSelect": false,
                                "readOnlyAfterSelect": true
                              }
                            },
                            "model": {
                              "class": "TypeaheadInputModel",
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
                          "label": "@dmpt-project-anzsrcSeo-2008",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-project-anzsrcSeo-2008-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "dc:subject_anzsrc:seo",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "CheckboxTreeComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-project-anzsrcSeo",
                          "disabled": false,
                          "autofocus": false,
                          "vocabRef": "anzsrc-2020-seo",
                          "treeData": [],
                          "leafOnly": true,
                          "labelTemplate": "{{default (split notation \"/\" -1) notation}} - {{label}}"
                        }
                      },
                      "model": {
                        "class": "CheckboxTreeModel",
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
                          "label": "@dmpt-project-anzsrcSeo",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-project-anzsrcSeo-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    }
                  ],
                  "selected": false
                }
              },
              "layout": {
                "class": "TabContentLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmpt-project-tab",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false,
                  "buttonLabel": "@dmpt-project-tab"
                }
              }
            },
            {
              "name": "people",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "TabContentComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmpt-people-tab",
                  "disabled": false,
                  "autofocus": false,
                  "componentDefinitions": [
                    {
                      "name": "ContentComponent-fields-4-definition-fields-2-definition-fields-0",
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
                          "content": "@dmpt-people-heading"
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
                      "name": "ContentComponent-fields-4-definition-fields-2-definition-fields-1",
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
                          "template": "<span>{{content}}</span>",
                          "content": "@dmpt-people-tab-ci"
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
                          "helpText": "@dmpt-people-tab-ci-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "ContentComponent-fields-4-definition-fields-2-definition-fields-2",
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
                          "template": "<p>{{content}}</p>",
                          "content": "@dmpt-people-tab-ci-note-alt"
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
                      "overrides": {
                        "reusableFormName": "standard-contributor-fields-group"
                      },
                      "component": {
                        "class": "ReusableComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "contributor_ci",
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
                                  "label": "contributor_ci",
                                  "disabled": false,
                                  "autofocus": false,
                                  "componentDefinitions": []
                                }
                              },
                              "model": {
                                "class": "GroupModel",
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
                                  "label": "",
                                  "disabled": false,
                                  "autofocus": false,
                                  "labelRequiredStr": "*",
                                  "helpText": "",
                                  "cssClassesMap": {},
                                  "helpTextVisibleOnInit": false,
                                  "helpTextVisible": false
                                }
                              }
                            }
                          ]
                        }
                      }
                    },
                    {
                      "name": "contributor_oi",
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
                          "label": "contributor_oi",
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
                                "label": "@dmpt-people-tab-otherdatacreators",
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
                                        "label": "@dmpt-people-tab-otherdatacreators",
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
                                        "label": "@dmpt-people-tab-otherdatacreators",
                                        "disabled": false,
                                        "autofocus": false,
                                        "labelRequiredStr": "*",
                                        "helpText": "@dmpt-people-tab-otherdatacreators-help",
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
                      "name": "ContentComponent-fields-4-definition-fields-2-definition-fields-5",
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
                          "template": "<span>{{content}}</span>",
                          "content": "@dmpt-people-tab-data-manager"
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
                          "helpText": "@dmpt-people-tab-data-manager-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "ContentComponent-fields-4-definition-fields-2-definition-fields-6",
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
                          "template": "<p>{{content}}</p>",
                          "content": "@dmpt-people-tab-data-manager-note-alt"
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
                      "overrides": {
                        "reusableFormName": "standard-contributor-fields-group"
                      },
                      "component": {
                        "class": "ReusableComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "contributor_data_manager",
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
                                  "label": "contributor_data_manager",
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
                                  "label": "",
                                  "disabled": false,
                                  "autofocus": false,
                                  "labelRequiredStr": "*",
                                  "helpText": "",
                                  "cssClassesMap": {},
                                  "helpTextVisibleOnInit": false,
                                  "helpTextVisible": false
                                }
                              }
                            }
                          ]
                        }
                      }
                    },
                    {
                      "name": "contributor_record_administrator",
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
                          "label": "@dmpt-people-tab-record-administrator",
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
                                  "label": "@dmpt-people-tab-record-administrator",
                                  "disabled": false,
                                  "autofocus": false,
                                  "componentDefinitions": []
                                }
                              },
                              "model": {
                                "class": "GroupModel",
                                "config": {
                                  "defaultValue": {
                                    "name": "@user_name",
                                    "email": "@user_email",
                                    "username": "@user_username",
                                    "text_full_name": "@user_name"
                                  },
                                  "validators": []
                                }
                              },
                              "layout": {
                                "class": "DefaultLayout",
                                "config": {
                                  "readonly": false,
                                  "visible": true,
                                  "editMode": true,
                                  "label": "@dmpt-people-tab-record-administrator",
                                  "disabled": false,
                                  "autofocus": false,
                                  "labelRequiredStr": "*",
                                  "helpText": "@dmpt-people-tab-record-administrator-help",
                                  "cssClassesMap": {},
                                  "helpTextVisibleOnInit": false,
                                  "helpTextVisible": false
                                }
                              }
                            }
                          ]
                        }
                      }
                    },
                    {
                      "name": "contributors",
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
                          "label": "contributors",
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
                                "label": "@dmpt-people-tab-contributors",
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
                                        "label": "@dmpt-people-tab-contributors",
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
                                        "label": "@dmpt-people-tab-contributors",
                                        "disabled": false,
                                        "autofocus": false,
                                        "labelRequiredStr": "*",
                                        "helpText": "@dmpt-people-tab-contributors-help",
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
                        "class": "RepeatableComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "contributor_supervisor",
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
                                "label": "@dmpt-people-tab-supervisor",
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
                                        "label": "@dmpt-people-tab-supervisor",
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
                                        "label": "@dmpt-people-tab-supervisor",
                                        "disabled": false,
                                        "autofocus": false,
                                        "labelRequiredStr": "*",
                                        "helpText": "@dmpt-people-tab-supervisor-help",
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
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    }
                  ],
                  "selected": false
                }
              },
              "layout": {
                "class": "TabContentLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmpt-people-tab",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false,
                  "buttonLabel": "@dmpt-people-tab"
                }
              }
            },
            {
              "name": "dataCollection",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "TabContentComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmpt-data-collection-tab",
                  "disabled": false,
                  "autofocus": false,
                  "componentDefinitions": [
                    {
                      "name": "ContentComponent-fields-4-definition-fields-3-definition-fields-0",
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
                          "content": "@dmpt-data-collection-heading"
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
                      "name": "vivo:Dataset_redbox:DataCollectionMethodology",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "TextAreaComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-data-collection-methodology",
                          "disabled": false,
                          "autofocus": false,
                          "rows": 5,
                          "cols": 10,
                          "placeholder": ""
                        }
                      },
                      "model": {
                        "class": "TextAreaModel",
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
                          "label": "@dmpt-data-collection-methodology",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-data-collection-methodology-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "vivo:Dataset_dc_format",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "TextAreaComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-vivo:Dataset_dc_format",
                          "disabled": false,
                          "autofocus": false,
                          "rows": 5,
                          "cols": 10,
                          "placeholder": ""
                        }
                      },
                      "model": {
                        "class": "TextAreaModel",
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
                          "label": "@dmpt-vivo:Dataset_dc_format",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-vivo:Dataset_dc_format-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "vivo:Dataset_redbox:DataCollectionResources",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "TextAreaComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-vivo:Dataset_redbox:DataCollectionResources",
                          "disabled": false,
                          "autofocus": false,
                          "rows": 5,
                          "cols": 10,
                          "placeholder": ""
                        }
                      },
                      "model": {
                        "class": "TextAreaModel",
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
                          "label": "@dmpt-vivo:Dataset_redbox:DataCollectionResources",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-vivo:Dataset_redbox:DataCollectionResources-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "vivo:Dataset_redbox:DataAnalysisResources",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "TextAreaComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-vivo:Dataset_redbox:DataAnalysisResources",
                          "disabled": false,
                          "autofocus": false,
                          "rows": 5,
                          "cols": 10,
                          "placeholder": ""
                        }
                      },
                      "model": {
                        "class": "TextAreaModel",
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
                          "label": "@dmpt-vivo:Dataset_redbox:DataAnalysisResources",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-vivo:Dataset_redbox:DataAnalysisResources-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "vivo:Dataset_redbox:MetadataStandard",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "TextAreaComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-vivo:Dataset_redbox:MetadataStandard",
                          "disabled": false,
                          "autofocus": false,
                          "rows": 5,
                          "cols": 10,
                          "placeholder": ""
                        }
                      },
                      "model": {
                        "class": "TextAreaModel",
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
                          "label": "@dmpt-vivo:Dataset_redbox:MetadataStandard",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-vivo:Dataset_redbox:MetadataStandard-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    }
                  ],
                  "selected": false
                }
              },
              "layout": {
                "class": "TabContentLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmpt-data-collection-tab",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false,
                  "buttonLabel": "@dmpt-data-collection-tab"
                }
              }
            },
            {
              "name": "storage",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "TabContentComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmpt-storage-tab",
                  "disabled": false,
                  "autofocus": false,
                  "componentDefinitions": [
                    {
                      "name": "ContentComponent-fields-4-definition-fields-4-definition-fields-0",
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
                          "content": "@dmpt-storage-heading"
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
                      "name": "vivo:Dataset_dc:extent",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "DropdownInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-vivo:Dataset_dc:extent",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@dmpt-select:Empty",
                              "value": ""
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:extent-less-than-10GB",
                              "value": "@dmpt-vivo:Dataset_dc:extent-less-than-10GB"
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:extent-10-20GB",
                              "value": "@dmpt-vivo:Dataset_dc:extent-10-20GB"
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:extent-20-100GB",
                              "value": "@dmpt-vivo:Dataset_dc:extent-20-100GB"
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:extent-100GB-to-1TB",
                              "value": "@dmpt-vivo:Dataset_dc:extent-100GB-to-1TB"
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:extent-more-than-1TB",
                              "value": "@dmpt-vivo:Dataset_dc:extent-more-than-1TB"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "DropdownInputModel",
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
                          "label": "@dmpt-vivo:Dataset_dc:extent",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-vivo:Dataset_dc:extent-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "vivo:Dataset_dc:location_rdf:PlainLiteral",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "DropdownInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@dmpt-select:Empty",
                              "value": ""
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-compliant-academic-collab-space",
                              "value": "dmpt-location_compliant-academic-collab-space",
                              "disabled": true
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-compliant-Microsoft",
                              "value": "dmpt-location_compliant-Microsoft"
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-compliant-QCIF",
                              "value": "dmpt-location_compliant"
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-compliant-research-funding-partner",
                              "value": "dmpt-location_compliant-research-funding-partner"
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-compliant-HPC",
                              "value": "dmpt-location_compliant-HPC"
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-shared-drive",
                              "value": "dmpt-location_shared-drive"
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-personal-equipment",
                              "value": "dmpt-location_personal-equipment"
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-external-collab-space",
                              "value": "dmpt-location_external-collab-space"
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-other",
                              "value": "dmpt-location_other"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "DropdownInputModel",
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
                          "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "vivo:Dataset_dc:location_skos:note",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "TextAreaComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-vivo:Dataset_dc:location_skos:note",
                          "disabled": false,
                          "autofocus": false,
                          "rows": 5,
                          "cols": 10,
                          "placeholder": ""
                        }
                      },
                      "model": {
                        "class": "TextAreaModel",
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
                          "label": "@dmpt-vivo:Dataset_dc:location_skos:note",
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
                      "name": "vivo:Dataset_dc:source_dc:location_rdf:PlainLiteral",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "DropdownInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-vivo:Dataset_dc:source_dc:location_rdf:PlainLiteral",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@dmpt-select:Empty",
                              "value": ""
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-compliant-academic-collab-space",
                              "value": "dmpt-location_compliant-academic-collab-space",
                              "disabled": true
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-compliant-Microsoft",
                              "value": "dmpt-location_compliant-Microsoft"
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-compliant-QCIF",
                              "value": "dmpt-location_compliant"
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-compliant-research-funding-partner",
                              "value": "dmpt-location_compliant-research-funding-partner"
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-compliant-HPC",
                              "value": "dmpt-location_compliant-HPC"
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-shared-drive",
                              "value": "dmpt-location_shared-drive"
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-personal-equipment",
                              "value": "dmpt-location_personal-equipment"
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-external-collab-space",
                              "value": "dmpt-location_external-collab-space"
                            },
                            {
                              "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-other",
                              "value": "dmpt-location_other"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "DropdownInputModel",
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
                          "label": "@dmpt-vivo:Dataset_dc:source_dc:location_rdf:PlainLiteral",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-vivo:Dataset_dc:source_dc:location_rdf:PlainLiteral-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "vivo:Dataset_dc:source_dc:location_skos:note",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "TextAreaComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-vivo:Dataset_dc:source_dc:location_skos:note",
                          "disabled": false,
                          "autofocus": false,
                          "rows": 5,
                          "cols": 10,
                          "placeholder": ""
                        }
                      },
                      "model": {
                        "class": "TextAreaModel",
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
                          "label": "@dmpt-vivo:Dataset_dc:source_dc:location_skos:note",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    }
                  ],
                  "selected": false
                }
              },
              "layout": {
                "class": "TabContentLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmpt-storage-tab",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false,
                  "buttonLabel": "@dmpt-storage-tab"
                }
              }
            },
            {
              "name": "retention",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "TabContentComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmpt-retention-tab",
                  "disabled": false,
                  "autofocus": false,
                  "componentDefinitions": [
                    {
                      "name": "ContentComponent-fields-4-definition-fields-5-definition-fields-0",
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
                          "content": "@dmpt-retention-heading"
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
                      "name": "redbox:retentionPeriod_dc:date",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "DropdownInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-redbox:retentionPeriod_dc:date",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@dmpt-select:Empty",
                              "value": ""
                            },
                            {
                              "label": "@dmpt-redbox:retentionPeriod_dc:date-1year",
                              "value": "1year"
                            },
                            {
                              "label": "@dmpt-redbox:retentionPeriod_dc:date-5years",
                              "value": "5years"
                            },
                            {
                              "label": "@dmpt-redbox:retentionPeriod_dc:date-7years",
                              "value": "7years"
                            },
                            {
                              "label": "@dmpt-redbox:retentionPeriod_dc:date-15years",
                              "value": "15years"
                            },
                            {
                              "label": "@dmpt-redbox:retentionPeriod_dc:date-permanent",
                              "value": "permanent"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "DropdownInputModel",
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
                          "label": "@dmpt-redbox:retentionPeriod_dc:date",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-redbox:retentionPeriod_dc:date-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "redbox:retentionPeriod_dc:date_skos:note",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "DropdownInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-redbox:retentionPeriod_dc:date_skos:note",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@dmpt-select:Empty",
                              "value": ""
                            },
                            {
                              "label": "@dmpt-redbox:retentionPeriod_dc:date_skos:note-controversial",
                              "value": "controversial"
                            },
                            {
                              "label": "@dmpt-redbox:retentionPeriod_dc:date_skos:note-ofinterest",
                              "value": "ofinterest"
                            },
                            {
                              "label": "@dmpt-redbox:retentionPeriod_dc:date_skos:note-innovative",
                              "value": "innovative"
                            },
                            {
                              "label": "@dmpt-redbox:retentionPeriod_dc:date_skos:note-adverse",
                              "value": "adverse"
                            },
                            {
                              "label": "@dmpt-redbox:retentionPeriod_dc:date_skos:note-costly_impossible",
                              "value": "costly_impossible"
                            },
                            {
                              "label": "@dmpt-redbox:retentionPeriod_dc:date_skos:note-commercial",
                              "value": "commercial"
                            },
                            {
                              "label": "@dmpt-redbox:retentionPeriod_dc:date_skos:note-heritage",
                              "value": "heritage"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "DropdownInputModel",
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
                          "label": "@dmpt-redbox:retentionPeriod_dc:date_skos:note",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-redbox:retentionPeriod_dc:date_skos:note-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    }
                  ],
                  "selected": false
                }
              },
              "layout": {
                "class": "TabContentLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmpt-retention-tab",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false,
                  "buttonLabel": "@dmpt-retention-tab"
                }
              }
            },
            {
              "name": "ownership",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "TabContentComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmpt-access-rights-tab",
                  "disabled": false,
                  "autofocus": false,
                  "componentDefinitions": [
                    {
                      "name": "ContentComponent-fields-4-definition-fields-6-definition-fields-0",
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
                          "content": "@dmpt-access-rights-heading"
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
                      "name": "dc:rightsHolder_dc:name",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "DropdownInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-dc:rightsHolder_dc:name",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@dmpt-select:Empty",
                              "value": ""
                            },
                            {
                              "label": "@dmpt-dc:rightsHolder_dc:name-myUni",
                              "value": "myUni"
                            },
                            {
                              "label": "@dmpt-dc:rightsHolder_dc:name-myUnjount",
                              "value": "myUnjount"
                            },
                            {
                              "label": "@dmpt-dc:rightsHolder_dc:name-student",
                              "value": "student"
                            },
                            {
                              "label": "@dmpt-dc:rightsHolder_dc:name-3rdParty",
                              "value": "Third Party is rights holder"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "DropdownInputModel",
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
                          "label": "@dmpt-dc:rightsHolder_dc:name",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-dc:rightsHolder_dc:name-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "dc:rightsHolder_dc:description",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "TextAreaComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-dc:rightsHolder_dc:description",
                          "disabled": false,
                          "autofocus": false,
                          "rows": 5,
                          "cols": 10,
                          "placeholder": ""
                        }
                      },
                      "model": {
                        "class": "TextAreaModel",
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
                          "label": "@dmpt-dc:rightsHolder_dc:description",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-dc:rightsHolder_dc:description-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "redbox:ContractualObligations",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "TextAreaComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-redbox:ContractualObligations",
                          "disabled": false,
                          "autofocus": false,
                          "rows": 5,
                          "cols": 10,
                          "placeholder": ""
                        }
                      },
                      "model": {
                        "class": "TextAreaModel",
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
                          "label": "@dmpt-redbox:ContractualObligations",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-redbox:ContractualObligations-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "contractualObligations_licences",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "FileUploadComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-contractual-obligations-licences",
                          "disabled": false,
                          "autofocus": false,
                          "restrictions": {
                            "metadataFields": [
                              {
                                "id": "notes",
                                "name": "Notes",
                                "placeholder": "Notes about this file."
                              }
                            ]
                          },
                          "enabledSources": [],
                          "allowUploadWithoutSave": false,
                          "uppyDashboardNote": "Documents up to 100 MB in total"
                        }
                      },
                      "model": {
                        "class": "FileUploadModel",
                        "config": {
                          "defaultValue": [],
                          "validators": []
                        }
                      },
                      "layout": {
                        "class": "DefaultLayout",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-contractual-obligations-licences",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-contractual-obligations-licences-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "dc:coverage_dc:identifier",
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
                          "label": "@dmpt-dc:coverage_dc:identifier",
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
                              "class": "TypeaheadInputComponent",
                              "config": {
                                "readonly": false,
                                "visible": true,
                                "editMode": true,
                                "disabled": false,
                                "autofocus": false,
                                "sourceType": "namedQuery",
                                "staticOptions": [],
                                "labelField": "title",
                                "valueField": "value",
                                "minChars": 2,
                                "debounceMs": 250,
                                "maxResults": 25,
                                "allowFreeText": false,
                                "valueMode": "value",
                                "cacheResults": true,
                                "multiSelect": false
                              }
                            },
                            "model": {
                              "class": "TypeaheadInputModel",
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
                          "label": "@dmpt-dc:coverage_dc:identifier",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-dc:coverage_dc:identifier-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "atsi",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-atsi",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "Yes",
                              "value": "yes"
                            },
                            {
                              "label": "No",
                              "value": "No"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@dmpt-atsi",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-atsi-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "dc:accessRights",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-dc:accessRights",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@dmpt-dc:accessRights-open",
                              "value": "open"
                            },
                            {
                              "label": "@dmpt-dc:accessRights-manager",
                              "value": "manager"
                            },
                            {
                              "label": "@dmpt-dc:accessRights-none",
                              "value": "none"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@dmpt-dc:accessRights",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-dc:accessRights-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "dataLicensingAccess_manager",
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
                          "label": "@dmpt-dataLicensingAccess_manager",
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
                          "label": "@dmpt-dataLicensingAccess_manager",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    }
                  ],
                  "selected": false
                }
              },
              "layout": {
                "class": "TabContentLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmpt-access-rights-tab",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false,
                  "buttonLabel": "@dmpt-access-rights-tab"
                }
              }
            },
            {
              "name": "ethics",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "TabContentComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmpt-ethics-tab",
                  "disabled": false,
                  "autofocus": false,
                  "componentDefinitions": [
                    {
                      "name": "ContentComponent-fields-4-definition-fields-7-definition-fields-0",
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
                          "content": "@dmpt-ethics-heading"
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
                      "name": "agls:policy_dc:identifier",
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
                          "label": "@dmpt-agls:policy_dc:identifier",
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
                          "label": "@dmpt-agls:policy_dc:identifier",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-agls:policy_dc:identifier-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "agls:policy_skos:note",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "TextAreaComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-agls:policy_skos:note",
                          "disabled": false,
                          "autofocus": false,
                          "rows": 5,
                          "cols": 10,
                          "placeholder": ""
                        }
                      },
                      "model": {
                        "class": "TextAreaModel",
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
                          "label": "@dmpt-agls:policy_skos:note",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-agls:policy_skos:note-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "ContentComponent-fields-4-definition-fields-7-definition-fields-3",
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
                          "template": "<span role=\"heading\" aria-level=\"4\">{{content}}</span>",
                          "content": "@dmpt-etchics-sensitivities-heading"
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
                      "name": "agls:protectiveMarking_dc:type",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "CheckboxInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-agls:protectiveMarking_dc:type",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@dmpt-agls:protectiveMarking_dc:type-commercial",
                              "value": "agls:protectiveMarking_dc:type.redbox:CommerciallySensitive",
                              "disabled": true
                            },
                            {
                              "label": "@dmpt-agls:protectiveMarking_dc:type-cultural",
                              "value": "agls:protectiveMarking_dc:type.redbox:CulturallySensitive",
                              "disabled": true
                            },
                            {
                              "label": "@dmpt-agls:protectiveMarking_dc:type-security",
                              "value": "agls:protectiveMarking_dc:type.redbox:SecurityClassified",
                              "disabled": true
                            },
                            {
                              "label": "@dmpt-agls:protectiveMarking_dc:type-nonPublic",
                              "value": "agls:protectiveMarking_dc:type.redbox:NonPublic",
                              "disabled": true
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "CheckboxInputModel",
                        "config": {
                          "defaultValue": [
                            ""
                          ],
                          "validators": []
                        }
                      },
                      "layout": {
                        "class": "DefaultLayout",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-agls:protectiveMarking_dc:type",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-agls:protectiveMarking_dc:type-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "agls:protectiveMarking_skos:note",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "TextAreaComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-agls:protectiveMarking_skos:note",
                          "disabled": false,
                          "autofocus": false,
                          "rows": 5,
                          "cols": 10,
                          "placeholder": ""
                        }
                      },
                      "model": {
                        "class": "TextAreaModel",
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
                          "label": "@dmpt-agls:protectiveMarking_skos:note",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-agls:protectiveMarking_skos:note-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "ContentComponent-fields-4-definition-fields-7-definition-fields-6",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "ContentComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "disabled": false,
                          "autofocus": false,
                          "template": "<p>{{content}}</p>",
                          "content": "@dmpt-agls:protectiveMarking_moreinfo"
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
                      "name": "grant_number_name",
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
                          "label": "grant_number_name",
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
                      "name": "legacyId",
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
                          "label": "legacyId",
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
                      "name": "vivo:Dataset_redbox:DataStructureStandard",
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
                          "label": "vivo:Dataset_redbox:DataStructureStandard",
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
                  ],
                  "selected": false
                }
              },
              "layout": {
                "class": "TabContentLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmpt-ethics-tab",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false,
                  "buttonLabel": "@dmpt-ethics-tab"
                }
              }
            },
            {
              "name": "rdmp-data-classification",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "TabContentComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmpt-data-classification-tab",
                  "disabled": false,
                  "autofocus": false,
                  "componentDefinitions": [
                    {
                      "name": "ContentComponent-fields-4-definition-fields-8-definition-fields-0",
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
                          "content": "@dmpt-data-classification-heading"
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
                      "name": "ContentComponent-fields-4-definition-fields-8-definition-fields-1",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "ContentComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "disabled": false,
                          "autofocus": false,
                          "template": "<p>{{content}}</p>",
                          "content": "@dmpt-data-classification-intro"
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
                      "name": "jcu-rdmp-data-classification-item-is-data-sensitive",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-is-data-sensitive-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-is-data-sensitive-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-is-data-sensitive-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-is-data-sensitive-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-is-data-sensitive-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-published-or-public-data",
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
                          "label": "@jcu-rdmp-data-classification-item-published-or-public-data-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-published-or-public-data-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-published-or-public-data-no-label",
                              "value": "no"
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
                          "label": "@jcu-rdmp-data-classification-item-published-or-public-data-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-published-or-public-data-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-from-or-about-individuals",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-from-or-about-individuals-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-from-or-about-individuals-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-from-or-about-individuals-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-from-or-about-individuals-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-from-or-about-individuals-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-contains-sensitive-personal-info",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-contains-sensitive-personal-info-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-contains-sensitive-personal-info-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-contains-sensitive-personal-info-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-contains-sensitive-personal-info-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-contains-sensitive-personal-info-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-contains-personal-info-defined-by-privacy-act",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-contains-personal-info-defined-by-privacy-act-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-contains-personal-info-defined-by-privacy-act-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-contains-personal-info-defined-by-privacy-act-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-contains-personal-info-defined-by-privacy-act-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-contains-personal-info-defined-by-privacy-act-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-impact-significance-aboriginal-communities",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-impact-significance-aboriginal-communities-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-impact-significance-aboriginal-communities-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-impact-significance-aboriginal-communities-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-impact-significance-aboriginal-communities-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-impact-significance-aboriginal-communities-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-aboriginal-communities-scalable-sensitive",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-scalable-sensitive-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-scalable-sensitive-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-scalable-sensitive-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-scalable-sensitive-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-scalable-sensitive-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-aboriginal-communities-public-release",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-public-release-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-public-release-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-public-release-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-public-release-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-public-release-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-eligible-for-public-release",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-eligible-for-public-release-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-eligible-for-public-release-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-eligible-for-public-release-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-eligible-for-public-release-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-eligible-for-public-release-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-not-from-or-about-individuals",
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
                          "label": "@jcu-rdmp-data-classification-item-data-not-from-or-about-individuals-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-not-from-or-about-individuals-data-about-individuals-label",
                              "value": "data-about-individuals"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-not-from-or-about-individuals-data-culturally-sensitive-label",
                              "value": "data-culturally-sensitive"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-not-from-or-about-individuals-data-eco-species-habitats-label",
                              "value": "data-eco-species-habitats"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-not-from-or-about-individuals-data-autonomous-sanctions-label",
                              "value": "data-autonomous-sanctions"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-not-from-or-about-individuals-data-defence-national-security-label",
                              "value": "data-defence-national-security"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-not-from-or-about-individuals-data-bio-agents-security-sensitive-label",
                              "value": "data-bio-agents-security-sensitive"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-not-from-or-about-individuals-data-potential-commercial-ip-label",
                              "value": "data-potential-commercial-ip"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-not-from-or-about-individuals-data-formal-agreement-label",
                              "value": "data-formal-agreement"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-not-from-or-about-individuals-data-none-label",
                              "value": "data-none"
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
                          "label": "@jcu-rdmp-data-classification-item-data-not-from-or-about-individuals-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-not-from-or-about-individuals-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-about-individuals",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-about-individuals-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-about-individuals-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-about-individuals-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-about-individuals-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-about-individuals-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-personal-defined-privacy-act",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-personal-defined-privacy-act-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-personal-defined-privacy-act-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-personal-defined-privacy-act-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-personal-defined-privacy-act-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-personal-defined-privacy-act-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-impact-aboriginal-communities",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-impact-aboriginal-communities-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-impact-aboriginal-communities-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-impact-aboriginal-communities-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-impact-aboriginal-communities-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-impact-aboriginal-communities-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-aboriginal-communities-sensitive",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-sensitive-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-sensitive-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-sensitive-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-sensitive-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-sensitive-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-aboriginal-communities-public",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-public-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-public-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-public-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-public-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-aboriginal-communities-public-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-culturally-sensitive",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-culturally-sensitive-esc-protected",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-esc-protected-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-esc-protected-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-esc-protected-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-esc-protected-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-esc-protected-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-culturally-sensitive-esc-sensitive",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-esc-sensitive-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-esc-sensitive-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-esc-sensitive-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-esc-sensitive-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-esc-sensitive-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-culturally-sensitive-higher-risk",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-higher-risk-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-higher-risk-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-higher-risk-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-higher-risk-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-culturally-sensitive-higher-risk-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-eco-species-habitats",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-eco-species-habitats-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-eco-species-habitats-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-eco-species-habitats-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-eco-species-habitats-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-eco-species-habitats-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-eco-impacts",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-eco-impacts-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-eco-impacts-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-eco-impacts-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-eco-impacts-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-eco-impacts-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-autonomous-sanctions",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-autonomous-sanctions-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-autonomous-sanctions-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-autonomous-sanctions-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-autonomous-sanctions-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-autonomous-sanctions-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-defence-national-security",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-defence-national-security-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-defence-national-security-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-defence-national-security-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-defence-national-security-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-defence-national-security-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-related-goods-technology-exported",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-related-goods-technology-exported-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-related-goods-technology-exported-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-related-goods-technology-exported-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-related-goods-technology-exported-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-related-goods-technology-exported-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-goods-p1-p2-dsgl-2024-export",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-goods-p1-p2-dsgl-2024-export-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-goods-p1-p2-dsgl-2024-export-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-goods-p1-p2-dsgl-2024-export-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-goods-p1-p2-dsgl-2024-export-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-goods-p1-p2-dsgl-2024-export-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-disclosure-misuse-export",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-disclosure-misuse-export-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-disclosure-misuse-export-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-disclosure-misuse-export-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-disclosure-misuse-export-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-disclosure-misuse-export-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-goods-p1-p2-dsgl-2024",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-goods-p1-p2-dsgl-2024-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-goods-p1-p2-dsgl-2024-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-goods-p1-p2-dsgl-2024-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-goods-p1-p2-dsgl-2024-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-goods-p1-p2-dsgl-2024-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-disclosure-misuse",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-disclosure-misuse-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-disclosure-misuse-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-disclosure-misuse-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-disclosure-misuse-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-disclosure-misuse-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-bio-agents-security-sensitive",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-bio-agents-security-sensitive-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-bio-agents-security-sensitive-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-bio-agents-security-sensitive-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-bio-agents-security-sensitive-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-bio-agents-security-sensitive-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-potential-commercial-ip",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-potential-commercial-ip-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-potential-commercial-ip-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-potential-commercial-ip-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-potential-commercial-ip-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-potential-commercial-ip-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-access-commercial-agreement",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-access-commercial-agreement-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-access-commercial-agreement-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-access-commercial-agreement-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-access-commercial-agreement-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-access-commercial-agreement-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-data-formal-agreement",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "RadioInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@jcu-rdmp-data-classification-item-data-formal-agreement-label",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-formal-agreement-yes-label",
                              "value": "yes"
                            },
                            {
                              "label": "@jcu-rdmp-data-classification-item-data-formal-agreement-no-label",
                              "value": "no"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "RadioInputModel",
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
                          "label": "@jcu-rdmp-data-classification-item-data-formal-agreement-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-data-formal-agreement-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-outcome",
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
                          "label": "@jcu-rdmp-data-classification-item-outcome-label",
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
                          "label": "@jcu-rdmp-data-classification-item-outcome-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-outcome-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "jcu-rdmp-data-classification-item-outcome-details",
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
                          "label": "@jcu-rdmp-data-classification-item-outcome-details-label",
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
                          "label": "@jcu-rdmp-data-classification-item-outcome-details-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@jcu-rdmp-data-classification-item-outcome-details-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    }
                  ],
                  "selected": false
                }
              },
              "layout": {
                "class": "TabContentLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@dmpt-data-classification-tab",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false,
                  "buttonLabel": "@dmpt-data-classification-tab"
                }
              }
            },
            {
              "name": "permissions",
              "constraints": {
                "authorization": {
                  "allowRoles": [
                    "Admin",
                    "Librarians"
                  ]
                },
                "allowModes": []
              },
              "component": {
                "class": "TabContentComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@record-permissions-tab",
                  "disabled": false,
                  "autofocus": false,
                  "componentDefinitions": [
                    {
                      "name": "ContentComponent-fields-4-definition-fields-9-definition-fields-0",
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
                          "content": "@record-permissions-tab-heading"
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
                      "name": "permissions",
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
                          "label": "permissions",
                          "disabled": false,
                          "autofocus": false,
                          "content": "Not yet implemented in v5: v4ClassName \"RecordPermissionsField\" v4CompClassName \"\" v4Name \"permissions\". At path '[\"fields\",\"4\",\"definition\",\"fields\",\"9\",\"definition\",\"fields\",\"1\"]'."
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
                  ],
                  "selected": false
                }
              },
              "layout": {
                "class": "TabContentLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@record-permissions-tab",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false,
                  "buttonLabel": "@record-permissions-tab"
                }
              }
            },
            {
              "name": "AdminNotes",
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
                "class": "TabContentComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@record-admin-notes-tab",
                  "disabled": false,
                  "autofocus": false,
                  "componentDefinitions": [
                    {
                      "name": "ContentComponent-fields-4-definition-fields-10-definition-fields-0",
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
                          "content": "@record-admin-notes-tab-heading"
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
                      "name": "admin_notes",
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
                          "label": "@admin-notes-general-label",
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
                              "class": "GroupComponent",
                              "config": {
                                "readonly": false,
                                "visible": true,
                                "editMode": true,
                                "label": "admin_notes_group",
                                "disabled": false,
                                "autofocus": false,
                                "componentDefinitions": [
                                  {
                                    "name": "text",
                                    "constraints": {
                                      "authorization": {
                                        "allowRoles": []
                                      },
                                      "allowModes": [
                                        "edit"
                                      ]
                                    },
                                    "component": {
                                      "class": "TextAreaComponent",
                                      "config": {
                                        "readonly": false,
                                        "visible": true,
                                        "editMode": true,
                                        "label": "@admin-notes-label",
                                        "disabled": false,
                                        "autofocus": false,
                                        "rows": 2,
                                        "cols": 200,
                                        "placeholder": ""
                                      }
                                    },
                                    "model": {
                                      "class": "TextAreaModel",
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
                                        "label": "@admin-notes-label",
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
                                    "name": "text",
                                    "constraints": {
                                      "authorization": {
                                        "allowRoles": []
                                      },
                                      "allowModes": [
                                        "view"
                                      ]
                                    },
                                    "component": {
                                      "class": "RichTextEditorComponent",
                                      "config": {
                                        "readonly": false,
                                        "visible": true,
                                        "editMode": true,
                                        "label": "@admin-notes-label",
                                        "disabled": false,
                                        "autofocus": false,
                                        "outputFormat": "markdown",
                                        "showSourceToggle": false,
                                        "toolbar": [
                                          "heading",
                                          "bold",
                                          "italic",
                                          "link",
                                          "bulletList",
                                          "orderedList",
                                          "blockquote",
                                          "table",
                                          "undo",
                                          "redo"
                                        ],
                                        "minHeight": "200px",
                                        "placeholder": ""
                                      }
                                    },
                                    "model": {
                                      "class": "RichTextEditorModel",
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
                                        "label": "@admin-notes-label",
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
                                    "name": "type",
                                    "constraints": {
                                      "authorization": {
                                        "allowRoles": []
                                      },
                                      "allowModes": [
                                        "view"
                                      ]
                                    },
                                    "component": {
                                      "class": "DropdownInputComponent",
                                      "config": {
                                        "readonly": false,
                                        "visible": true,
                                        "editMode": true,
                                        "label": "@admin-notes-label",
                                        "disabled": false,
                                        "autofocus": false,
                                        "options": [
                                          {
                                            "label": "Note",
                                            "value": ""
                                          }
                                        ]
                                      }
                                    },
                                    "model": {
                                      "class": "DropdownInputModel",
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
                                        "label": "@admin-notes-label",
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
                          "label": "@admin-notes-general-label",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@admin-notes-general-label-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "admin_active_storage_locations",
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
                          "label": "@dmpt-admin-active-storage-locations",
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
                              "class": "GroupComponent",
                              "config": {
                                "readonly": false,
                                "visible": true,
                                "editMode": true,
                                "label": "admin_active_storage_location",
                                "disabled": false,
                                "autofocus": false,
                                "componentDefinitions": [
                                  {
                                    "name": "admin_active_storage_location_name",
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
                                        "label": "@dmpt-admin-active-storage-location-name",
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
                                        "label": "@dmpt-admin-active-storage-location-name",
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
                                    "name": "admin_active_storage_location_notes",
                                    "constraints": {
                                      "authorization": {
                                        "allowRoles": []
                                      },
                                      "allowModes": []
                                    },
                                    "component": {
                                      "class": "TextAreaComponent",
                                      "config": {
                                        "readonly": false,
                                        "visible": true,
                                        "editMode": true,
                                        "label": "@dmpt-admin-active-storage-location-notes",
                                        "disabled": false,
                                        "autofocus": false,
                                        "rows": 1,
                                        "cols": 20,
                                        "placeholder": ""
                                      }
                                    },
                                    "model": {
                                      "class": "TextAreaModel",
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
                                        "label": "@dmpt-admin-active-storage-location-notes",
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
                          "label": "@dmpt-admin-active-storage-locations",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-related-publication-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "adminNotesAttachments",
                      "constraints": {
                        "authorization": {
                          "allowRoles": []
                        },
                        "allowModes": []
                      },
                      "component": {
                        "class": "FileUploadComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-admin-notes-attachments",
                          "disabled": false,
                          "autofocus": false,
                          "restrictions": {
                            "metadataFields": [
                              {
                                "id": "notes",
                                "name": "Notes",
                                "placeholder": "Notes about this file."
                              }
                            ]
                          },
                          "enabledSources": [],
                          "allowUploadWithoutSave": false,
                          "uppyDashboardNote": "Documents up to 100 MB in total"
                        }
                      },
                      "model": {
                        "class": "FileUploadModel",
                        "config": {
                          "defaultValue": [],
                          "validators": []
                        }
                      },
                      "layout": {
                        "class": "DefaultLayout",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dmpt-admin-notes-attachments",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-admin-notes-attachments-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "confirmDelete",
                      "constraints": {
                        "authorization": {
                          "allowRoles": [
                            "Admin",
                            "Librarian"
                          ]
                        },
                        "allowModes": [
                          "edit"
                        ]
                      },
                      "component": {
                        "class": "SaveButtonComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@record-delete",
                          "disabled": false,
                          "autofocus": false
                        }
                      },
                      "layout": {
                        "class": "DefaultLayout",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@record-delete",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    }
                  ],
                  "selected": false
                }
              },
              "layout": {
                "class": "TabContentLayout",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@record-admin-notes-tab",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false,
                  "buttonLabel": "@record-admin-notes-tab"
                }
              }
            }
          ]
        }
      },
      "layout": {
        "class": "TabLayout",
        "config": {
          "readonly": false,
          "visible": true,
          "editMode": true,
          "hostCssClasses": "rb-form-tab-layout",
          "disabled": false,
          "autofocus": false,
          "labelRequiredStr": "*",
          "cssClassesMap": {},
          "helpTextVisibleOnInit": false,
          "helpTextVisible": false,
          "tabShellCssClass": "rb-form-tab-shell",
          "tabNavWrapperCssClass": "rb-form-tab-nav-wrapper",
          "tabPanelWrapperCssClass": "rb-form-tab-panel-wrapper",
          "buttonSectionCssClass": "rb-form-tab-nav nav flex-column nav-pills",
          "tabPaneCssClass": "rb-form-tab-pane tab-pane fade",
          "tabPaneActiveCssClass": "active show",
          "buttonSectionAriaOrientation": "vertical"
        }
      }
    },
    {
      "name": "GroupComponent-fields-5",
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
          "disabled": false,
          "autofocus": false,
          "componentDefinitions": [
            {
              "name": "mainTabNav",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "TabNavButtonComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "disabled": false,
                  "autofocus": false,
                  "prevLabel": "@tab-nav-previous",
                  "nextLabel": "@tab-nav-next",
                  "targetTabContainerId": "mainTab",
                  "endDisplayMode": "hidden"
                }
              },
              "layout": {
                "class": "InlineLayout",
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
              "name": "SaveButtonComponent-fields-5-definition-fields-2",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "SaveButtonComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "Save",
                  "disabled": false,
                  "autofocus": false
                }
              },
              "layout": {
                "class": "InlineLayout",
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
              "name": "SaveButtonComponent-fields-5-definition-fields-3",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "SaveButtonComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "Save & Close",
                  "disabled": false,
                  "autofocus": false
                }
              },
              "layout": {
                "class": "InlineLayout",
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
              "name": "CancelButtonComponent-fields-5-definition-fields-4",
              "constraints": {
                "authorization": {
                  "allowRoles": []
                },
                "allowModes": []
              },
              "component": {
                "class": "CancelButtonComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "Close",
                  "disabled": false,
                  "autofocus": false,
                  "confirmationMessage": "@cancel-without-saving-confirm",
                  "confirmationTitle": "@cancel-without-saving-confirm-title",
                  "cancelButtonMessage": "@cancel-button-message",
                  "confirmButtonMessage": "@cancel-dialog-confirm-button-message"
                }
              },
              "layout": {
                "class": "InlineLayout",
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
          "validators": [],
          "disabled": true
        }
      },
      "layout": {
        "class": "ActionRowLayout",
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
      "name": "form-render-complete",
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
          "label": "Test",
          "disabled": false,
          "autofocus": false,
          "componentDefinitions": [
            {
              "name": "ContentComponent-fields-6-definition-fields-0",
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
                  "template": "<span>{{content}}</span>",
                  "content": "will be empty"
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
          "label": "Test",
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
  "attachmentFields": [
    "contractualObligations_licences",
    "adminNotesAttachments"
  ]
};

export default formConfig;
