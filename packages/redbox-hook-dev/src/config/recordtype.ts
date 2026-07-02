import type { RecordTypeConfig } from '@researchdatabox/redbox-core';

/**
 * Demo record type definitions.
 *
 * Moved out of @researchdatabox/redbox-core so the core ships pristine (no
 * opinionated record types). Supplied to the portal for development and testing
 * via redbox-hook-dev's registerRedboxConfig().
 */
export const recordtype: RecordTypeConfig = {
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
                    }
                ],
                post: []
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
                    }
                ]
            }
        },
        relatedTo: [{
            "recordType": "dataRecord",
            "foreignField": "metadata.rdmp.oid"
        }],
        transferResponsibility: {
            fields: {
                chiefInvestigator: {
                    label: "@dmpt-people-tab-ci",
                    updateField: "contributor_ci",
                    updateAlso: ['dataOwner']
                },
                dataManager: {
                    label: "@dmpt-people-tab-data-manager",
                    updateField: 'contributor_data_manager'
                },
                dataOwner: {
                    label: "@dmpt-people-tab-data-owner",
                    fieldNames: {
                        email: "dataowner_email",
                        text_full_name: "dataowner_name"
                    }
                }
            },
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
            fields: {
                chiefInvestigator: {
                    label: "@dmpt-people-tab-ci",
                    updateField: "contributor_ci",
                    updateAlso: ['dataOwner']
                },
                dataManager: {
                    label: "@dmpt-people-tab-data-manager",
                    updateField: 'contributor_data_manager'
                },
                dataOwner: {
                    label: "@dmpt-people-tab-data-owner",
                    fieldNames: {
                        email: "dataowner_email",
                        text_full_name: "dataowner_name"
                    }
                }
            },
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
                    {
                        function: 'sails.services.recordsservice.updateNotificationLog',
                        options: {
                            name: "Set Notification to Draft",
                            triggerCondition: "<%= typeof record.notification == 'undefined'%>",
                            flagName: 'notification.state',
                            flagVal: 'draft',
                            saveRecord: false
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
                            to: "{{record.metadata.contributor_ci.email}},{{record.metadata.contributor_data_manager.email}},{{record.metadata.contributor_supervisor.email}}",
                            subject: "A publication has been staged for publishing.",
                            template: "publicationStaged",
                            onNotifySuccess: [
                                {
                                    function: 'sails.services.emailservice.sendRecordNotification',
                                    options: {
                                        forceRun: true,
                                        to: "notifications-reviewer@dev.local",
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
                                        logName: 'notification.log.reviewing',
                                        saveRecord: true
                                    }
                                }
                            ]
                        }
                    },
                    {
                        function: 'sails.services.emailservice.sendRecordNotification',
                        options: {
                            triggerCondition: "<%= record.notification != null && record.notification.state == 'emailed-reviewing' && record.workflow.stage == 'published' %>",
                            to: "{{record.metadata.contributor_ci.email}},{{record.metadata.contributor_data_manager.email}},{{record.metadata.contributor_supervisor.email}},notifications-reviewer@dev.local,{{join (pluck record.metadata.creators \"email\") \",\"}}",
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
                                        logName: 'notification.log.published',
                                        saveRecord: true
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
                    {
                        function: 'sails.services.recordsservice.updateNotificationLog',
                        options: {
                            name: "Set Notification to Draft",
                            triggerCondition: "<%= typeof record.notification == 'undefined'%>",
                            flagName: 'notification.state',
                            flagVal: 'draft',
                            saveRecord: false
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
                            to: "{{record.metadata.contributor_ci.email}},{{record.metadata.contributor_data_manager.email}},{{record.metadata.contributor_supervisor.email}}",
                            subject: "A publication has been staged for review.",
                            template: "publicationStaged",
                            onNotifySuccess: [
                                {
                                    function: 'sails.services.emailservice.sendRecordNotification',
                                    options: {
                                        forceRun: true,
                                        to: "notifications-reviewer@dev.local",
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
                                        logName: 'notification.log.reviewing',
                                        saveRecord: true
                                    }
                                }
                            ]
                        }
                    },



                    {
                        function: 'sails.services.emailservice.sendRecordNotification',
                        options: {
                            triggerCondition: "<%= record.notification != null && record.notification.state == 'emailed-reviewing' && record.workflow.stage == 'published' %>",
                            to: "{{record.metadata.contributor_ci.email}},{{record.metadata.contributor_data_manager.email}},{{record.metadata.contributor_supervisor.email}},notifications-reviewer@dev.local,{{join (pluck record.metadata.creators \"email\") \",\"}}",
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
                                        logName: 'notification.log.published',
                                        saveRecord: true
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
                pre: [
                ],
                postSync: [
                    {
                        function: 'sails.services.rdmpservice.addWorkspaceToRecord',
                        options: {
                        }
                    }
                ]
            }
        }
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
