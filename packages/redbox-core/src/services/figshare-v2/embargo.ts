import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { FigshareClient } from './http';
import { RecordModel, FigshareArticle, FigshareEmbargoPayload, FigshareEmbargoType } from './types';
import { evaluateBinding } from './bindings';
import { createBindingContext } from './context';

function hasActiveEmbargo(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized !== '' && normalized !== 'false' && normalized !== '0';
  }
  return value != null && value !== '' && value !== false && value !== 0;
}

function normalizeEmbargoType(value: unknown): FigshareEmbargoType {
  const normalized = String(value ?? 'article').trim().toLowerCase();
  if (normalized === 'article' || normalized === 'file') {
    return normalized;
  }
  throw new Error(`Figshare embargo type must be 'article' or 'file', received '${String(value ?? '')}'`);
}

function embargoChanged(payload: FigshareEmbargoPayload, article: FigshareArticle): boolean {
  return (
    article.is_embargoed !== true ||
    payload.embargo_type !== String(article.embargo_type ?? '') ||
    String(payload.embargo_date ?? '') !== String(article.embargo_date ?? '') ||
    String(payload.embargo_reason ?? '') !== String(article.embargo_reason ?? '')
  );
}

export async function syncEmbargoPhase(client: FigshareClient, config: FigsharePublishingConfigData, record: RecordModel, articleId: string): Promise<Record<string, unknown>> {
  if (config.embargo.mode !== 'recordDriven') {
    return {};
  }

  const recordData = record as Record<string, unknown>;
  const bindingContext = createBindingContext(record);
  const accessRights = await evaluateBinding(config.embargo.accessRights.accessRights, recordData, bindingContext);
  const activeEmbargo = hasActiveEmbargo(accessRights);
  const article = await client.getArticle(articleId);

  if (!config.embargo.forceSync && !activeEmbargo && article.is_embargoed !== true) {
    return {};
  }

  if (!activeEmbargo) {
    return client.clearEmbargo(articleId);
  }

  const embargoPayload: FigshareEmbargoPayload = {
    is_embargoed: true,
    embargo_type: normalizeEmbargoType(
      await evaluateBinding(config.embargo.accessRights.embargoType, recordData, bindingContext)
    ),
    embargo_date: await evaluateBinding(config.embargo.accessRights.fullEmbargoUntil, recordData, bindingContext),
    embargo_reason: await evaluateBinding(config.embargo.accessRights.reason, recordData, bindingContext)
  };

  if (!config.embargo.forceSync && !embargoChanged(embargoPayload, article)) {
    return {};
  }

  return client.setEmbargo(articleId, embargoPayload);
}
