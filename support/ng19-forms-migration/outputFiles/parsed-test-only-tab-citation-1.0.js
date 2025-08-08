[
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
        "defaultValue": "@dataPublication-citation-tab-heading"
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
    "name": "citation_doi",
    "layout": {
      "class": "DefaultLayoutComponent",
      "config": {
        "label": "@dataPublication-citation-identifier",
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
    "name": "citation_title",
    "layout": {
      "class": "DefaultLayoutComponent",
      "config": {
        "label": "@dataPublication-citation-title",
        "helpText": "@dataPublication-citation-title-help"
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
      "disabledExpression": "<%= _.isEmpty(relatedRecordId) %>"
    }
  },
  {
    "componentDefinitions": [
      {}
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
      "class": "TextFieldComponent",
      "config": {
        "type": "text"
      }
    },
    "model": {
      "class": "TextFieldModel",
      "config": {
        "defaultValue": "@dataPublication-citation-publisher-default"
      }
    },
    "unparsable": {
      "disabledExpression": "<%= _.isEmpty(relatedRecordId) %>"
    }
  },
  {},
  {},
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
  {},
  {},
  {},
  {},
  {}
]