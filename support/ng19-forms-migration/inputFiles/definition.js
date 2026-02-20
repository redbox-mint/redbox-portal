const _ = require("lodash");

const outcomePublic = "Public";
const outcomeNoClassification = "No classification required";

const metaTagNoneNoClassification = "NONE-NO-CLASSIFICATION";

// In order from least to most sensitive
const orderedOutcomes = [outcomeNoClassification, outcomePublic];

// An example of the data classification definition used in form config v4.

//All text is shown from the language file just leaving the labels here for reference
const dataClassificationStructure = {
  // Round 1
  "is-data-sensitive": {
    conditions: {},
    answers: [
      {value: "yes", label: "Yes"},
      {
        value: "no",
        label: "No",
        outcome: {classification: outcomeNoClassification, metadataTag: metaTagNoneNoClassification}
      }
    ],
    label: `Is any of your research data sensitive?`,
    help: `Help`,
    minAnswers: 1,
    maxAnswers: 1,
  },
  // Round 2
  "published-or-public-data": {
    conditions: {
      "is-data-sensitive": ["yes"]
    },
    answers: [
      {value: "yes", label: "Yes"},
      {value: "no", label: "No"}
    ],
    label: `Are you using published or publicly available data?`,
    help: ``,
    minAnswers: 1,
    maxAnswers: 2,
  },
  // round 3
  "data-from-or-about-individuals": {
    conditions: {
      "published-or-public-data": ["yes"]
    },
    answers: [
      {value: "yes", label: "Yes"},
      {value: "no", label: "No"}
    ],
    label: `Does this data contain information from or about individuals?`,
    help: ``,
    minAnswers: 1,
    maxAnswers: 1,
  },
};

module.exports = {
  outcomePublic: outcomePublic,
  outcomeNoClassification: outcomeNoClassification,
  orderedOutcomes: orderedOutcomes,
  createDataClassificationStructure: function createDataClassificationStructure() {
    return _.cloneDeep(dataClassificationStructure);
  },
};
