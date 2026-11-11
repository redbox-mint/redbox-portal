import type { GraphqlNamedQueryVariable, NamedQueryJson, NamedQueryPath } from '@researchdatabox/sails-ng-common';

export interface NamedQueryParameterRow {
  variable: string;
  label: string;
  inputType: string;
  value?: NamedQueryJson;
  binding?: GraphqlNamedQueryVariable;
  paging?: boolean;
  consumerAllowed: boolean;
}
export interface NamedQueryResultField {
  label: string;
  path: NamedQueryPath;
  type?: string;
}
export interface NamedQueryBindingChange {
  variable: string;
  binding: GraphqlNamedQueryVariable;
}
