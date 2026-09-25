const { of } = require('rxjs');


declare var global: any;

describe('DashboardTypesService', function () {
    let originalRecordTypesService;
    let originalWorkflowStepsService;
    let originalDashboardConfigService;

    before(function () {
        originalRecordTypesService = global.RecordTypesService;
        originalWorkflowStepsService = global.WorkflowStepsService;
        originalDashboardConfigService = global.DashboardConfigService;
    });

    after(function () {
        global.RecordTypesService = originalRecordTypesService;
        global.WorkflowStepsService = originalWorkflowStepsService;
        global.DashboardConfigService = originalDashboardConfigService;
    });

    // Helper to mock Waterline queries which are expected by CoreService.getObservable
    const mockQuery = (result) => ({
        exec: (cb) => cb(null, result),
        then: (resolve) => resolve(result),
        catch: (reject) => {}
    });

    describe('bootstrap', function () {
        let originalDashboardType;
        let originalAppMode;
        let originalDashboardTypeConfig;

        before(function() {
            originalDashboardType = global.DashboardType;
            originalAppMode = global.sails.config.appmode;
            originalDashboardTypeConfig = global.sails.config.dashboardtype;
        });

        after(function() {
            global.DashboardType = originalDashboardType;
            global.sails.config.appmode = originalAppMode;
            global.sails.config.dashboardtype = originalDashboardTypeConfig;
        });

        it('should bootstrap dashboard types if none exist', async function () {
             const mockConfig = {
                 'type1': { searchFilters: {}, formatRules: {}, searchable: true }
             };
             global.sails.config.dashboardtype = mockConfig;
             global.sails.config.appmode = { bootstrapAlways: false };
             
             global.DashboardType = {
                 find: () => Promise.resolve([]),
                 findOne: () => mockQuery(null),
                 create: (data) => mockQuery(data)
             };
             
             const result = await DashboardTypesService.bootstrap({ id: 'brand1' });
             expect(result).to.have.lengthOf(1);
             expect(result[0].name).to.equal('type1');
        });

        it('should return existing dashboard types if they exist', async function () {
            const mockDashboardTypes = [{ name: 'existing' }];
            global.DashboardType = {
                find: () => Promise.resolve(mockDashboardTypes),
                destroy: () => Promise.resolve([])
            };
            global.sails.config.appmode = { bootstrapAlways: false };

            const result = await DashboardTypesService.bootstrap({ id: 'brand1' });
            expect(result).to.deep.equal([{
                name: 'existing',
                description: undefined,
                formatRules: {},
                searchable: true,
                system: false,
                tableConfig: {
                    rowConfig: [
                        {
                            title: 'Record Title',
                            variable: 'metadata.title',
                            template: `<a href='{{rootContext}}/{{branding}}/{{portal}}/record/view/{{oid}}'>{{metadata.title}}</a>
            <span class="dashboard-controls">
              {{#if hasEditAccess}}
                <a href='{{rootContext}}/{{branding}}/{{portal}}/record/edit/{{oid}}' aria-label='{{t "edit-link-label"}}'><i class="fa fa-pencil" aria-hidden="true"></i></a>
              {{/if}}
            </span>
          `,
                            initialSort: 'desc'
                        },
                        {
                            title: 'header-ci',
                            variable: 'metadata.contributor_ci.text_full_name',
                            template: '{{#if metadata.contributor_ci}}{{metadata.contributor_ci.text_full_name}}{{/if}}',
                            initialSort: 'desc'
                        },
                        {
                            title: 'header-data-manager',
                            variable: 'metadata.contributor_data_manager.text_full_name',
                            template: '{{#if metadata.contributor_data_manager}}{{metadata.contributor_data_manager.text_full_name}}{{/if}}',
                            initialSort: 'desc'
                        },
                        {
                            title: 'header-created',
                            variable: 'metaMetadata.createdOn',
                            template: '{{formatDateLocale dateCreated "DATETIME_MED"}}',
                            initialSort: 'desc'
                        },
                        {
                            title: 'header-modified',
                            variable: 'metaMetadata.lastSaveDate',
                            template: '{{formatDateLocale dateModified "DATETIME_MED"}}',
                            initialSort: 'desc',
                            defaultSort: true
                        }
                    ]
                }
            }]);
            expect(result[0].tableConfig.rowConfig).to.be.an('array').that.is.not.empty;
        });
    });

    describe('template extraction from independent settings', function () {
        let originalDashboardConfigService;
        before(function () { originalDashboardConfigService = global.DashboardConfigService; });
        after(function () { global.DashboardConfigService = originalDashboardConfigService; });

        const settings = {
            searchable: true,
            showStageTitle: true,
            tableConfig: {
                rowConfig: [{ title: 'Custom', variable: 'custom.field', template: '<b>{{custom.field}}</b>' }],
                rowRulesConfig: [],
                groupRowConfig: [],
                groupRowRulesConfig: [],
                formatRules: { queryFilters: { rdmp: [{ filterType: 'text', filterFields: [{ name: 'T', path: 'metadata.title', template: '{{filterTemplate}}' }] }] } }
            }
        };

        it('returns null table config when a stage has no saved settings', async function () {
            global.DashboardConfigService = { getRuntimeTargetSettings: () => Promise.resolve(null) };
            const result = await DashboardTypesService.getDashboardTableConfig({ name: 'default' }, 'rdmp', 'draft');
            expect(result).to.be.null;
        });

        it('extracts only the saved columns and search filter templates, keyed by target and fingerprint', async function () {
            global.DashboardConfigService = { getRuntimeTargetSettings: () => Promise.resolve({ settings, fingerprint: '0123456789abcdef0123' }) };
            const templates = await DashboardTypesService.extractDashboardTemplates({ name: 'default' }, 'rdmp', 'draft');
            expect(templates.map(t => t.value)).to.deep.equal(['<b>{{custom.field}}</b>', '{{filterTemplate}}']);
            expect(templates[0].key).to.deep.equal(['default', 'workflow', 'rdmp', 'draft', '0123456789abcdef', 'rowConfig', '0', 'custom.field']);
            expect(templates[1].key).to.include('filters');
        });
    });
});
