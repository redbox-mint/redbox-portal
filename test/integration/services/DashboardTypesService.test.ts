const { portalFixture: fixture } = require("../../helpers/portalFixture.cjs");

declare var global: any;

describe('DashboardTypesService', function () {
    let originalRecordTypesService;
    let originalWorkflowStepsService;
    let originalDashboardConfigService;

    before(function () {
        originalRecordTypesService = fixture.services.RecordTypesService;
        originalWorkflowStepsService = fixture.services.WorkflowStepsService;
        originalDashboardConfigService = fixture.services.DashboardConfigService;
    });

    after(function () {
        fixture.services.RecordTypesService = originalRecordTypesService;
        fixture.services.WorkflowStepsService = originalWorkflowStepsService;
        fixture.services.DashboardConfigService = originalDashboardConfigService;
    });

    describe('bootstrap with the selected reference repository', function () {
        const brand = { id: '0000000000000000000000a3', name: 'reference-fixture' };
        let originalAppMode;
        let originalDashboardTypeConfig;
        let repository;

        before(function () {
            originalAppMode = fixture.owner.config.appmode;
            originalDashboardTypeConfig = fixture.owner.config.dashboardtype;
            repository = require('@researchdatabox/redbox-core').getReferenceRepositories(fixture.owner).dashboardTypes;
        });
        beforeEach(async function () {
            await repository.removeForBrand(brand.id);
            fixture.owner.config.appmode = { bootstrapAlways: false };
            fixture.owner.config.dashboardtype = { type1: { formatRules: {}, searchable: true } };
        });
        afterEach(async function () {
            await repository.removeForBrand(brand.id);
            fixture.owner.config.appmode = originalAppMode;
            fixture.owner.config.dashboardtype = originalDashboardTypeConfig;
        });
        it('bootstraps absent definitions and retains create-only brand keys', async function () {
            const result = await fixture.services.DashboardTypesService.bootstrap(brand);
            expect(result).to.have.lengthOf(1);
            expect(result[0].name).to.equal('type1');
            const stored = await repository.findByName(brand.id, 'type1');
            expect(stored.key).to.equal(`${brand.id}_type1`);
            expect(stored.system).to.equal(true);
        });
        it('retains stored definitions instead of replacing them from config', async function () {
            const stored = await repository.createDefinition({ name: 'existing', branding: brand.id, formatRules: {}, searchable: false });
            const result = await fixture.services.DashboardTypesService.bootstrap(brand);
            expect(result.map(type => type.name)).to.deep.equal(['existing']);
            expect(result[0].searchable).to.equal(false);
            expect((await repository.findByName(brand.id, 'existing')).id).to.equal(stored.id);
        });
    });

    describe('template extraction from independent settings', function () {
        let originalDashboardConfigService;
        before(function () { originalDashboardConfigService = fixture.services.DashboardConfigService; });
        after(function () { fixture.services.DashboardConfigService = originalDashboardConfigService; });

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
            fixture.services.DashboardConfigService = { getRuntimeTargetSettings: () => Promise.resolve(null) };
            const result = await fixture.services.DashboardTypesService.getDashboardTableConfig({ name: 'default' }, 'rdmp', 'draft');
            expect(result).to.be.null;
        });

        it('extracts only the saved columns and search filter templates, keyed by target and fingerprint', async function () {
            fixture.services.DashboardConfigService = { getRuntimeTargetSettings: () => Promise.resolve({ settings, fingerprint: '0123456789abcdef0123' }) };
            const templates = await fixture.services.DashboardTypesService.extractDashboardTemplates({ name: 'default' }, 'rdmp', 'draft');
            expect(templates.map(t => t.value)).to.deep.equal(['<b>{{custom.field}}</b>', '{{filterTemplate}}']);
            expect(templates[0].key).to.deep.equal(['default', 'workflow', 'rdmp', 'draft', '0123456789abcdef', 'rowConfig', '0', 'custom.field']);
            expect(templates[1].key).to.include('filters');
        });
    });
});
