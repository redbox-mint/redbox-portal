const { of } = require('rxjs');


declare var global: any;
declare var RecordTypesService: any;
declare var WorkflowStepsService: any;
declare var DashboardTypesService: any;

describe('DashboardTypesService', function () {
    let originalRecordTypesService;
    let originalWorkflowStepsService;

    before(function () {
        originalRecordTypesService = global.RecordTypesService;
        originalWorkflowStepsService = global.WorkflowStepsService;
    });

    after(function () {
        global.RecordTypesService = originalRecordTypesService;
        global.WorkflowStepsService = originalWorkflowStepsService;
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
            expect(result).to.deep.equal(mockDashboardTypes);
        });
    });

    describe('getDashboardTableConfig', function () {
        it('should return null if record type not found', async function () {
            global.RecordTypesService = {
                get: () => of(null)
            };
            const result = await DashboardTypesService.getDashboardTableConfig({}, 'invalid', 'draft');
            expect(result).to.be.null;
        });

        it('should return null if workflow step not found', async function () {
            global.RecordTypesService = {
                get: () => of({ name: 'valid' })
            };
            global.WorkflowStepsService = {
                get: () => of(null)
            };
            const result = await DashboardTypesService.getDashboardTableConfig({}, 'valid', 'invalid');
            expect(result).to.be.null;
        });
    });

    describe('extractDashboardTemplates', function () {
        it('should extract templates using default config when rowConfig is missing', async function () {
            // Mock RecordTypesService
            global.RecordTypesService = {
                get: () => of({ name: 'rdmp' })
            };

            // Mock WorkflowStepsService with missing dashboard config (simulation of the bug case)
            global.WorkflowStepsService = {
                get: () => of({ config: { dashboard: { table: {} } } })
            };

            // Call the service method
            // Note: first argument 'brand' is mocked as empty object
            const templates = await DashboardTypesService.extractDashboardTemplates({}, 'rdmp', 'draft');

            // Expect default templates (fallback logic)
            expect(templates).to.be.an('array');
            expect(templates.length).to.be.greaterThan(0);

            // defaultRowConfig has title at index 0 (usually)
            // key structure: [recordType, workflowStage, 'rowConfig', index, variable]
            const titleTemplate = templates.find(t => {
                const keyStr = t.key.join('__'); // helper to check content
                return keyStr.includes('metadata.title');
            });

            expect(titleTemplate).to.exist;
            expect(titleTemplate.value).to.contain('{{metadata.title}}');

            // Verify keys match expected flattened format (as string array)
            expect(titleTemplate.key).to.be.an('array');
            expect(titleTemplate.key[0]).to.equal('rdmp');
            expect(titleTemplate.key[1]).to.equal('draft');
            expect(titleTemplate.key[2]).to.equal('rowConfig');
        });

        it('should extract templates from explicit config when provided', async function () {
            // Mock RecordTypesService
            global.RecordTypesService = {
                get: () => of({ name: 'rdmp' })
            };

            // Mock WorkflowStepsService WITH explicit dashboard config
            const explicitConfig = {
                rowConfig: [
                    {
                        variable: 'custom.field',
                        template: '<b>{{custom.field}}</b>'
                    }
                ]
            };

            global.WorkflowStepsService = {
                get: () => of({ config: { dashboard: { table: explicitConfig } } })
            };

            const templates = await DashboardTypesService.extractDashboardTemplates({}, 'rdmp', 'draft');

            expect(templates).to.be.an('array');
            expect(templates.length).to.equal(1);

            const customTemplate = templates[0];
            expect(customTemplate.key).to.contain('custom.field');
            expect(customTemplate.value).to.equal('<b>{{custom.field}}</b>');
        });

        it('should extract templates from queryFilters in DashboardType config', async function () {
            let originalDashboardType = global.DashboardType;
            
            // Mock RecordTypesService
            global.RecordTypesService = {
                get: () => of({ name: 'rdmp' })
            };
            // Mock WorkflowStepsService
            global.WorkflowStepsService = {
                get: () => of({ config: { dashboard: { table: {} } } })
            };
            
            const mockDashboardType = {
                formatRules: {
                    queryFilters: {
                        'rdmp': [
                            {
                                filterFields: [
                                    {
                                        template: '{{filterTemplate}}'
                                    }
                                ]
                            }
                        ]
                    }
                }
            };
            
            global.DashboardType = {
                findOne: () => mockQuery(mockDashboardType)
            };
            
            try {
                const templates = await DashboardTypesService.extractDashboardTemplates({}, 'rdmp', 'draft', 'standard');
                
                const filterTemplate = templates.find(t => t.value === '{{filterTemplate}}');
                expect(filterTemplate).to.exist;
                expect(filterTemplate.key).to.include('filters');
            } finally {
                global.DashboardType = originalDashboardType;
            }
        });
    });
});
