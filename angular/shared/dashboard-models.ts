export class PlanTable {

  totalItems: number
  currentPage: number
  noItems: number
  items: Plan[]
}
export class Plan {
  oid: string
  title: string
  dateCreated: string
  dateModified: string

  dashboardTitle: string;
}
