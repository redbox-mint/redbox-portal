import { projectNamedQueryRecords } from '../reference/projection';
import type { NamedQueryRequest, NamedQueryPage } from '../reference/NamedQueryExecution';
import { namedQueryCriteria } from '../reference/NamedQueryExecution';
import { getIdentityRepositories } from '../runtime';

/** Identity-owned named queries; tenant membership filtering precedes count and paging. */
export async function executeIdentityQuery(
  app: Sails.Application,
  request: NamedQueryRequest,
  count: boolean
): Promise<NamedQueryPage> {
  const repo = getIdentityRepositories(app);
  const target = request.target;
  if (target !== 'user' && target !== 'role' && target !== 'pathrule')
    throw new Error('Unsupported identity query target.');
  const rows = await repo.list(target, namedQueryCriteria(request.expression, false), {
    sort: request.sort,
    ...(target === 'user' ? { populate: ['roles'] } : {}),
  });
  let scoped = rows;
  if (target === 'user') {
    const links = await repo.list('userlink', { brandId: request.tenant, status: 'active' });
    const aliases = new Set(links.map(link => String(link.secondaryUserId)));
    scoped = rows.filter(
      user =>
        aliases.has(String(user.id)) ||
        (Array.isArray(user.roles) &&
          user.roles.some(
            role =>
              role &&
              typeof role === 'object' &&
              String(
                typeof Reflect.get(role, 'branding') === 'object' && Reflect.get(role, 'branding') !== null
                  ? Reflect.get(Reflect.get(role, 'branding'), 'id')
                  : Reflect.get(role, 'branding')
              ) === request.tenant
          ))
    );
  }
  return {
    total: count || target === 'user' ? scoped.length : 0,
    records: projectNamedQueryRecords(
      count || target === 'user'
        ? scoped.slice(request.start, request.rows === undefined ? undefined : request.start + request.rows)
        : scoped,
      request.select
    ),
  };
}
