export class PlanTable {
  totalItems: number = 0;
  currentPage: number = 0;
  noItems: number = 0;
  items: any[] = [];
}

export class RecordResponseTable {
  totalItems: number = 0;
  currentPage: number = 0;
  noItems: number = 0;
  items: any[] = [];
}

export class Plan {
  oid: string = '';
  title: string = '';
  dateCreated: string = '';
  dateModified: string = '';
  hasEditAccess:boolean = false;
  metadata: object = {};
  dashboardTitle: string = '';
}

// export declare class FilterBy {
//     filterBase: string;
//     filterBaseFieldOrValue: string;
//     filterField: string;
//     filterMode: string;
// }

export declare class FilterField {
    name: string;
    path: string;
}

export declare class QueryFilter {
  filterType: string;
  filterFields: FilterField[];
}

export declare class SortGroupBy {
  rowLevel: number;
  compareFieldValue: string;
  compareField: string;
  relatedTo: string;
}

export declare class FormatRules {
  filterBy: any;
  filterWorkflowStepsBy: string[];
  recordTypeFilterBy: string;
  queryFilters: { [key: string]: QueryFilter[] };
  sortBy: string;
  groupBy: string;
  sortGroupBy: SortGroupBy[];
  hideWorkflowStepTitleForRecordType: string[];
}

export declare class DashboardConfig {
  [key: string]: {
      formatRules: FormatRules;
  }
}