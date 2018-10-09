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
              "metadata.dataowner_email"
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
              "metadata.dataowner_email"
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
          updateField: "contributor_ci",
          updateAlso: ['dataOwner']
        },
        dataManager: {
          label: "@dmpt-people-tab-data-manager", // The label to show in the radio button options
          updateField: 'contributor_data_manager'
        },
        dataOwner: {
          label: "@dmpt-people-tab-data-owner", // The label to show in the radio button options
          fieldNames: {
            email: "dataowner_email", // The email address field in the form, used for matching as well
            text_full_name: "dataowner_name" // The name field in the form
          }
        }
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
          updateField: "contributor_ci",
          updateAlso: ['dataOwner']
        },
        dataManager: {
          label: "@dmpt-people-tab-data-manager", // The label to show in the radio button options
          updateField: 'contributor_data_manager'
        },
        dataOwner: {
          label: "@dmpt-people-tab-data-owner", // The label to show in the radio button options
          fieldNames: {
            email: "dataowner_email", // The email address field in the form, used for matching as well
            text_full_name: "dataowner_name" // The name field in the form
          }
        }
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
              "metadata.dataowner_email"
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
              "metadata.dataowner_email"
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
      onCreate: {
        pre: [
          //Transition workflow from queued to reviewing. TODO: Condition needs to be changed to check when staging location set
          {
            function: 'sails.services.triggerservice.transitionWorkflow',
            options: {
              "triggerCondition": "<%= _.isEqual(workflow.stage, 'queued') && _.isEqual(metadata.embargoByDate, '')  %>",
              "targetWorkflowStageName": "reviewing",
              "targetWorkflowStageLabel": "Reviewing",
              "targetForm": "dataPublication-1.0-reviewing"
            }
          },
          {
            function: 'sails.services.triggerservice.transitionWorkflow',
            options: {
              "triggerCondition": "<%= _.isEqual(workflow.stage, 'queued') && _.isEqual(metadata.embargoByDate, true) %>",
              "targetWorkflowStageName": "embargoed",
              "targetWorkflowStageLabel": "Embargoed",
              "targetForm": "dataPublication-1.0-embargoed"
            }
          },
          // Set the notification state for draft publications
          {
            function: 'sails.services.recordsservice.updateNotificationLog',
            options: {
              name: "Set Notification to Draft",
              // when notification is undefined, start with 'draft', so skipping stages will still work (as with the shipped behavior above)
              triggerCondition: "<%= typeof record.notification == 'undefined'%>",
              flagName: 'notification.state', // the record's path to the notification flag
              flagVal: 'draft', // hard coded value
              saveRecord: false // when true, do metadata update -> false, since this is on a pre-save hook, gets saved anyway
            }
          }
        ],
        post: [
          // `Email "data publication is staged" notification to FNCI, DM, Supervisor with link to landing page on Staging`
          {
            function: 'sails.services.emailservice.sendRecordNotification',
            options: {
              triggerCondition: "<%= record.notification != null && record.notification.state == 'draft' && record.workflow.stage == 'reviewing' %>",
              to: "<%= record.metadata.contributor_ci.email %>,<%= record.metadata.contributor_data_manager.email %>,<%= record.metadata.contributor_supervisor.email %>",
              subject: "A publication has been staged for publishing.",
              template: "publicationStaged",
              onNotifySuccess: [
                // `Email "data publication is ready for review" notification to Librarian data-librarian@uts.edu.au with a link to the data publication record`
                {
                  function: 'sails.services.emailservice.sendRecordNotification',
                  options: {
                    forceRun: true,
                    to: "librarian@redboxresearchdata.com.au",
                    subject: "Data publication ready for review",
                    template: "publicationReview"
                  }
                },
                {
                  function: 'sails.services.recordsservice.updateNotificationLog',
                  options: {
                    name: "Set Notification to Emailed-Reviewing",
                    forceRun: true,
                    flagName: 'notification.state',
                    flagVal: 'emailed-reviewing',
                    logName: 'notification.log.reviewing', // record's path to the log
                    saveRecord: true // when true, do a metadata update
                  }
                }
              ]
            }
          },
          // Triggers "Published" Email Notification to FNCI, DM, Collaborators, CC: librarian with RDA link
          {
            function: 'sails.services.emailservice.sendRecordNotification',
            options: {
              triggerCondition: "<%= record.notification != null && record.notification.state == 'emailed-reviewing' && record.workflow.stage == 'published' %>",
              to: "<%= record.metadata.contributor_ci.email %>,<%= record.metadata.contributor_data_manager.email %>,<%= record.metadata.contributor_supervisor.email %>,librarian@redboxresearchdata.com.au,<%= _.isEmpty(record.metadata.creators) ? '' : _.join(_.map(record.metadata.creators, (creator)=>{ return creator.email; }), ',') %>",
              subject: "A publication has been successfully published",
              template: "publicationPublished",
              onNotifySuccess: [
                {
                  function: 'sails.services.recordsservice.updateNotificationLog',
                  options: {
                    name: "Set Notification to Emailed-Published",
                    forceRun: true,
                    flagName: 'notification.state',
                    flagVal: 'emailed-published',
                    logName: 'notification.log.published', // record's path to the log
                    saveRecord: true // when true, do a metadata update
                  }
                }
              ]
            }
          }
        ]
      },
      // Update configuration
      onUpdate: {
        pre: [
          //Transition workflow from queued to reviewing. TODO: Condition needs to be changed to check when staging location set
          {
            function: 'sails.services.triggerservice.transitionWorkflow',
            options: {
              "triggerCondition": "<%= _.isEqual(workflow.stage, 'queued') && _.isEqual(metadata.embargoByDate, '') %>",
              "targetWorkflowStageName": "reviewing",
              "targetWorkflowStageLabel": "Reviewing",
              "targetForm": "dataPublication-1.0-reviewing"
            }
          },
          {
            function: 'sails.services.triggerservice.transitionWorkflow',
            options: {
              "triggerCondition": "<%= _.isEqual(workflow.stage, 'queued') && _.isEqual(metadata.embargoByDate, true) %>",
              "targetWorkflowStageName": "embargoed",
              "targetWorkflowStageLabel": "Embargoed",
              "targetForm": "dataPublication-1.0-embargoed"
            }
          },
          //Transition workflow from publishing to published. TODO: Condition needs to be changed to check when published location set
          {
            function: 'sails.services.triggerservice.transitionWorkflow',
            options: {
              "triggerCondition": "<%= workflow.stage == 'publishing'%>",
              "targetWorkflowStageName": "published",
              "targetWorkflowStageLabel": "Published",
              "targetForm": "dataPublication-1.0-published"
            }
          },
          // Set the notification state for draft publications
          {
            function: 'sails.services.recordsservice.updateNotificationLog',
            options: {
              name: "Set Notification to Draft",
              // when notification is undefined, start with 'draft', so skipping stages will still work (as with the shipped behavior above)
              triggerCondition: "<%= typeof record.notification == 'undefined'%>",
              flagName: 'notification.state', // the record's path to the notification flag
              flagVal: 'draft', // hard coded value
              saveRecord: false // when true, do metadata update -> false, since this is on a pre-save hook, gets saved anyway
            }
          }
        ],
        post: [
          {
            function: 'sails.services.publicationservice.exportDataset',
            options: {
              triggerCondition: "<%= record.workflow.stage=='reviewing' %>",
              site: 'staging'
            }
          },
          { 
            function: 'sails.services.emailservice.sendRecordNotification',
            options: {
              triggerCondition: "<%= record.notification != null && record.notification.state == 'draft' && record.workflow.stage == 'reviewing' %>",
              to: "<%= record.metadata.contributor_ci.email %>,<%= record.metadata.contributor_data_manager.email %>,<%= record.metadata.contributor_supervisor.email %>",
              subject: "A publication has been staged for review.",
              template: "publicationStaged",
              onNotifySuccess: [
          // `Email "data publication is ready for review" notification to Librarian data-librarian@uts.edu.au with a link to the data publication record`
                {
                  function: 'sails.services.emailservice.sendRecordNotification',
                    options: {
                      forceRun: true,
                      to: "librarian@redboxresearchdata.com.au",
                      subject: "Data publication ready for review",
                      template: "publicationReview"
                    }
                },
                {
                  function: 'sails.services.recordsservice.updateNotificationLog',
                  options: {
                    name: "Set Notification to Emailed-Reviewing",
                    forceRun: true,
                    flagName: 'notification.state',
                    flagVal: 'emailed-reviewing',
                    logName: 'notification.log.reviewing', // record's path to the log
                    saveRecord: true // when true, do a metadata update
                  }
                }
              ]
            }
          },

          {
            function: 'sails.services.publicationservice.exportDataset',
            options: {
              triggerCondition: "<%= record.workflow.stage=='published' %>",
              site: 'public'
            }
          },


          // Triggers "Published" Email Notification to FNCI, DM, Collaborators, CC: librarian with RDA link
          {
            function: 'sails.services.emailservice.sendRecordNotification',
            options: {
              triggerCondition: "<%= record.notification != null && record.notification.state == 'emailed-reviewing' && record.workflow.stage == 'published' %>",
              to: "<%= record.metadata.contributor_ci.email %>,<%= record.metadata.contributor_data_manager.email %>,<%= record.metadata.contributor_supervisor.email %>,librarian@redboxresearchdata.com.au,<%= _.isEmpty(record.metadata.creators) ? '' : _.join(_.map(record.metadata.creators, (creator)=>{ return creator.email; }), ',') %>",
              subject: "A publication has been successfully published",
              template: "publicationPublished",
              onNotifySuccess: [
                {
                  function: 'sails.services.recordsservice.updateNotificationLog',
                  options: {
                    name: "Set Notification to Emailed-Published",
                    forceRun: true,
                    flagName: 'notification.state',
                    flagVal: 'emailed-published',
                    logName: 'notification.log.published', // record's path to the log
                    saveRecord: true // when true, do a metadata update
                  }
                }
              ]
            }
          }
        ]
      }
    }
  }
};
