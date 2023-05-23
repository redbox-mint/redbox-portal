"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardConfigModel = void 0;
class DashboardConfigModel {
    constructor(name, dashboardConfig) {
        this.name = name;
        this.baseRecordType = dashboardConfig.dashboardConfig;
        this.table = new DashboardTableConfig(dashboardConfig.table);
    }
    getSailsModel(brandId) {
        return {
            branding: brandId,
            name: this.name,
            baseRecordType: this.baseRecordType,
            table: this.table
        };
    }
    static getSailsModelConfig() {
        return {
            attributes: {
                key: {
                    type: 'string',
                    unique: true
                },
                name: {
                    type: 'string',
                    required: true
                },
                branding: {
                    model: 'brandingconfig',
                    required: true
                },
                table: {
                    type: 'json',
                    required: true
                }
            },
            beforeCreate: function (dashboardType, cb) {
                dashboardType.key = dashboardType.branding + '_' + dashboardType.name;
                cb();
            }
        };
    }
}
exports.DashboardConfigModel = DashboardConfigModel;
class DashboardTableConfig {
    constructor(dashboardTableConfig) {
        this.rowConfig = [];
        this.rowRulesConfig = [];
        this.groupRowConfig = [];
        this.groupRowRulesConfig = [];
        sails.log.error(JSON.stringify(dashboardTableConfig.rowConfig));
        this.rowConfig = _.get(dashboardTableConfig, 'rowConfig', this.rowConfig);
        this.rowRulesConfig = _.get(dashboardTableConfig, 'rowRulesConfig', this.rowRulesConfig);
        this.groupRowConfig = _.get(dashboardTableConfig, 'groupRowConfig', this.groupRowConfig);
        this.groupRowRulesConfig = _.get(dashboardTableConfig, 'groupRowRulesConfig', this.groupRowRulesConfig);
        this.formatRules = _.get(dashboardTableConfig, 'formatRules', this.formatRules);
    }
}
var FilterBaseType;
(function (FilterBaseType) {
    FilterBaseType["record"] = "record";
    FilterBaseType["user"] = "user";
})(FilterBaseType || (FilterBaseType = {}));
var FilterMode;
(function (FilterMode) {
    FilterMode["equal"] = "equal";
    FilterMode["regex"] = "regex";
})(FilterMode || (FilterMode = {}));
class DashboardTypeFormatRulesFilterType {
    constructor() {
        this.filterBase = FilterBaseType.record;
        this.filterBaseFieldOrValue = 'rdmp';
        this.filterField = 'metaMetadata.type';
        this.filterMode = FilterMode.equal;
    }
}
class DashboardTypeFormatRulesSortGroupBy {
    constructor() {
        this.rowLevel = 0;
        this.compareFieldValue = '';
        this.compareField = '';
        this.relatedTo = '';
    }
}
var DashboardTypeFormatRulesGroupBy;
(function (DashboardTypeFormatRulesGroupBy) {
    DashboardTypeFormatRulesGroupBy["empty"] = "";
    DashboardTypeFormatRulesGroupBy["groupedByRecordType"] = "groupedByRecordType";
    DashboardTypeFormatRulesGroupBy["groupedByRelationships"] = "groupedByRelationships";
})(DashboardTypeFormatRulesGroupBy || (DashboardTypeFormatRulesGroupBy = {}));
class DashboardTypeFormatRules {
    constructor() {
        this.filterWorkflowStepsBy = [];
        this.sortBy = 'metaMetadata.lastSaveDate:-1';
        this.groupBy = DashboardTypeFormatRulesGroupBy.empty;
        this.sortGroupBy = [];
    }
}
class DashboardType {
    constructor(data) {
        this.formatRules = new DashboardTypeFormatRules();
        this.name = _.get(data, 'name', this.name);
        this.formatRules = _.get(data, 'formatRules', this.formatRules);
    }
}
class WorkflowStepConfigStepInfo {
    constructor(data) {
        this.stage = data.stage;
        this.stageLabel = data.stageLabel;
    }
}
class DashboardTableRowConfig {
    constructor(data) {
        this.title = data.title;
        this.variable = data.variable;
        this.template = data.template;
        this.initialSort = data.initialSort;
    }
}
class DashboardTableRowRule {
    constructor(data) {
        this.name = data.name;
        this.action = data.action;
        this.renderItemTemplate = data.renderItemTemplate;
        this.evaluateRulesTemplate = data.evaluateRulesTemplate;
    }
}
class DashboardTableRowRulesConfig {
    constructor(data) {
        this.ruleSetName = data.ruleSetName;
        this.applyRuleSet = data.applyRuleSet;
        this.type = data.type;
        this.rules = data.rules;
    }
}
class WorkflowStepConfigDashboard {
    constructor(data) {
        this.table = data.table;
    }
}
class WorkflowStepConfig {
    constructor() {
        this.authorization = {};
        this.baseRecordType = '';
    }
}
class WorkflowStep {
    constructor(data) {
        this.name = data.name;
        this.form = data.form;
        this.config = data.config;
        this.starting = data.starting;
        this.recordType = data.recordType;
        this.hidden = data.hidden;
    }
}
var DashboardTypeOptions;
(function (DashboardTypeOptions) {
    DashboardTypeOptions["standard"] = "standard";
    DashboardTypeOptions["workspace"] = "workspace";
    DashboardTypeOptions["consolidated"] = "consolidated";
})(DashboardTypeOptions || (DashboardTypeOptions = {}));
