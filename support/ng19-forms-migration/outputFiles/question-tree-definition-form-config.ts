import {QuestionTreeFieldComponentConfigFrame} from "@researchdatabox/sails-ng-common";
const questionTreeConfig: QuestionTreeFieldComponentConfigFrame = {
  "availableOutcomes": [
    {
      "value": "No classification required",
      "label": "No classification required"
    },
    {
      "value": "Public",
      "label": "Public"
    }
  ],
  "availableMeta": {
    "metadataTag": {
      "NONE-NO-CLASSIFICATION": "NONE-NO-CLASSIFICATION"
    }
  },
  "questions": [
    {
      "id": "is-data-sensitive",
      "answersMin": 1,
      "answersMax": 1,
      "answers": [
        {
          "value": "yes",
          "label": "Yes"
        },
        {
          "value": "no",
          "label": "No",
          "outcome": "No classification required",
          "meta": {
            "metadataTag": "NONE-NO-CLASSIFICATION"
          }
        }
      ],
      "rules": {
        "op": "or",
        "args": []
      }
    },
    {
      "id": "published-or-public-data",
      "answersMin": 1,
      "answersMax": 2,
      "answers": [
        {
          "value": "yes",
          "label": "Yes"
        },
        {
          "value": "no",
          "label": "No"
        }
      ],
      "rules": {
        "op": "or",
        "args": [
          {
            "op": "in",
            "q": "is-data-sensitive",
            "a": [
              "yes"
            ]
          }
        ]
      }
    },
    {
      "id": "data-from-or-about-individuals",
      "answersMin": 1,
      "answersMax": 1,
      "answers": [
        {
          "value": "yes",
          "label": "Yes"
        },
        {
          "value": "no",
          "label": "No"
        }
      ],
      "rules": {
        "op": "or",
        "args": [
          {
            "op": "in",
            "q": "published-or-public-data",
            "a": [
              "yes"
            ]
          }
        ]
      }
    }
  ],
  "componentDefinitions": []
};
module.exports = questionTreeConfig;
