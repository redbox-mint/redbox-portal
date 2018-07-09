module.exports.recordtype = {
  "rdmp": {
    "packageType": "rdmp",
    hooks: {
      onCreate: {
        pre: [{
          function: 'sails.services.rdmpservice.assignPermissions',
          options: {
            "emailProperty": "email",
            "editContributorProperties": [
              "metadata.contributor_ci",
              "metadata.contributor_data_manager",
              "dataowner_email"
            ],
            "viewContributorProperties": [
              "metadata.contributor_ci",
              "metadata.contributor_data_manager",
              "metadata.contributor_supervisor",
              "metadata.contributors"
            ]
          }
        }],
        post: [{
          function: 'sails.services.pdfservice.createPDF',
          options: {
            waitForSelector: 'div#loading.hidden',
            pdfPrefix: 'rdmp-pdf'
          }
        }]
      },
      onUpdate: {
        pre: [{
          function: 'sails.services.rdmpservice.assignPermissions',
          options: {
            "emailProperty": "email",
            "editContributorProperties": [
              "metadata.contributor_ci",
              "metadata.contributor_data_manager",
              "dataowner_email"
            ],
            "viewContributorProperties": [
              "metadata.contributor_ci",
              "metadata.contributor_data_manager",
              "metadata.contributor_supervisor",
              "metadata.contributors"
            ]
          }
        }],
        post: [{
          function: 'sails.services.pdfservice.createPDF',
          options: {
            waitForSelector: 'div#loading.hidden',
            pdfPrefix: 'rdmp-pdf'
          }
        }]
      }
    },
    relatedTo: [{
      "recordType": "dataRecord",
      "foreignField": "metadata.rdmp.oid"
    }],
    transferResponsibility: {
      /*
        Defines the fields that map to roles in the record
      */
      fields: {
        chiefInvestigator: {
          label: "@dmpt-people-tab-ci", // The label to show in the radio button options
          fieldNames: {
            email: "contributor_ci.email", // The email address field in the form, used for matching as well
            name: "contributor_ci.text_full_name" // The name field in the form
          }
        },
        dataManager: {
          label: "@dmpt-people-tab-data-manager", // The label to show in the radio button options
          fieldNames: {
            email: "contributor_data_manager.email", // The email address field in the form, used for matching as well
            name: "contributor_data_manager.text_full_name" // The name field in the form
          }
        },
        dataOwner: {
          label: "@dmpt-people-tab-data-owner", // The label to show in the radio button options
          fieldNames: {
            email: "dataowner_email", // The email address field in the form, used for matching as well
            name: "dataowner_name" // The name field in the form
          }
        },

      },
      /*
        canEdit block defines which fields the user may edit if
        they have been set as that role in the record
      */
      canEdit: {
        dataManager: ["dataManager", "chiefInvestigator", "dataOwner"],
        dataOwner: ["chiefInvestigator", "dataOwner"],
        chiefInvestigator: ["chiefInvestigator"]
      }
    },
    searchFilters: [{
        name: "text_title",
        title: "search-refine-title",
        type: "exact",
        typeLabel: "search-refine-contains"
      },
      {
        name: "text_description",
        title: "search-refine-description",
        type: "exact",
        typeLabel: "search-refine-contains"
      },
      {
        name: "grant_number_name",
        title: "search-refine-grant_number_name",
        type: "facet",
        typeLabel: null,
        alwaysActive: true
      },
      {
        name: "finalKeywords",
        title: "search-refine-keywords",
        type: "facet",
        typeLabel: null,
        alwaysActive: true
      },
      {
        name: "workflow_stageLabel",
        title: "search-refine-workflow_stageLabel",
        type: "facet",
        typeLabel: null,
        alwaysActive: true
      }
    ]
  },
  "dataRecord": {
    "packageType": "dataRecord",
    labels: {
      name: "Record",
      namePlural: "Records"
    },
    searchFilters: [{
        name: "text_title",
        title: "search-refine-title",
        type: "exact",
        typeLabel: "search-refine-contains"
      },
      {
        name: "text_description",
        title: "search-refine-description",
        type: "exact",
        typeLabel: "search-refine-contains"
      },
      {
        name: "grant_number_name",
        title: "search-refine-grant_number_name",
        type: "facet",
        typeLabel: null,
        alwaysActive: true
      },
      {
        name: "finalKeywords",
        title: "search-refine-keywords",
        type: "facet",
        typeLabel: null,
        alwaysActive: true
      },
      {
        name: "workflow_stageLabel",
        title: "search-refine-workflow_stageLabel",
        type: "facet",
        typeLabel: null,
        alwaysActive: true
      }
    ],
    relatedTo: [{
      "recordType": "rdmp",
      "localField": "metadata.rdmp.oid",
      "foreignField": "redboxOid"
    },
    {
      "recordType": "dataPublication",
      "foreignField": "metadata.dataRecord.oid"
    }],
    transferResponsibility: {
      /*
        Defines the fields that map to roles in the record
      */
      fields: {
        chiefInvestigator: {
          label: "@dmpt-people-tab-ci", // The label to show in the radio button options
          fieldNames: {
            email: "contributor_ci.email", // The email address field in the form, used for matching as well
            name: "contributor_ci.text_full_name" // The name field in the form
          }
        },
        dataManager: {
          label: "@dmpt-people-tab-data-manager", // The label to show in the radio button options
          fieldNames: {
            email: "contributor_data_manager.email", // The email address field in the form, used for matching as well
            name: "contributor_data_manager.text_full_name" // The name field in the form
          }
        },
        dataOwner: {
          label: "@dmpt-people-tab-data-owner", // The label to show in the radio button options
          fieldNames: {
            email: "dataowner_email", // The email address field in the form, used for matching as well
            name: "dataowner_name" // The name field in the form
          }
        },

      },
      /*
        canEdit block defines which fields the user may edit if
        they have been set as that role in the record
      */
      canEdit: {
        dataManager: ["dataManager", "chiefInvestigator", "dataOwner"],
        dataOwner: ["chiefInvestigator", "dataOwner"],
        chiefInvestigator: ["chiefInvestigator"]
      }
    },
    hooks: {
      onCreate: {
        pre: [{
          function: 'sails.services.rdmpservice.assignPermissions',
          options: {
            "emailProperty": "email",
            "editContributorProperties": [
              "metadata.contributor_ci",
              "metadata.contributor_data_manager",
              "dataowner_email"
            ],
            "viewContributorProperties": [
              "metadata.contributor_ci",
              "metadata.contributor_data_manager",
              "metadata.contributor_supervisor",
              "metadata.contributors"
            ]
          }
        }]
      },
      onUpdate: {
        pre: [{
          function: 'sails.services.rdmpservice.assignPermissions',
          options: {
            "emailProperty": "email",
            "editContributorProperties": [
              "metadata.contributor_ci",
              "metadata.contributor_data_manager",
              "dataowner_email"
            ],
            "viewContributorProperties": [
              "metadata.contributor_ci",
              "metadata.contributor_data_manager",
              "metadata.contributor_supervisor",
              "metadata.contributors"
            ]
          }
        }]
      }
    }
  },
  "dataPublication": {
    "packageType": "dataPublication",
    labels: {
      name: "Data Publication",
      namePlural: "Data Publications"
    },
    searchFilters: [{
        name: "text_title",
        title: "search-refine-title",
        type: "exact",
        typeLabel: "search-refine-contains"
      },
      {
        name: "text_description",
        title: "search-refine-description",
        type: "exact",
        typeLabel: "search-refine-contains"
      },
      {
        name: "grant_number_name",
        title: "search-refine-grant_number_name",
        type: "facet",
        typeLabel: null,
        alwaysActive: true
      },
      {
        name: "finalKeywords",
        title: "search-refine-keywords",
        type: "facet",
        typeLabel: null,
        alwaysActive: true
      },
      {
        name: "workflow_stageLabel",
        title: "search-refine-workflow_stageLabel",
        type: "facet",
        typeLabel: null,
        alwaysActive: true
      }
    ],
    hooks: {
      onUpdate: {
        pre: [
          //Transition workflow from queued to reviewing. TODO: Condition needs to be changed to check when staging location set
          {
          function: 'sails.services.triggerservice.transitionWorkflow',
          options: {
            "triggerCondition": "<%= workflow.stage == 'queued'%>",
            "targetWorkflowStageName": "reviewing",
            "targetWorkflowStageLabel": "Reviewing"
          }
        },
        //Transition workflow from publishing to published. TODO: Condition needs to be changed to check when published location set
        {
          function: 'sails.services.triggerservice.transitionWorkflow',
          options: {
            "triggerCondition": "<%= workflow.stage == 'publishing'%>",
            "targetWorkflowStageName": "published",
            "targetWorkflowStageLabel": "Published"
          }
        }]
      }
    }
  }
};
