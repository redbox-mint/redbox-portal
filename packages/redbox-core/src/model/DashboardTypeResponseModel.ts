import type { DashboardTableConfig } from '../config/workflow.config';

export class DashboardTypeResponseModel {
    name: string;
    description?: string;
    formatRules: Record<string, unknown>;
    tableConfig: DashboardTableConfig;
    searchable: boolean;
    system: boolean;

    constructor(input: {
      name: string;
      description?: string;
      formatRules: Record<string, unknown>;
      tableConfig?: DashboardTableConfig;
      searchable?: boolean;
      system?: boolean;
    }) {
        this.name = input.name;
        this.description = input.description;
        this.formatRules = input.formatRules;
        this.tableConfig = input.tableConfig ?? { rowConfig: [] };
        this.searchable = input.searchable ?? true;
        this.system = input.system ?? false;
    }
}
