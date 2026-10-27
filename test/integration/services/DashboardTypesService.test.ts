
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

    describe('bootstrap with the selected reference repository', function () {
        const brand = { id: '0000000000000000000000a3', name: 'reference-fixture' };
        let originalAppMode;
        let originalDashboardTypeConfig;
        let repository;

        before(function () {
            originalAppMode = global.sails.config.appmode;
            originalDashboardTypeConfig = global.sails.config.dashboardtype;
            repository = require('@researchdatabox/redbox-core').getReferenceRepositories(global.sails).dashboardTypes;
        });
        beforeEach(async function () {
            await repository.removeForBrand(brand.id);
            global.sails.config.appmode = { bootstrapAlways: false };
            global.sails.config.dashboardtype = { type1: { formatRules: {}, searchable: true } };
        });
        afterEach(async function () {
            await repository.removeForBrand(brand.id);
            global.sails.config.appmode = originalAppMode;
            global.sails.config.dashboardtype = originalDashboardTypeConfig;
        });
        it('bootstraps absent definitions and retains create-only brand keys', async function () {
            const result = await DashboardTypesService.bootstrap(brand);
            expect(result).to.have.lengthOf(1);
            expect(result[0].name).to.equal('type1');
            const stored = await repository.findByName(brand.id, 'type1');
            expect(stored.key).to.equal(`${brand.id}_type1`);
            expect(stored.system).to.equal(true);
        });
        it('retains stored definitions instead of replacing them from config', async function () {
            const stored = await repository.createDefinition({ name: 'existing', branding: brand.id, formatRules: {}, searchable: false });
            const result = await DashboardTypesService.bootstrap(brand);
            expect(result.map(type => type.name)).to.deep.equal(['existing']);
            expect(result[0].searchable).to.equal(false);
            expect((await repository.findByName(brand.id, 'existing')).id).to.equal(stored.id);
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
