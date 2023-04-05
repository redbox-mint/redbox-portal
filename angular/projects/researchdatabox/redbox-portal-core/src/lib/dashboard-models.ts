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
