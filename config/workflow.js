module.exports.workflow = {
  "rdmp": {
    "draft": {
      config: {
        workflow: {
          stage: 'draft',
          stageLabel: 'Draft',
        },
        authorization: {
          viewRoles: ['Admin', 'Librarians'],
          editRoles: ['Admin', 'Librarians']
        },
        form: 'default-1.0-draft',
        dashboard: {
          table: {
            rowConfig: [{
                title: 'Record Title',
                variable: 'metadata.title',
                template: `<a href='/<%= branding %>/<%= portal %>/record/view/<%= oid %>'><%= metadata.title %></a>
                            <span class="dashboard-controls">
                              <% if(hasEditAccess) { %>
                                <a href='/<%= branding %>/<%= portal %>/record/edit/<%= oid %>' aria-label='<%= translationService.t('edit-link-label') %>'><i class="fa fa-pencil" aria-hidden="true"></i></a>
                                <% if(workflow.stage == 'draft') { %>
                                  <a href='<%=rootContext%>/<%= branding %>/<%= portal %>/record/finalise/rdmp/edit/<%= oid %>' aria-label='Finalise Plan'>F</a>
                                <% } %>
                              <% } %>
                            </span>
                          `
              },
              {
                title: 'header-ci',
                variable: 'metadata.contributor_ci.text_full_name',
                template: '<%= metadata.contributor_ci != undefined ? metadata.contributor_ci.text_full_name : "" %>',
                
              },
              {
                title: 'header-supervisor',
                variable: 'metadata.contributor_supervisor.text_full_name',
                template: '<%= metadata.contributor_supervisor != undefined && metadata.contributor_supervisor.length > 0 ? metadata.contributor_supervisor[0].text_full_name : "" %>',
                
              },
              {
                title: 'header-created',
                variable: 'metaMetadata.createdOn',
                template: '<%= dateCreated %>',
                
              },
              {
                title: 'header-modified',
                variable: 'metaMetadata.lastSaveDate',
                template: '<%= dateModified %>',
                initialSort: 'desc'
              }
            ]
          },
          dashboardCustom: {
            table: {
              rowConfig: [
                {
                  title: 'header-record-type',
                  variable: 'metaMetadata.type',
                  template: '<%= metaMetadata.type %>',
                  
                },
                {
                  title: 'Record Title',
                  variable: 'metadata.title',
                  template: `<a href='<%=rootContext%>/<%= branding %>/<%= portal %>/record/view/<%= oid %>'><%= metadata.title %></a>
                              <span class="dashboard-controls">
                                <% if(hasEditAccess) { %>
                                  <a href='<%=rootContext%>/<%= branding %>/<%= portal %>/record/edit/<%= oid %>' aria-label='<%= translationService.t('edit-link-label') %>'><i class="fa fa-pencil" aria-hidden="true"></i></a>
                                <% } %>
                              </span>
                            `
                },
                {
                  title: 'header-ci',
                  variable: 'metadata.contributor_ci.text_full_name',
                  template: '<%= metadata.contributor_ci != undefined ? metadata.contributor_ci.text_full_name : "" %>',
                  
                },
                {
                  title: 'header-created',
                  variable: 'metaMetadata.createdOn',
                  template: '<%= dateCreated %>',
                  
                },
                {
                  title: 'header-modified',
                  variable: 'metaMetadata.lastSaveDate',
                  template: '<%= dateModified %>'
                },
                {
                  title: 'Actions',
                  variable: '',
                  template: `<%= rulesService.evaluateRowLevelRules(rulesConfig, metadata, metaMetadata, workflow, oid, 'dashboardActionsPerRow') %>`
                }
              ],
              formatCustomRules: {
                filterBy: [ {filterFieldValue: 'rdmp', filterField: 'metadata.metaMetadata.type'}, 
                            {filterFieldValue: 'dataRecord', filterField: 'metadata.metaMetadata.type'},
                            {filterFieldValue: 'dataPublication', filterField: 'metadata.metaMetadata.type'} ], 
                sortBy: '',
                groupBy: 'groupedByRelationships', //values: notGroupedAnyOrder, groupedByRecordType, groupedByRelationships 
                sortGroupBy: [{ rowLevel: 0, compareFieldValue: 'rdmp', compareField: 'metadata.metaMetadata.type', indent: 0, icon: 'none' }, 
                              { rowLevel: 1, compareFieldValue: 'dataRecord', compareField: 'metadata.metaMetadata.type', indent: 1, icon: 'tree-relationsip.png' }, 
                              { rowLevel: 2, compareFieldValue: 'dataPublication', compareField: 'metadata.metaMetadata.type', indent: 1, icon: 'tree-relationsip.png' }], //values: as many levels as required?
                filterWorkflowStepsBy: 'all', //values: all or a particular type i.e. draft or finalised  
              },
              rowRulesConfig: [
                {
                  ruleSetName: 'dashboardActionsPerRow',
                  applyRuleSet: true, //easy way to enable or desable the whole rule set
                  type: 'multi-value',
                  separator: ' | ',
                  rules: [ 
                      {
                        name: 'Edit', 
                        action: 'show', //options show / hide
                        renderItemTemplate: `<a href='<%=rootContext%>/<%= branding %>/<%= portal %>/record/edit/<%= oid %>'><%= name %></a>`,
                        evaluateRulesTemplate: `<%= _.get(workflow, 'stage') == 'draft' %>`  
                      },
                      {
                        name: 'Create dataset from this plan', 
                        action: 'show', //options show / hide
                        renderItemTemplate: '<%= name %>',
                        evaluateRulesTemplate: `<%= _.get(workflow, 'stage') == 'draft' && _.get(metaMetadata, 'type') == 'rdmp' %>`
                      },
                      {
                        name: 'Close data plan', 
                        action: 'show', //options show / hide
                        renderItemTemplate: '<%= name %>',
                        evaluateRulesTemplate: `<%= _.get(workflow, 'stage') == 'draft' && _.get(metaMetadata, 'type') == 'rdmp' %>`
                      },
                      {
                        name: 'Create a publication record from this dataset', 
                        action: 'show', //options show / hide
                        renderItemTemplate: '<%= name %>',
                        evaluateRulesTemplate: `<%= _.get(workflow, 'stage') == 'draft' && _.get(metaMetadata, 'type') == 'dataRecord' %>`
                      },
                      {
                        name: 'Close dataset info', 
                        action: 'show', //options show / hide
                        renderItemTemplate: '<%= name %>',
                        evaluateRulesTemplate: `<%= _.get(workflow, 'stage') == 'draft' && _.get(metaMetadata, 'type') == 'dataRecord' %>`
                      },
                      {
                        name: 'Submit for library review', 
                        action: 'show', //options show / hide
                        renderItemTemplate: '<%= name %>',
                        evaluateRulesTemplate: `<%= _.get(workflow, 'stage') == 'draft' && _.get(metaMetadata, 'type') == 'dataPublication' %>`
                      }
                    ]
                  }
                ],
                groupRowConfig: [
                  {
                    title: 'Actions',
                    variable: '',
                    template: `<%= rulesService.evaluateGroupRowRules(groupRulesConfig, groupedItems, 'dashboardActionsPerGroupRow') %>`
                  }
                ],
                groupRowRulesConfig: [
                  {
                    ruleSetName: 'dashboardActionsPerGroupRow',
                    applyRuleSet: true, //easy way to enable or desable the whole rule set
                    rules: [ 
                      {
                        name: 'Send for Conferral', 
                        action: 'show', //options show / hide
                        renderItemTemplate: `<%= name %>`,
                        evaluateRulesTemplate: `<%= _.get(workflow, 'stage') == 'draft' %>`
                        // evaluateRulesTemplate: `<%= _.get(workflow, 'stage') == 'finalised' && _.get(metadata, 'project-type') == 'rhd' %>`
                      }
                    ]
                  }
                ]
            }
          }
        }
      },
      starting: true
    }
  },
  "dataRecord": {
    "draft": {
      config: {
        workflow: {
          stage: 'draft',
          stageLabel: 'Draft',
        },
        authorization: {
          viewRoles: ['Admin', 'Librarians'],
          editRoles: ['Admin', 'Librarians']
        },
        form: 'dataRecord-1.0-draft'
      },
      starting: true
    }
  },
  "dataPublication": {
    "draft": {
      config: {
        workflow: {
          stage: 'draft',
          stageLabel: 'Draft',
        },
        authorization: {
          viewRoles: ['Admin', 'Librarians'],
          editRoles: ['Admin', 'Librarians']
        },
        form: 'dataPublication-1.0-draft',
        displayIndex: 1
      },
      starting: true
    },
    "queued": {
      config: {
        workflow: {
          stage: 'queued',
          stageLabel: 'Queued For Review',
        },
        authorization: {
          viewRoles: ['Admin', 'Librarians'],
          editRoles: ['Admin', 'Librarians']
        },
        form: 'dataPublication-1.0-queued',
        displayIndex: 2
      }
    },
    "embargoed": {
      config: {
        workflow: {
          stage: 'embargoed',
          stageLabel: 'Embargoed',
        },
        authorization: {
          viewRoles: ['Admin', 'Librarians'],
          editRoles: ['Admin', 'Librarians']
        },
        form: 'dataPublication-1.0-embargoed',
        displayIndex: 3
      }
    },
    "published": {
      config: {
        workflow: {
          stage: 'published',
          stageLabel: 'Published',
        },
        authorization: {
          viewRoles: ['Admin', 'Librarians'],
          editRoles: ['Admin']
        },
        form: 'dataPublication-1.0-published',
        displayIndex: 6
      }
    },
    "retired": {
      config: {
        workflow: {
          stage: 'retired',
          stageLabel: 'Retired',
        },
        authorization: {
          viewRoles: ['Admin', 'Librarians'],
          editRoles: ['Admin']
        },
        form: 'dataPublication-1.0-retired',
        displayIndex: 7
      }
    }

  },
  // The "Existing Locations" workflow...
  "existing-locations": {
    "existing-locations-draft": {
      config: {
        workflow: {
          stage: 'existing-locations-draft',
          stageLabel: 'Draft',
        },
        authorization: {
          viewRoles: ['Admin', 'Librarians'],
          editRoles: ['Admin', 'Librarians']
        },
        form: 'existing-locations-1.0-draft',
        displayIndex: 0,
        dashboard: {
          table: {
            rowConfig: [
              {
                title: '@workspace-name',
                variable: 'metadata.title',
                template: "<%= metadata.title %>",
                initialSort: 'desc'
              },
              {
                title: '@workspace-type',
                variable: 'metadata.storage_type',
                template: "<%= metadata.storage_type %>"
              },
              {
                title: '@related-rdmp-title',
                variable: 'metadata.rdmpOid',
                template: "<a href='/<%= branding %>/<%= portal %>/record/view/<%= metadata.rdmpOid %>'><%= metadata.rdmpTitle %></a>"
              }
            ]
          }
        }
      },
      starting: true
    }
  }
};
