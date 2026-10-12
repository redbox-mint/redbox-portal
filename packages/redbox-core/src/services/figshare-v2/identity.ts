import { randomUUID } from 'node:crypto';
import type { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import type { FigshareBinding, FigshareCreateOperation } from '../../model/storage/FigshareSyncModel';
import type { FigshareClient } from './http';
import { FigshareHttpError } from './http';
import { getRecordField, type RecordModel, type FigshareArticle } from './types';
import { FigshareRepairRequired } from './execution';

export function apiNamespace(config: FigsharePublishingConfigData): string { return config.connection.baseUrl.replace(/\/+$/, ''); }
export async function resolveCreationOwner(client: FigshareClient, config: FigsharePublishingConfigData, record: RecordModel, accountId: string): Promise<string> {
  const policy = config.impersonation;
  if (!policy?.enabled) return accountId;
  const institutionalId = String(getRecordField(record, policy.institutionalIdPath) ?? '').trim();
  const email = String(getRecordField(record, policy.emailPath) ?? '').trim().toLowerCase();
  if (!institutionalId && !(policy.allowEmailFallback && email)) throw new FigshareRepairRequired('Figshare owner institutional identifier is missing');
  const field = institutionalId ? 'institution_user_id' : 'email';
  const value = institutionalId || email;
  const candidates = [];
  for (let page = 1; ; page++) {
    const accounts = await client.searchInstitutionAccounts({ [field]: value, page, page_size: 100 });
    for (const account of accounts) {
      const actual = String(account[field] ?? '').trim();
      if ((field === 'email' ? actual.toLowerCase() : actual) === value) candidates.push(account);
    }
    if (accounts.length < 100) break;
    if (page === 10000) throw new FigshareRepairRequired('Owner search did not terminate');
  }
  if (candidates.length !== 1) throw new FigshareRepairRequired('Figshare owner lookup must match exactly one account');
  const match = candidates[0];
  if (institutionalId && email && match.email && match.email.toLowerCase() !== email) throw new FigshareRepairRequired('Conflicting Figshare owner identity evidence');
  if (!/^\d+$/.test(String(match.id))) throw new FigshareRepairRequired('Figshare owner account ID is invalid');
  return String(match.id); // Never user_id: that is the author identity.
}
export const provisionalTitle = (token: string): string => `ReDBox draft ${token}`;
export function newCreateOperation(binding: FigshareBinding): FigshareCreateOperation {
  return { token: randomUUID(), binding: { ...binding }, startedAt: new Date().toISOString(), outcome: 'submitted' };
}
export async function recoverCreate(client: FigshareClient, operation: FigshareCreateOperation): Promise<FigshareArticle | null> {
  if (!client.listArticles) throw new FigshareRepairRequired('Client cannot reconcile uncertain creation');
  const matches: FigshareArticle[] = [];
  for (let page = 1; ; page++) {
    const articles = await client.listArticles(page, 100);
    for (const candidate of articles) {
      if (candidate.title !== provisionalTitle(operation.token)) continue;
      const verified = await client.getArticle(String(candidate.id));
      if (verified.title === provisionalTitle(operation.token)) matches.push(verified);
    }
    if (articles.length < 100) break;
    if (page === 10000) throw new FigshareRepairRequired('Create reconciliation did not terminate');
  }
  if (matches.length > 1) throw new FigshareRepairRequired('Multiple articles match the exact create token');
  return matches[0] ?? null;
}
export function observedPublished(article: FigshareArticle): boolean {
  return article.is_public === true && typeof article.published_date === 'string' && article.published_date.length > 0;
}
export function isMissingArticle(error: unknown): boolean { return error instanceof FigshareHttpError && error.statusCode === 404; }
