import type { DashboardViewDefinition, DashboardViewStepDefinition } from '../config/dashboardview.config';

/**
 * Structural view step metadata. Table settings are served separately from the
 * independent dashboard configuration; the hook's `dashboardTable` is only a
 * one-time seed and is not exposed here.
 */
export class DashboardViewStepResponseModel {
    name: string;
    sourceRecordType: string;
    sourceWorkflowStage?: string;
    fetchMode: DashboardViewStepDefinition['fetchMode'];
    baseRecordType?: string;

    constructor(step: DashboardViewStepDefinition) {
        this.name = step.name;
        this.sourceRecordType = step.sourceRecordType;
        this.sourceWorkflowStage = step.sourceWorkflowStage;
        this.fetchMode = step.fetchMode;
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
