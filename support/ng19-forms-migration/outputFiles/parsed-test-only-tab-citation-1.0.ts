import { FormConfig } from "@researchdatabox/sails-ng-common";
    import { formValidatorsSharedDefinitions } from "../config/validators";

    const formConfig: FormConfig = {
        name: "modularFormConfigFile",
        componentDefinitions: [
  {
    "name": "",
    "component": {
      "class": "ContentComponent",
      "config": {
        "contentType": "h3",
        "content": "@dataPublication-citation-tab-heading"
      }
    }
  },
  {
    "name": "citation_doi",
    "layout": {
      "class": "DefaultLayoutComponent",
      "config": {
        "label": "@dataPublication-citation-identifier",
        "helpText": ""
      }
    },
    "component": {
      "class": "SimpleInputComponent",
      "config": {
        "type": "text"
      }
    },
    "model": {
      "class": "SimpleInputModel",
      "config": {
        "defaultValue": ""
      }
    }
  },
  {
    "name": "citation_doi",
    "layout": {
      "class": "DefaultLayoutComponent",
      "config": {
        "label": "@dataPublication-citation-identifier",
        "helpText": ""
      }
    },
    "component": {
      "class": "SimpleInputComponent",
      "config": {
        "type": "text"
      }
    },
    "model": {
      "class": "SimpleInputModel",
      "config": {
        "defaultValue": ""
      }
    }
  },
  {
    "class": "Unparsable Component: SelectionField"
  },
  {
    "name": "finalIdentifiers",
    "layout": {
      "class": "DefaultLayoutComponent",
      "config": {
        "label": "@dataPublication-identifiers",
        "helpText": "@dataPublication-identifiers-help"
      }
    },
    "component": {
      "class": "SimpleInputComponent",
      "config": {}
    },
    "model": {
      "class": "SimpleInputModel",
      "config": {
        "defaultValue": ""
      }
    },
    "unparsable": {
      "subscribe": {
        "dataRecordGetter": {
          "onValueUpdate": [
            {
              "action": "utilityService.getPropertyFromObject",
              "field": "finalidentifiers"
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
          "class": "SimpleInputComponent",
          "config": {
            "type": "text"
          }
        },
        "model": {
          "class": "SimpleInputModel",
          "config": {
            "defaultValue": ""
          }
        }
      }
    ]
  },
  {
    "name": "citation_title",
    "layout": {
      "class": "DefaultLayoutComponent",
      "config": {
        "label": "@dataPublication-citation-title",
        "helpText": "@dataPublication-citation-title-help"
      }
    },
    "component": {
      "class": "SimpleInputComponent",
      "config": {
        "type": "text"
      }
    },
    "model": {
      "class": "SimpleInputModel",
      "config": {
        "defaultValue": ""
      }
    },
    "unparsable": {
      "disabledExpression": "<%= _.isEmpty(relatedRecordId) %>"
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
        "dataRecordGetter": {
          "onValueUpdate": [
            {
              "action": "utilityService.getPropertyFromObjectConcat",
              "field": [
                "contributor_ci",
                "contributor_data_manager",
                "contributors",
                "contributor_supervisor"
              ]
            }
          ]
        }
      },
      "disabledExpression": "<%= _.isEmpty(relatedRecordId) %>"
    },
    "componentDefinitions": [
      {
        "name": "",
        "layout": {
          "class": "DefaultLayoutComponent",
          "config": {
            "label": "@dataPublication-creators",
            "helpText": "@dataPublication-creators-help"
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
    "name": "citation_publisher",
    "layout": {
      "class": "DefaultLayoutComponent",
      "config": {
        "label": "@dataPublication-citation-publisher",
        "helpText": "@dataPublication-citation-publisher-help"
      }
    },
    "component": {
      "class": "SimpleInputComponent",
      "config": {
        "type": "text"
      }
    },
    "model": {
      "class": "SimpleInputModel",
      "config": {
        "defaultValue": "@dataPublication-citation-publisher-default"
      }
    },
    "unparsable": {
      "disabledExpression": "<%= _.isEmpty(relatedRecordId) %>"
    }
  },
  {
    "class": "Unparsable Component: LinkValueComponent"
  },
  {
    "name": "citation_publication_date",
    "layout": {
      "class": "DefaultLayoutComponent",
      "config": {
        "label": "@dataPublication-citation-publication-date",
        "helpText": "@dataPublication-citation-publication-datel-help"
      }
    },
    "component": {
      "class": "DateTimeComponent",
      "config": {}
    },
    "unparsable": {
      "disabledExpression": "<%= _.isEmpty(relatedRecordId) %>"
    }
  },
  {
    "name": "citation_generated",
    "layout": {
      "class": "DefaultLayoutComponent",
      "config": {
        "label": "@dataPublication-citation-generated-label",
        "helpText": ""
      }
    },
    "component": {
      "class": "SimpleInputComponent",
      "config": {
        "type": "text"
      }
    },
    "model": {
      "class": "SimpleInputModel",
      "config": {
        "defaultValue": ""
      }
    },
    "unparsable": {
      "subscribe": {
        "form": {
          "onValueChange": [
            {
              "action": "utilityService.runTemplate",
              "template": "<%= _.join(_.map(_.filter(_.get(data, \"creators\"), (c) => {return !_.isEmpty(c.family_name) || !_.isEmpty(c.given_name)}), (c)=> {return !_.isEmpty(c.family_name) || !_.isEmpty(c.given_name) ? ((c.family_name ? c.family_name : \"\") + \", \" + (c.given_name ? c.given_name : \"\")) : \"\" }), \"; \") + (_.get(data, \"citation_publication_date\",\"\") == \"\"  ? \" : \" : \" (\"+ moment(_.get(data, \"citation_publication_date\")).format(\"YYYY\") + \"): \") + _.get(data, \"citation_title\") + \". \" + (_.get(data, \"citation_publisher\",\"\") == \"\"? \"\":  _.get(data, \"citation_publisher\",\"\") + \". \") + (_.get(data, \"citation_doi\", \"\") == \"\" ? (_.get(data, \"requestIdentifier\", []).length > 0? \"{ID_WILL_BE_HERE}\" : \"\") : \"https://doi.org/\" + _.get(data, \"citation_doi\")) %>"
            }
          ]
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
        "dataRecordGetter": {
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
        "dataRecordGetter": {
          "onValueUpdate": [
            {
              "action": "utilityService.getPropertyFromObject",
              "field": "dataowner_email"
            }
          ]
        }
      }
    }
  },
  {
    "name": "contributor_ci",
    "component": {
      "class": "HiddenValueComponent",
      "config": {}
    },
    "unparsable": {
      "subscribe": {
        "dataRecordGetter": {
          "onValueUpdate": [
            {
              "action": "utilityService.getPropertyFromObject",
              "field": "contributor_ci"
            }
          ]
        }
      }
    }
  },
  {
    "name": "contributor_data_manager",
    "component": {
      "class": "HiddenValueComponent",
      "config": {}
    },
    "unparsable": {
      "subscribe": {
        "dataRecordGetter": {
          "onValueUpdate": [
            {
              "action": "utilityService.getPropertyFromObject",
              "field": "contributor_data_manager"
            }
          ]
        }
      }
    }
  },
  {
    "name": "contributor_supervisor",
    "component": {
      "class": "HiddenValueComponent",
      "config": {}
    },
    "unparsable": {
      "subscribe": {
        "dataRecordGetter": {
          "onValueUpdate": [
            {
              "action": "utilityService.getPropertyFromObject",
              "field": "contributor_supervisor"
            }
          ]
        }
      }
    }
  }
]
    };

    module.exports = formConfig;
    