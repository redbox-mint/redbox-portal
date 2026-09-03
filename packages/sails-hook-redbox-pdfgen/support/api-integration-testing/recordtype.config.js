"use strict";
/**
 * Record Type Config Interface
 * (sails.config.recordtype)
 *
 * Record type definitions with hooks and permissions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordtype = void 0;
// Note: Default configuration ported from config/recordtype.js
exports.recordtype = {
    "rdmp": {
        "packageType": "rdmp",
        hooks: {
            onCreate: {
                pre: [
                    {
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
                            ],
                            "recordCreatorPermissions": "view&edit"
                        }
                    },
                    // {
                    //   function: 'sails.services.raidservice.mintTrigger',
                    //   options: {
                    //     triggerCondition: '<%= _.isEmpty(record.metadata.raidUrl) %>',
                    //     request: {
                    //       mint: {
                    //         // to DRY, `fields` can either be the actual mapping or a string path of `sails.config` object where the field mapping config resides
                    //         fields: 'raid.mapping.dmp'
                    //       }
                    //     }
                    //   }
                    // }
                ],
                // Requires the PDF Gen hook to be installed https://www.npmjs.com/package/@researchdatabox/sails-hook-redbox-pdfgen
                                post: [{
                                        function: 'sails.services.pdfservice.createPDF',
                                        options: {
                                                waitForSelector: 'div#loading.hidden',
                                                pdfPrefix: 'rdmp-pdf',
                                        }
                                }
                // {
                //   function: 'sails.services.raidservice.mintPostCreateRetryHandler',
                //   options: {
                //     // nothing here as the record-specific options are in the metaMetadata
                //   }
                // }
                ]
            },
            onUpdate: {
                pre: [
                    {
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
                            ],
                            "recordCreatorPermissions": "view&edit"
                        }
                    },
                    {
                        function: 'sails.services.rdmpservice.checkTotalSizeOfFilesInRecord',
                        options: {
                            triggerCondition: '<%= _.isEqual(record.workflow.stage, "draft") || _.isEqual(record.workflow.stage, "queued") || _.isEqual(record.workflow.stage, "published") %>',
                            maxUploadSizeMessageCode: 'max-total-files-upload-size-alternative-validation-error',
                            replaceOrAppend: 'append'
                        }
                    },
                    // {
                    //   function: 'sails.services.raidservice.mintTrigger',
                    //   options: {
                    //     triggerCondition: '<%= _.isEmpty(record.metadata.raidUrl) %>',
                    //     request: {
                    //       mint: {
                    //         // to DRY, `fields` can either be the actual mapping or a string path of `sails.config` object where the field mapping config resides
                    //         fields: 'raid.mapping.dmp'
                    //       }
                    //     }
                    //   }
                    // }
                ],
                // Requires the PDF Gen hook to be installed https://www.npmjs.com/package/@researchdatabox/sails-hook-redbox-pdfgen
                 post: [{
                   function: 'sails.services.pdfservice.createPDF',
                   options: {
                     waitForSelector: 'div#loading.hidden',
                     pdfPrefix: 'rdmp-pdf',
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
                            ],
                            "recordCreatorPermissions": "view&edit"
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
                            ],
                            "recordCreatorPermissions": "view&edit"
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
                    {
                        function: 'sails.services.triggerservice.transitionWorkflow',
                        options: {
                            "triggerCondition": "<%= _.isEqual(workflow.stage, 'queued') && metadata.embargoByDate?.toString() === 'true' %>",
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
                    },
                    {
                        function: 'sails.services.rdmpservice.assignPermissions',
                        options: {
                            "emailProperty": "email",
                            "editContributorProperties": [
                                "metadata.creators"
                            ],
                            "viewContributorProperties": [
                                "metadata.creators"
                            ],
                            "recordCreatorPermissions": "view&edit"
                        }
                    },
                    {
                        function: 'sails.services.rdmpservice.stripUserBasedPermissions',
                        options: {
                            triggerCondition: "<%= record.workflow.stage=='published' ||  record.workflow.stage=='queued' || record.workflow.stage=='embargoed' %>"
                        }
                    },
                    {
                        function: 'sails.services.rdmpservice.restoreUserBasedPermissions',
                        options: {
                            triggerCondition: "<%= record.workflow.stage=='draft' %>"
                        }
                    }
                ],
                post: [
                    // `Email "data publication is staged" notification to FNCI, DM, Supervisor with link to landing page on Staging`
                    {
                        function: 'sails.services.emailservice.sendRecordNotification',
                        options: {
                            triggerCondition: "<%= record.notification != null && record.notification.state == 'draft' && record.workflow.stage == 'queued' %>",
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
                    },
                    {
                        function: 'sails.services.doiservice.publishDoiTriggerSync',
                        options: {
                            forceRun: true,
                            triggerCondition: "<%= record.workflow.stage=='draft' %>",
                            event: 'draft'
                        }
                    }
                ]
            },
            // Update configuration
            onUpdate: {
                pre: [
                    {
                        function: 'sails.services.triggerservice.transitionWorkflow',
                        options: {
                            "triggerCondition": "<%= _.isEqual(workflow.stage, 'published') && metadata.embargoByDate?.toString() === 'true' %>",
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
                    },
                    {
                        function: 'sails.services.rdmpservice.assignPermissions',
                        options: {
                            "emailProperty": "email",
                            "editContributorProperties": [
                                "metadata.creators"
                            ],
                            "viewContributorProperties": [
                                "metadata.creators"
                            ],
                            "recordCreatorPermissions": "view&edit"
                        }
                    },
                    {
                        function: 'sails.services.rdmpservice.stripUserBasedPermissions',
                        options: {
                            triggerCondition: "<%= record.workflow.stage=='published' ||  record.workflow.stage=='queued' || record.workflow.stage=='embargoed' %>"
                        }
                    },
                    {
                        function: 'sails.services.rdmpservice.restoreUserBasedPermissions',
                        options: {
                            triggerCondition: "<%= record.workflow.stage=='draft' %>"
                        }
                    }
                ],
                post: [
                    {
                        function: 'sails.services.emailservice.sendRecordNotification',
                        options: {
                            triggerCondition: "<%= record.notification != null && record.notification.state == 'draft' && record.workflow.stage == 'queued' %>",
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
                    },
                    {
                        function: 'sails.services.doiservice.updateDoiTriggerSync',
                        options: {
                            forceRun: true,
                            triggerCondition: "<%= record.workflow.stage=='draft' %>",
                            event: 'draft'
                        }
                    }
                ]
            }
        }
    },
    // The "Existing locations" workspace record type definition.
    "existing-locations": {
        "searchable": false,
        "packageType": "workspace",
        "packageName": "existing-locations",
        "searchFilters": [
            {
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
            }
        ],
        hooks: {
            onCreate: {
                pre: [],
                postSync: [
                    {
                        function: 'sails.services.rdmpservice.addWorkspaceToRecord',
                        options: {}
                    }
                ]
            }
        }
    },
    "consolidated": {
        "searchable": false,
        "packageType": "rdmp",
        "packageName": "consolidated",
        "searchFilters": [],
        hooks: {}
    },
    "party": {
        packageType: "party",
        dashboard: {
            showAdminSideBar: true
        },
        hooks: {
            onCreate: {
                pre: [
                    {
                        function: 'sails.services.rdmpservice.runTemplates',
                        options: {
                            parseObject: false,
                            templates: [
                                {
                                    field: "metadata.fullName",
                                    template: "<%= _.get(record, 'metadata.givenName', '') + ' ' + _.get(record, 'metadata.surname', '') %>"
                                },
                                {
                                    field: "metadata.l_fullName",
                                    template: "<%= _.toLower(_.get(record, 'metadata.fullName', '')) %>"
                                }
                            ]
                        }
                    }
                ]
            },
            onUpdate: {
                pre: [
                    {
                        function: 'sails.services.rdmpservice.runTemplates',
                        options: {
                            parseObject: false,
                            templates: [
                                {
                                    field: "metadata.fullName",
                                    template: "<%= _.get(record, 'metadata.givenName', '') + ' ' + _.get(record, 'metadata.surname', '') %>"
                                },
                                {
                                    field: "metadata.l_fullName",
                                    template: "<%= _.toLower(_.get(record, 'metadata.fullName', '')) %>"
                                }
                            ]
                        }
                    }
                ]
            }
        }
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVjb3JkdHlwZS5jb25maWcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29uZmlnL3JlY29yZHR5cGUuY29uZmlnLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7R0FLRzs7O0FBc0VILCtEQUErRDtBQUNsRCxRQUFBLFVBQVUsR0FBcUI7SUFDeEMsTUFBTSxFQUFFO1FBQ0osYUFBYSxFQUFFLE1BQU07UUFDckIsS0FBSyxFQUFFO1lBQ0gsUUFBUSxFQUFFO2dCQUNOLEdBQUcsRUFBRTtvQkFDRDt3QkFDSSxRQUFRLEVBQUUsOENBQThDO3dCQUN4RCxPQUFPLEVBQUU7NEJBQ0wsZUFBZSxFQUFFLE9BQU87NEJBQ3hCLDJCQUEyQixFQUFFO2dDQUN6Qix5QkFBeUI7Z0NBQ3pCLG1DQUFtQztnQ0FDbkMsMEJBQTBCOzZCQUM3Qjs0QkFDRCwyQkFBMkIsRUFBRTtnQ0FDekIseUJBQXlCO2dDQUN6QixtQ0FBbUM7Z0NBQ25DLGlDQUFpQztnQ0FDakMsdUJBQXVCOzZCQUMxQjs0QkFDRCwwQkFBMEIsRUFBRSxXQUFXO3lCQUMxQztxQkFDSjtvQkFDRCxJQUFJO29CQUNKLHdEQUF3RDtvQkFDeEQsZUFBZTtvQkFDZixxRUFBcUU7b0JBQ3JFLGlCQUFpQjtvQkFDakIsZ0JBQWdCO29CQUNoQixnSkFBZ0o7b0JBQ2hKLHFDQUFxQztvQkFDckMsVUFBVTtvQkFDVixRQUFRO29CQUNSLE1BQU07b0JBQ04sSUFBSTtpQkFDUDtnQkFDRCxvSEFBb0g7Z0JBQ3BILFdBQVc7Z0JBQ1gsRUFBRTtnQkFDRixxREFBcUQ7Z0JBQ3JELGVBQWU7Z0JBQ2YsNkNBQTZDO2dCQUM3Qyw2QkFBNkI7Z0JBQzdCLDBEQUEwRDtnQkFDMUQsMkNBQTJDO2dCQUMzQyxNQUFNO2dCQUNOLEtBQUs7Z0JBQ0wsSUFBSSxFQUFFO2dCQUNGLElBQUk7Z0JBQ0osdUVBQXVFO2dCQUN2RSxlQUFlO2dCQUNmLDZFQUE2RTtnQkFDN0UsTUFBTTtnQkFDTixJ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