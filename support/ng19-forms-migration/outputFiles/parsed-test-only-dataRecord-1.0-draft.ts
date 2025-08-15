import { FormConfig } from "@researchdatabox/sails-ng-common";
import { formValidatorsSharedDefinitions } from "../config/validators";

const formConfig: FormConfig = {
  name: "dataRecord-1.0-draft",
  componentDefinitions: [
  {
    "name": "title",
    "component": {
      "class": "TextBlockComponent",
      "config": {
        "type": "h1"
      }
    },
    "model": {
      "class": "TextBlockModel",
      "config": {
        "defaultValue": ""
      }
    }
  },
  {
    "component": {
      "class": "GroupComponent",
      "config": {
        "cssClasses": "form-inline"
      }
    },
    "componentDefinitions": [
      {
        "name": "@data-record-edit-record-link",
        "component": {
          "class": "AnchorOrButtonComponent",
          "config": {
            "controlType": "anchor",
            "cssClasses": "btn btn-large btn-info margin-15"
          }
        },
        "model": {
          "class": "AnchorOrButtonModel",
          "config": {
            "defaultValue": "/@branding/@portal/record/edit/@oid"
          }
        }
      },
      {
        "name": "@dmp-associated-rdmp-link",
        "component": {
          "class": "AnchorOrButtonComponent",
          "config": {
            "controlType": "anchor",
            "cssClasses": "btn btn-large btn-info margin-15"
          }
        },
        "model": {
          "class": "AnchorOrButtonModel",
          "config": {
            "defaultValue": "/@branding/@portal/record/view/@metadata[rdmp.oid]"
          }
        }
      },
      {
        "name": "@view-record-audit-link",
        "component": {
          "class": "AnchorOrButtonComponent",
          "config": {
            "controlType": "anchor",
            "cssClasses": "btn btn-large btn-info margin-15"
          }
        },
        "model": {
          "class": "AnchorOrButtonModel",
          "config": {
            "defaultValue": "/@branding/@portal/record/viewAudit/@oid"
          }
        }
      },
      {
        "name": "@dmp-create-datapublication-link",
        "component": {
          "class": "AnchorOrButtonComponent",
          "config": {
            "controlType": "anchor",
            "cssClasses": "btn btn-large btn-info margin-15"
          }
        },
        "model": {
          "class": "AnchorOrButtonModel",
          "config": {
            "defaultValue": "/@branding/@portal/record/dataPublication/edit?dataRecordOid=@oid"
          }
        }
      }
    ]
  },
  {
    "name": "description",
    "layout": {
      "class": "DefaultLayoutComponent",
      "config": {
        "label": "@dataRecord-description",
        "helpText": ""
      }
    },
    "component": {
      "class": "TextAreaComponent",
      "config": {}
    },
    "model": {
      "class": "TextAreaModel",
      "config": {
        "defaultValue": ""
      }
    }
  },
  {
    "component": {
      "class": "GroupComponent",
      "config": {}
    },
    "componentDefinitions": [
      {
        "name": "",
        "component": {
          "class": "TabNavButtonComponent",
          "config": {
            "cssClasses": "btn btn-primary"
          }
        }
      },
      {
        "class": "Unparsable Component: Spacer"
      },
      {
        "name": "",
        "component": {
          "class": "SaveButtonComponent",
          "config": {
            "cssClasses": "btn-success"
          }
        }
      },
      {
        "name": "",
        "component": {
          "class": "SaveButtonComponent",
          "config": {}
        }
      },
      {
        "name": "",
        "component": {
          "class": "CancelButtonComponent",
          "config": {}
        }
      }
    ]
  },
  {
    "class": "Unparsable Component: Container",
    "componentDefinitions": [
      {
        "name": "",
        "component": {
          "class": "TextBlockComponent",
          "config": {
            "type": "span"
          }
        },
        "model": {
          "class": "TextBlockModel",
          "config": {
            "defaultValue": "will be empty"
          }
        }
      }
    ]
  },
  {
    "class": "Unparsable Component: EventHandler"
  },
  {
    "name": "main_tab",
    "component": {
      "class": "TabComponent",
      "config": {
        "mainCssClass": "d-flex align-items-start",
        "buttonSectionCssClass": "nav flex-column nav-pills me-5",
        "tabContentSectionCssClass": "tab-content",
        "tabPaneCssClass": "tab-pane fade",
        "tabPaneActiveCssClass": "active show",
        "tabs": [
          {
            "id": "aim",
            "buttonLabel": "@dataRecord-aim-tab",
            "componentDefinitions": [
              {
                "class": "Unparsable Component: ParameterRetriever"
              },
              {
                "class": "Unparsable Component: RecordMetadataRetriever"
              },
              {
                "name": "",
                "component": {
                  "class": "TextBlockComponent",
                  "config": {
                    "type": "h3"
                  }
                },
                "model": {
                  "class": "TextBlockModel",
                  "config": {
                    "defaultValue": "@dataRecord-aim-heading"
                  }
                }
              },
              {
                "name": "rdmp",
                "component": {
                  "class": "RelatedObjectSelectorComponent",
                  "config": {}
                },
                "unparsable": {
                  "subscribe": {
                    "rdmpGetter": {
                      "onValueUpdate": [
                        {
                          "action": "recordSelected"
                        }
                      ]
                    }
                  }
                }
              },
              {
                "name": "aim_project_name",
                "layout": {
                  "class": "DefaultLayoutComponent",
                  "config": {
                    "label": "@dataRecord-aim-project-name",
                    "helpText": ""
                  }
                },
                "component": {
                  "class": "TextComponent",
                  "config": {
                    "type": "text"
                  }
                },
                "model": {
                  "class": "TextModel",
                  "config": {
                    "defaultValue": ""
                  }
                },
                "unparsable": {
                  "subscribe": {
                    "rdmpGetter": {
                      "onValueUpdate": [
                        {
                          "action": "utilityService.getPropertyFromObject",
                          "field": "title"
                        }
                      ]
                    }
                  }
                }
              },
              {
                "component": {
                  "class": "RepeatableComponent",
                  "config": {}
                },
                "model": {
                  "class": "RepeatableComponentModel",
                  "config": {
                    "defaultValue": ""
                  }
                },
                "unparsable": {
                  "subscribe": {
                    "rdmpGetter": {
                      "onValueUpdate": [
                        {
                          "action": "utilityService.getPropertyFromObject",
                          "field": "foaf:fundedBy_foaf:Agent"
                        }
                      ]
                    }
                  }
                },
                "componentDefinitions": [
                  {
                    "name": "",
                    "layout": {
                      "class": "DefaultLayoutComponent",
                      "config": {
                        "label": "",
                        "helpText": ""
                      }
                    },
                    "component": {
                      "class": "VocabComponent",
                      "config": {}
                    }
                  }
                ]
              },
              {
                "name": "dc:coverage_vivo:DateTimeInterval_vivo:end",
                "component": {
                  "class": "HiddenValueComponent",
                  "config": {}
                },
                "unparsable": {
                  "subscribe": {
                    "rdmpGetter": {
                      "onValueUpdate": [
                        {
                          "action": "utilityService.getPropertyFromObject",
                          "field": "dc:coverage_vivo:DateTimeInterval_vivo:end"
                        }
                      ]
                    }
                  }
                }
              },
              {
                "component": {
                  "class": "RepeatableComponent",
                  "config": {}
                },
                "model": {
                  "class": "RepeatableComponentModel",
                  "config": {
                    "defaultValue": ""
                  }
                },
                "unparsable": {
                  "subscribe": {
                    "rdmpGetter": {
                      "onValueUpdate": [
                        {
                          "action": "utilityService.getPropertyFromObject",
                          "field": "foaf:fundedBy_vivo:Grant"
                        }
                      ]
                    }
                  },
                  "publish": {
                    "onValueUpdate": {
                      "modelEventSource": "valueChanges",
                      "fields": [
                        {
                          "grant_number": "grant_number[0]"
                        },
                        {
                          "dc_title": "dc_title"
                        }
                      ]
                    }
                  }
                },
                "componentDefinitions": [
                  {
                    "name": "",
                    "layout": {
                      "class": "DefaultLayoutComponent",
                      "config": {
                        "label": "",
                        "helpText": ""
                      }
                    },
                    "component": {
                      "class": "VocabComponent",
                      "config": {}
                    }
                  }
                ]
              },
              {
                "name": "dc:subject_anzsrc:for",
                "layout": {
                  "class": "DefaultLayoutComponent",
                  "config": {
                    "label": "@dmpt-project-anzsrcFor",
                    "helpText": "@dmpt-project-anzsrcFor-help"
                  }
                },
                "component": {
                  "class": "ANDSVocabComponent",
                  "config": {}
                },
                "unparsable": {
                  "subscribe": {
                    "rdmpGetter": {
                      "onValueUpdate": [
                        {
                          "action": "utilityService.getPropertyFromObject",
                          "field": "dc:subject_anzsrc:for"
                        }
                      ]
                    }
                  }
                }
              },
              {
                "name": "dc:subject_anzsrc:seo",
                "layout": {
                  "class": "DefaultLayoutComponent",
                  "config": {
                    "label": "@dmpt-project-anzsrcSeo",
                    "helpText": "@dmpt-project-anzsrcSeo-help"
                  }
                },
                "component": {
                  "class": "ANDSVocabComponent",
                  "config": {}
                },
                "unparsable": {
                  "subscribe": {
                    "rdmpGetter": {
                      "onValueUpdate": [
                        {
                          "action": "utilityService.getPropertyFromObject",
                          "field": "dc:subject_anzsrc:seo"
                        }
                      ]
                    }
                  }
                }
              }
            ]
          },
          {
            "id": "about",
            "buttonLabel": "@dataRecord-about-tab",
            "componentDefinitions": [
              {
                "name": "",
                "component": {
                  "class": "TextBlockComponent",
                  "config": {
                    "type": "h3"
                  }
                },
                "model": {
                  "class": "TextBlockModel",
                  "config": {
                    "defaultValue": "@dataRecord-about-heading"
                  }
                }
              },
              {
                "name": "title",
                "layout": {
                  "class": "DefaultLayoutComponent",
                  "config": {
                    "label": "@dataRecord-title",
                    "helpText": "@dataRecord-title-help"
                  }
                },
                "component": {
                  "class": "TextComponent",
                  "config": {
                    "type": "text"
                  }
                },
                "model": {
                  "class": "TextModel",
                  "config": {
                    "defaultValue": ""
                  }
                }
              },
              {
                "name": "description",
                "layout": {
                  "class": "DefaultLayoutComponent",
                  "config": {
                    "label": "@dataRecord-what-tab-description",
                    "helpText": "@dataRecord-what-tab-description-help"
                  }
                },
                "component": {
                  "class": "TextAreaComponent",
                  "config": {
                    "type": "text"
                  }
                },
                "model": {
                  "class": "TextAreaModel",
                  "config": {
                    "defaultValue": ""
                  }
                }
              },
              {
                "class": "Unparsable Component: SelectionField"
              },
              {
                "name": "finalKeywords",
                "layout": {
                  "class": "DefaultLayoutComponent",
                  "config": {
                    "label": "@dataRecord-keywords",
                    "helpText": "@dataRecord-keywords-help"
                  }
                },
                "component": {
                  "class": "TextfieldComponent",
                  "config": {}
                },
                "model": {
                  "class": "TextInputModel",
                  "config": {
                    "defaultValue": ""
                  }
                },
                "unparsable": {
                  "subscribe": {
                    "rdmpGetter": {
                      "onValueUpdate": [
                        {
                          "action": "utilityService.getPropertyFromObject",
                          "field": "finalKeywords"
                        }
                      ]
                    }
                  }
                },
                "componentDefinitions": [
                  {
                    "name": "",
                    "layout": {
                      "class": "DefaultLayoutComponent",
                      "config": {
                        "label": "",
                        "helpText": ""
                      }
                    },
                    "component": {
                      "class": "TextComponent",
                      "config": {
                        "type": "text"
                      }
                    },
                    "model": {
                      "class": "TextModel",
                      "config": {
                        "defaultValue": ""
                      }
                    }
                  }
                ]
              },
              {
                "name": "dc_extent",
                "layout": {
                  "class": "DefaultLayoutComponent",
                  "config": {
                    "label": "@dataRecord-dc_extent",
                    "helpText": "@dataRecord-dc_extent-help"
                  }
                },
                "component": {
                  "class": "TextComponent",
                  "config": {
                    "type": "text"
                  }
                },
                "model": {
                  "class": "TextModel",
                  "config": {
                    "defaultValue": "",
                    "validators": [
                      {
                        "name": "maxLength",
                        "message": "",
                        "config": {
                          "maxLength": 10
                        }
                      }
                    ]
                  }
                }
              }
            ]
          },
          {
            "id": "people",
            "buttonLabel": "@dataRecord-people-tab",
            "componentDefinitions": [
              {
                "name": "",
                "component": {
                  "class": "TextBlockComponent",
                  "config": {
                    "type": "h3"
                  }
                },
                "model": {
                  "class": "TextBlockModel",
                  "config": {
                    "defaultValue": "@dataRecord-people-heading"
                  }
                }
              },
              {
                "name": "contributor_ci",
                "layout": {
                  "class": "DefaultLayoutComponent",
                  "config": {
                    "label": "@dmpt-people-tab-ci",
                    "helpText": "@dmpt-people-tab-ci-help"
                  }
                },
                "component": {
                  "class": "GroupComponent",
                  "config": {}
                },
                "model": {
                  "class": "GroupModel",
                  "config": {
                    "defaultValue": ""
                  }
                },
                "unparsable": {
                  "subscribe": {
                    "rdmpGetter": {
                      "onValueUpdate": [
                        {
                          "action": "utilityService.getPropertyFromObject",
                          "field": "contributor_ci"
                        }
                      ]
                    }
                  },
                  "publish": {
                    "onValueUpdate": {
                      "modelEventSource": "valueChanges"
                    }
                  }
                }
              },
              {
                "name": "contributor_data_manager",
                "layout": {
                  "class": "DefaultLayoutComponent",
                  "config": {
                    "label": "@dmpt-people-tab-data-manager",
                    "helpText": "@dmpt-people-tab-data-manager-help"
                  }
                },
                "component": {
                  "class": "GroupComponent",
                  "config": {}
                },
                "model": {
                  "class": "GroupModel",
                  "config": {
                    "defaultValue": {
                      "name": "@user_name",
                      "email": "@user_email",
                      "username": "@user_username",
                      "text_full_name": "@user_name"
                    }
                  }
                },
                "unparsable": {
                  "subscribe": {
                    "rdmpGetter": {
                      "onValueUpdate": [
                        {
                          "action": "utilityService.getPropertyFromObject",
                          "field": "contributor_data_manager"
                        }
                      ]
                    }
                  },
                  "publish": {
                    "onValueUpdate": {
                      "modelEventSource": "valueChanges"
                    }
                  }
                }
              },
              {
                "component": {
                  "class": "RepeatableComponent",
                  "config": {}
                },
                "model": {
                  "class": "RepeatableComponentModel",
                  "config": {
                    "defaultValue": ""
                  }
                },
                "unparsable": {
                  "subscribe": {
                    "rdmpGetter": {
                      "onValueUpdate": [
                        {
                          "action": "utilityService.getPropertyFromObject",
                          "field": "contributors"
                        }
                      ]
                    }
                  }
                },
                "componentDefinitions": [
                  {
                    "name": "",
                    "layout": {
                      "class": "DefaultLayoutComponent",
                      "config": {
                        "label": "@dmpt-people-tab-contributors",
                        "helpText": "@dmpt-people-tab-contributors-help"
                      }
                    },
                    "component": {
                      "class": "GroupComponent",
                      "config": {}
                    },
                    "model": {
                      "class": "GroupModel",
                      "config": {
                        "defaultValue": ""
                      }
                    },
                    "unparsable": {
                      "publish": {
                        "onValueUpdate": {
                          "modelEventSource": "valueChanges"
                        }
                      }
                    }
                  }
                ]
              },
              {
                "name": "contributor_supervisor",
                "layout": {
                  "class": "DefaultLayoutComponent",
                  "config": {
                    "label": "@dmpt-people-tab-supervisor",
                    "helpText": "@dmpt-people-tab-supervisor-help"
                  }
                },
                "component": {
                  "class": "GroupComponent",
                  "config": {}
                },
                "model": {
                  "class": "GroupModel",
                  "config": {
                    "defaultValue": ""
                  }
                },
                "unparsable": {
                  "subscribe": {
                    "rdmpGetter": {
                      "onValueUpdate": [
                        {
                          "action": "utilityService.getPropertyFromObject",
                          "field": "contributor_supervisor"
                        }
                      ]
                    }
                  },
                  "publish": {
                    "onValueUpdate": {
                      "modelEventSource": "valueChanges"
                    }
                  }
                }
              },
              {
                "name": "dataowner_name",
                "component": {
                  "class": "HiddenValueComponent",
                  "config": {}
                },
                "unparsable": {
                  "subscribe": {
                    "contributor_ci": {
                      "onValueUpdate": [
                        {
                          "action": "utilityService.concatenate",
                          "fields": [
                            "text_full_name"
                          ],
                          "delim": ""
                        }
                      ]
                    },
                    "rdmpGetter": {
                      "onValueUpdate": [
                        {
                          "action": "utilityService.getPropertyFromObject",
                          "field": "dataowner_name"
                        }
                      ]
                    }
                  }
                }
              },
              {
                "name": "dataowner_email",
                "component": {
                  "class": "HiddenValueComponent",
                  "config": {}
                },
                "unparsable": {
                  "subscribe": {
                    "contributor_ci": {
                      "onValueUpdate": [
                        {
                          "action": "utilityService.concatenate",
                          "fields": [
                            "email"
                          ],
                          "delim": ""
                        }
                      ]
                    },
                    "rdmpGetter": {
                      "onValueUpdate": [
                        {
                          "action": "utilityService.getPropertyFromObject",
                          "field": "dataowner_email"
                        }
                      ]
                    }
                  }
                }
              }
            ]
          },
          {
            "id": "relationships",
            "buttonLabel": "@dataRecord-relationships-tab",
            "componentDefinitions": [
              {
                "name": "",
                "component": {
                  "class": "TextBlockComponent",
                  "config": {
                    "type": "h3"
                  }
                },
                "model": {
                  "class": "TextBlockModel",
                  "config": {
                    "defaultValue": "@dataRecord-relationships-heading"
                  }
                }
              },
              {
                "class": "Unparsable Component: SelectionField"
              },
              {
                "class": "Unparsable Component: SelectionField"
              },
              {
                "name": "disposalDate",
                "layout": {
                  "class": "DefaultLayoutComponent",
                  "config": {
                    "label": "@dataRecord-disposalDate",
                    "helpText": "@dataRecord-disposalDate-help"
                  }
                },
                "component": {
                  "class": "DateTimeComponent",
                  "config": {}
                },
                "unparsable": {
                  "publish": {
                    "onValueUpdate": {
                      "modelEventSource": "valueChanges"
                    }
                  }
                }
              },
              {
                "component": {
                  "class": "RepeatableComponent",
                  "config": {}
                },
                "model": {
                  "class": "RepeatableComponentModel",
                  "config": {
                    "defaultValue": ""
                  }
                },
                "componentDefinitions": [
                  {
                    "component": {
                      "class": "GroupComponent",
                      "config": {
                        "cssClasses": "form-inline"
                      }
                    },
                    "componentDefinitions": [
                      {
                        "class": "Unparsable Component: LinkValueComponent"
                      },
                      {
                        "name": "related_url",
                        "layout": {
                          "class": "DefaultLayoutComponent",
                          "config": {
                            "label": "@dmpt-related-publication-url",
                            "helpText": ""
                          }
                        },
                        "component": {
                          "class": "TextComponent",
                          "config": {
                            "type": "text",
                            "cssClasses": "width-80 form-control"
                          }
                        },
                        "model": {
                          "class": "TextModel",
                          "config": {
                            "defaultValue": ""
                          }
                        }
                      },
                      {
                        "name": "related_title",
                        "layout": {
                          "class": "DefaultLayoutComponent",
                          "config": {
                            "label": "@dmpt-related-publication-title",
                            "helpText": ""
                          }
                        },
                        "component": {
                          "class": "TextComponent",
                          "config": {
                            "type": "text",
                            "cssClasses": "width-80 form-control"
                          }
                        },
                        "model": {
                          "class": "TextModel",
                          "config": {
                            "defaultValue": ""
                          }
                        }
                      },
                      {
                        "name": "related_notes",
                        "layout": {
                          "class": "DefaultLayoutComponent",
                          "config": {
                            "label": "@dmpt-related-publication-notes",
                            "helpText": ""
                          }
                        },
                        "component": {
                          "class": "TextAreaComponent",
                          "config": {
                            "type": "text",
                            "cssClasses": "width-80 form-control"
                          }
                        },
                        "model": {
                          "class": "TextAreaModel",
                          "config": {
                            "defaultValue": ""
                          }
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            "id": "data",
            "buttonLabel": "@dataRecord-data-tab",
            "componentDefinitions": [
              {
                "name": "",
                "component": {
                  "class": "TextBlockComponent",
                  "config": {
                    "type": "h3"
                  }
                },
                "model": {
                  "class": "TextBlockModel",
                  "config": {
                    "defaultValue": "@dataRecord-data-heading"
                  }
                }
              },
              {
                "class": "Unparsable Component: DataLocation"
              },
              {
                "name": "software_equipment",
                "layout": {
                  "class": "DefaultLayoutComponent",
                  "config": {
                    "label": "@dataRecord-data-software",
                    "helpText": ""
                  }
                },
                "component": {
                  "class": "TextAreaComponent",
                  "config": {
                    "type": "text"
                  }
                },
                "model": {
                  "class": "TextAreaModel",
                  "config": {
                    "defaultValue": ""
                  }
                }
              }
            ]
          },
          {
            "id": "permissions",
            "buttonLabel": "@record-permissions-tab",
            "componentDefinitions": [
              {
                "name": "",
                "component": {
                  "class": "TextBlockComponent",
                  "config": {
                    "type": "h3"
                  }
                },
                "model": {
                  "class": "TextBlockModel",
                  "config": {
                    "defaultValue": "@record-permissions-tab-heading"
                  }
                }
              },
              {
                "class": "Unparsable Component: RecordPermissionsField"
              }
            ]
          }
        ]
      }
    }
  }]
};
module.exports = formConfig;
    