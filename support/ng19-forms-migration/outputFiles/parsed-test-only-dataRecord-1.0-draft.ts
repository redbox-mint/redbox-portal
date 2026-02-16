
import { FormConfigFrame } from "@researchdatabox/sails-ng-common";
const formConfig: FormConfigFrame = {
  "name": "dataRecord-1.0-draft",
  "type": "dataRecord",
  "viewCssClasses": "row col-md-offset-1 col-md-10",
  "editCssClasses": "row col-md-12",
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
      "name": "GroupComponent-fields-1",
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
              "name": "SaveButtonComponent-fields-1-definition-fields-0",
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
                  "label": "@data-record-edit-record-link",
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
                  "label": "@data-record-edit-record-link",
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
              "name": "SaveButtonComponent-fields-1-definition-fields-1",
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
                  "label": "@dmp-associated-rdmp-link",
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
                  "label": "@dmp-associated-rdmp-link",
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
              "name": "SaveButtonComponent-fields-1-definition-fields-2",
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
                "class": "SaveButtonComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
                  "label": "@view-record-audit-link",
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
                  "label": "@view-record-audit-link",
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
              "name": "SaveButtonComponent-fields-1-definition-fields-3",
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
                  "label": "@dmp-create-datapublication-link",
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
                  "label": "@dmp-create-datapublication-link",
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
          "label": "@dataRecord-description",
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
          "label": "@dataRecord-description",
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
              "name": "aim",
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
                  "label": "@dataRecord-aim-tab",
                  "disabled": false,
                  "autofocus": false,
                  "componentDefinitions": [
                    {
                      "name": "parameterRetriever",
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
                          "label": "parameterRetriever",
                          "disabled": false,
                          "autofocus": false,
                          "content": "Not yet implemented in v5: v4ClassName \"ParameterRetriever\" v4CompClassName \"ParameterRetrieverComponent\" v4Name \"parameterRetriever\". At path '[\"fields\",\"3\",\"definition\",\"fields\",\"0\",\"definition\",\"fields\",\"0\"]'."
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
                      "name": "rdmpGetter",
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
                          "label": "rdmpGetter",
                          "disabled": false,
                          "autofocus": false,
                          "content": "Not yet implemented in v5: v4ClassName \"RecordMetadataRetriever\" v4CompClassName \"RecordMetadataRetrieverComponent\" v4Name \"rdmpGetter\". At path '[\"fields\",\"3\",\"definition\",\"fields\",\"0\",\"definition\",\"fields\",\"1\"]'."
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
                      "name": "ContentComponent-fields-3-definition-fields-0-definition-fields-2",
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
                          "content": "@dataRecord-aim-heading"
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
                      "name": "rdmp",
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
                          "label": "@dataRecord-selector-label",
                          "disabled": false,
                          "autofocus": false,
                          "content": "Not yet implemented in v5: v4ClassName \"RelatedObjectSelector\" v4CompClassName \"RelatedObjectSelectorComponent\" v4Name \"rdmp\". At path '[\"fields\",\"3\",\"definition\",\"fields\",\"0\",\"definition\",\"fields\",\"3\"]'."
                        }
                      },
                      "layout": {
                        "class": "DefaultLayout",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dataRecord-selector-label",
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
                      "name": "aim_project_name",
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
                          "label": "@dataRecord-aim-project-name",
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
                          "label": "@dataRecord-aim-project-name",
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
                                "sourceType": "vocabulary",
                                "staticOptions": [],
                                "vocabRef": "Funding Bodies",
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
                      "name": "dc:coverage_vivo:DateTimeInterval_vivo:end",
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
                          "label": "dc:coverage_vivo:DateTimeInterval_vivo:end",
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
                                "sourceType": "vocabulary",
                                "staticOptions": [],
                                "vocabRef": "Research Activities",
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
                  "label": "@dataRecord-aim-tab",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false,
                  "buttonLabel": "@dataRecord-aim-tab"
                }
              }
            },
            {
              "name": "about",
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
                  "label": "@dataRecord-about-tab",
                  "disabled": false,
                  "autofocus": false,
                  "componentDefinitions": [
                    {
                      "name": "ContentComponent-fields-3-definition-fields-1-definition-fields-0",
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
                          "content": "@dataRecord-about-heading"
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
                        "allowModes": []
                      },
                      "component": {
                        "class": "SimpleInputComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dataRecord-title",
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
                          "label": "@dataRecord-title",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dataRecord-title-help",
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
                        "allowModes": []
                      },
                      "component": {
                        "class": "TextAreaComponent",
                        "config": {
                          "readonly": false,
                          "visible": true,
                          "editMode": true,
                          "label": "@dataRecord-what-tab-description",
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
                          "label": "@dataRecord-what-tab-description",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dataRecord-what-tab-description-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "datatype",
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
                          "label": "@dataRecord-datatype",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@dataRecord-dataype-select:Empty",
                              "value": ""
                            },
                            {
                              "label": "@dataRecord-dataype-select:catalogueOrIndex",
                              "value": "catalogueOrIndex"
                            },
                            {
                              "label": "@dataRecord-dataype-select:collection",
                              "value": "collection"
                            },
                            {
                              "label": "@dataRecord-dataype-select:dataset",
                              "value": "dataset"
                            },
                            {
                              "label": "@dataRecord-dataype-select:registry",
                              "value": "registry"
                            },
                            {
                              "label": "@dataRecord-dataype-select:repository",
                              "value": "repository"
                            }
                          ]
                        }
                      },
                      "model": {
                        "class": "DropdownInputModel",
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
                          "label": "@dataRecord-datatype",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dataRecord-datatype-help",
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
                          "label": "@dataRecord-keywords",
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
                          "label": "@dataRecord-keywords",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dataRecord-keywords-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "dc_extent",
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
                          "label": "@dataRecord-dc_extent",
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
                              "class": "maxLength",
                              "config": {
                                "maxLength": 10
                              }
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
                          "label": "@dataRecord-dc_extent",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dataRecord-dc_extent-help",
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
                  "label": "@dataRecord-about-tab",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false,
                  "buttonLabel": "@dataRecord-about-tab"
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
                  "label": "@dataRecord-people-tab",
                  "disabled": false,
                  "autofocus": false,
                  "componentDefinitions": [
                    {
                      "name": "ContentComponent-fields-3-definition-fields-2-definition-fields-0",
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
                          "content": "@dataRecord-people-heading"
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
                          "label": "@dmpt-people-tab-ci",
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
                                  "label": "@dmpt-people-tab-ci",
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
                                  "label": "@dmpt-people-tab-ci",
                                  "disabled": false,
                                  "autofocus": false,
                                  "labelRequiredStr": "*",
                                  "helpText": "@dmpt-people-tab-ci-help",
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
                          "label": "@dmpt-people-tab-data-manager",
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
                                  "label": "@dmpt-people-tab-data-manager",
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
                                  "label": "@dmpt-people-tab-data-manager",
                                  "disabled": false,
                                  "autofocus": false,
                                  "labelRequiredStr": "*",
                                  "helpText": "@dmpt-people-tab-data-manager-help",
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
                  "label": "@dataRecord-people-tab",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false,
                  "buttonLabel": "@dataRecord-people-tab"
                }
              }
            },
            {
              "name": "relationships",
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
                  "label": "@dataRecord-relationships-tab",
                  "disabled": false,
                  "autofocus": false,
                  "componentDefinitions": [
                    {
                      "name": "ContentComponent-fields-3-definition-fields-3-definition-fields-0",
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
                          "content": "@dataRecord-relationships-heading"
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
                              "label": "@dmpt-redbox:retentionPeriod_dc:date-20years",
                              "value": "20years"
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
                          "label": "@dataRecord:retentionPeriod_dc:date_skos:note",
                          "disabled": false,
                          "autofocus": false,
                          "options": [
                            {
                              "label": "@dmpt-select:Empty",
                              "value": ""
                            },
                            {
                              "label": "@dmpt-redbox:retentionPeriod_dc:date_skos:note-heritage",
                              "value": "heritage"
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
                              "label": "@dmpt-redbox:retentionPeriod_dc:date_skos:note-costly_impossible",
                              "value": "costly_impossible"
                            },
                            {
                              "label": "@dmpt-redbox:retentionPeriod_dc:date_skos:note-commercial",
                              "value": "commercial"
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
                          "label": "@dataRecord:retentionPeriod_dc:date_skos:note",
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
                      "name": "disposalDate",
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
                          "label": "@dataRecord-disposalDate",
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
                          "label": "@dataRecord-disposalDate",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dataRecord-disposalDate-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "related_publications",
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
                          "label": "@dmpt-related-publication",
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
                                "label": "related_publication",
                                "disabled": false,
                                "autofocus": false,
                                "componentDefinitions": [
                                  {
                                    "name": "related_url",
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
                                        "label": "@dmpt-related-publication-url",
                                        "disabled": false,
                                        "autofocus": false,
                                        "content": "Not yet implemented in v5: v4ClassName \"LinkValueComponent\" v4CompClassName \"\" v4Name \"related_url\". At path '[\"fields\",\"3\",\"definition\",\"fields\",\"3\",\"definition\",\"fields\",\"4\",\"definition\",\"fields\",\"0\",\"definition\",\"fields\",\"0\"]'."
                                      }
                                    },
                                    "layout": {
                                      "class": "DefaultLayout",
                                      "config": {
                                        "readonly": false,
                                        "visible": true,
                                        "editMode": true,
                                        "label": "@dmpt-related-publication-url",
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
                                    "name": "related_url",
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
                                        "label": "@dmpt-related-publication-url",
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
                                        "label": "@dmpt-related-publication-url",
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
                                    "name": "related_title",
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
                                        "label": "@dmpt-related-publication-title",
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
                                        "label": "@dmpt-related-publication-title",
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
                                    "name": "related_notes",
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
                                        "label": "@dmpt-related-publication-notes",
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
                                        "label": "@dmpt-related-publication-notes",
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
                          "label": "@dmpt-related-publication",
                          "disabled": false,
                          "autofocus": false,
                          "labelRequiredStr": "*",
                          "helpText": "@dmpt-related-publication-help",
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
                  "label": "@dataRecord-relationships-tab",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false,
                  "buttonLabel": "@dataRecord-relationships-tab"
                }
              }
            },
            {
              "name": "data",
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
                  "label": "@dataRecord-data-tab",
                  "disabled": false,
                  "autofocus": false,
                  "componentDefinitions": [
                    {
                      "name": "ContentComponent-fields-3-definition-fields-4-definition-fields-0",
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
                          "content": "@dataRecord-data-heading"
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
                      "name": "dataLocations",
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
                          "label": "dataLocations",
                          "disabled": false,
                          "autofocus": false,
                          "content": "Not yet implemented in v5: v4ClassName \"DataLocation\" v4CompClassName \"DataLocationComponent\" v4Name \"dataLocations\". At path '[\"fields\",\"3\",\"definition\",\"fields\",\"4\",\"definition\",\"fields\",\"1\"]'."
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
                          "helpText": "@dataLocations-help",
                          "cssClassesMap": {},
                          "helpTextVisibleOnInit": false,
                          "helpTextVisible": false
                        }
                      }
                    },
                    {
                      "name": "software_equipment",
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
                          "label": "@dataRecord-data-software",
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
                          "label": "@dataRecord-data-software",
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
                  "label": "@dataRecord-data-tab",
                  "disabled": false,
                  "autofocus": false,
                  "labelRequiredStr": "*",
                  "cssClassesMap": {},
                  "helpTextVisibleOnInit": false,
                  "helpTextVisible": false,
                  "buttonLabel": "@dataRecord-data-tab"
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
                  "label": "@record-permissions-tab",
                  "disabled": false,
                  "autofocus": false,
                  "componentDefinitions": [
                    {
                      "name": "ContentComponent-fields-3-definition-fields-5-definition-fields-0",
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
                          "content": "Not yet implemented in v5: v4ClassName \"RecordPermissionsField\" v4CompClassName \"\" v4Name \"permissions\". At path '[\"fields\",\"3\",\"definition\",\"fields\",\"5\",\"definition\",\"fields\",\"1\"]'."
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
          "hostCssClasses": "d-flex align-items-start",
          "disabled": false,
          "autofocus": false,
          "labelRequiredStr": "*",
          "cssClassesMap": {},
          "helpTextVisibleOnInit": false,
          "helpTextVisible": false,
          "buttonSectionCssClass": "nav flex-column nav-pills me-5",
          "tabPaneCssClass": "tab-pane fade",
          "tabPaneActiveCssClass": "active show",
          "buttonSectionAriaOrientation": "vertical"
        }
      }
    },
    {
      "name": "GroupComponent-fields-4",
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
                "class": "SaveButtonComponent",
                "config": {
                  "readonly": false,
                  "visible": true,
                  "editMode": true,
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
              "name": "-fields-4-definition-fields-1",
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
                  "content": "Not yet implemented in v5: v4ClassName \"Spacer\" v4CompClassName \"\" v4Name undefined. At path '[\"fields\",\"4\",\"definition\",\"fields\",\"1\"]'."
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
              "name": "SaveButtonComponent-fields-4-definition-fields-2",
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
                  "label": "@save-button",
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
                  "label": "@save-button",
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
              "name": "SaveButtonComponent-fields-4-definition-fields-3",
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
                  "label": "@save-and-close-button",
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
                  "label": "@save-and-close-button",
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
              "name": "SaveButtonComponent-fields-4-definition-fields-4",
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
                  "label": "@close-button",
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
                  "label": "@close-button",
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
              "name": "ContentComponent-fields-5-definition-fields-0",
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
      "name": "-fields-6",
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
          "content": "Not yet implemented in v5: v4ClassName \"EventHandler\" v4CompClassName \"\" v4Name undefined. At path '[\"fields\",\"6\"]'."
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
  "debugValue": true
};
module.exports = formConfig;
