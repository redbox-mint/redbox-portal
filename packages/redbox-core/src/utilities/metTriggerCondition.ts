import * as _ from 'lodash';

/** Shared legacy trigger expression behavior, independent of a host/service base. */
export function metTriggerCondition(
  oid: string | null,
  record: Record<string, unknown>,
  options: Record<string, unknown>,
  user?: unknown
): string {
  const triggerCondition = _.get(options, 'triggerCondition', '') as string;
  const forceRun = _.get(options, 'forceRun', false) as boolean;
  const variables = { record, oid, user: user || null, imports: { record, oid, user: user || null } };
  if (!_.isUndefined(triggerCondition) && !_.isEmpty(triggerCondition))
    return _.template(triggerCondition, variables)();
  return forceRun ? 'true' : 'false';
}
