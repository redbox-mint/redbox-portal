import type { GraphqlNamedQueryVariable, NamedQueryJson, NamedQueryPath } from '@researchdatabox/sails-ng-common';

export interface NamedQueryParameterRow {
  variable: string;
  label: string;
  inputType: string;
  value?: NamedQueryJson;
  /** Optional plain-language rendering; value retains the actual stored binding. */
  displayValue?: string;
  binding?: GraphqlNamedQueryVariable;
  paging?: boolean;
  consumerAllowed: boolean;
}
export interface NamedQueryResultField {
  label: string;
  path: NamedQueryPath;
  type?: string;
  choices?: { value: string; label: string }[];
}
export interface NamedQueryBindingChange {
  variable: string;
  binding: GraphqlNamedQueryVariable;
}
