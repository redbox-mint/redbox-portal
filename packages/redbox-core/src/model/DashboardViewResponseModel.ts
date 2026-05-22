import type { DashboardViewDefinition, DashboardViewStepDefinition } from '../config/dashboardview.config';

export class DashboardViewStepResponseModel {
    name: string;
    sourceRecordType: string;
    sourceWorkflowStage?: string;
    fetchMode: DashboardViewStepDefinition['fetchMode'];
    dashboardTable: DashboardViewStepDefinition['dashboardTable'];
    baseRecordType?: string;

    constructor(step: DashboardViewStepDefinition) {
        this.name = step.name;
        this.sourceRecordType = step.sourceRecordType;
        this.sourceWorkflowStage = step.sourceWorkflowStage;
        this.fetchMode = step.fetchMode;
        this.dashboardTable = step.dashboardTable;
        this.baseRecordType = step.baseRecordType;
    }
}

export class DashboardViewResponseModel {
    name: string;
    titleLabelKey: string;
    showAdminSideBar?: boolean;
    dashboardType: string;
    sourceRecordType: string;
    steps: DashboardViewStepResponseModel[];

    constructor(view: DashboardViewDefinition) {
        this.name = view.name;
        this.titleLabelKey = view.titleLabelKey;
        this.showAdminSideBar = view.showAdminSideBar;
        this.dashboardType = view.dashboardType;
        this.sourceRecordType = view.sourceRecordType;
        this.steps = (view.steps || []).map((step) => new DashboardViewStepResponseModel(step));
    }
}
