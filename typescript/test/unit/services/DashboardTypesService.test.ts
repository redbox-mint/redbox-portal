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
    });
});
