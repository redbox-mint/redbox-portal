export class Report {

  title: string
  name: string
  solrQuery: string
  filter: object | object[]
  columns: object[]
}

export class ReportResults {
  totalItems: number
  currentPage: number
  noItems: number
  items: object[]
}
