{
  "componentDefinitions": [
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
      "componentDefinitions": [
        {},
        {},
        {},
        {}
      ]
    },
    {},
    {
      "componentDefinitions": [
        {},
        {},
        {},
        {},
        {}
      ]
    },
    {
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
    {},
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
                {},
                {},
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
                {},
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
                    "class": "TextFieldComponent",
                    "config": {
                      "type": "text"
                    }
                  },
                  "model": {
                    "class": "TextFieldModel",
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
                  "componentDefinitions": [
                    {}
                  ]
                },
                {},
                {
                  "componentDefinitions": [
                    {}
                  ]
                },
                {},
                {}
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
                    "class": "TextFieldComponent",
                    "config": {
                      "type": "text"
                    }
                  },
                  "model": {
                    "class": "TextFieldModel",
                    "config": {
                      "defaultValue": ""
                    }
                  }
                },
                {},
                {},
                {
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
                        "class": "TextFieldComponent",
                        "config": {
                          "type": "text"
                        }
                      },
                      "model": {
                        "class": "TextFieldModel",
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
                    "class": "TextFieldComponent",
                    "config": {
                      "type": "text"
                    }
                  },
                  "model": {
                    "class": "TextFieldModel",
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
                {},
                {},
                {
                  "componentDefinitions": [
                    {}
                  ]
                },
                {},
                {},
                {}
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
                {},
                {},
                {},
                {
                  "componentDefinitions": [
                    {
                      "componentDefinitions": [
                        {},
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
                            "class": "TextFieldComponent",
                            "config": {
                              "type": "text"
                            }
                          },
                          "model": {
                            "class": "TextFieldModel",
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
                            "class": "TextFieldComponent",
                            "config": {
                              "type": "text"
                            }
                          },
                          "model": {
                            "class": "TextFieldModel",
                            "config": {
                              "defaultValue": ""
                            }
                          }
                        },
                        {}
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
                {},
                {}
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
                {}
              ]
            }
          ]
        }
      }
    }
  ]
}