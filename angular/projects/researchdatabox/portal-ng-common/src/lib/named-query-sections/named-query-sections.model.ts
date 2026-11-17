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

/** One sentence-case sorting summary for explorer publication and named-query editing. */
export function formatNamedQuerySort(
  values: readonly unknown[],
  labels: Record<string, string>,
  text: (key: string) => string
): string {
  return values
    .flatMap(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
      const sort = value as { field?: string; direction?: string };
      const field = sort.field ?? '';
      return [
        (labels[field] ?? field) +
          ', ' +
          text(sort.direction === 'DESC' ? 'data-grids-descending' : 'data-grids-ascending').toLocaleLowerCase(),
      ];
    })
    .join('; ');
}
