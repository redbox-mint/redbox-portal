import type { Definition } from './ReferenceRepositories';

/** Waterline's exact wildcard means the complete row, including extension fields. */
function selectedFields(fields?: readonly string[] | null): readonly string[] | undefined {
  return fields && !(fields.length === 1 && fields[0] === '*') ? fields : undefined;
}
export function projectReferenceFields<T extends Definition>(row: T, fields?: readonly string[] | null): T {
  const selection = selectedFields(fields);
  return selection
    ? (Object.fromEntries(
        ['id', ...selection].filter(field => Object.hasOwn(row, field)).map(field => [field, row[field]])
      ) as T)
    : row;
}
