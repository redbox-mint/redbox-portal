export class PlanTable {

  totalItems: number
  currentPage: number
  noItems: number
  items: any[]
}

export class RecordResponseTable {

  totalItems: number
  currentPage: number
  noItems: number
  items: any[]
}

export class Plan {
  oid: string
  title: string
  dateCreated: string
  dateModified: string
  hasEditAccess:boolean
  metadata: object
  dashboardTitle: string;
}
