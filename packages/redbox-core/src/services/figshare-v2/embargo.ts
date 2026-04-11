import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { FigshareClient } from './http';
import { RecordModel, FigshareArticle } from './types';
import { evaluateBinding } from './bindings';

interface EmbargoPayload {
  [key: string]: unknown;
  access_type: unknown;
  embargo_date: unknown;
  embargo_reason: unknown;
}

function isEmptyEmbargo(payload: EmbargoPayload): boolean {
  return Object.values(payload).every((value) => value == null || value === '');
}

function embargoChanged(payload: EmbargoPayload, article: FigshareArticle): boolean {
  return (
    String(payload.access_type ?? '') !== String(article.access_type ?? '') ||
    String(payload.embargo_date ?? '') !== String(article.embargo_date ?? '') ||
    String(payload.embargo_reason ?? '') !== String(article.embargo_reason ?? '')
  );
}

export async function syncEmbargoPhase(client: FigshareClient, config: FigsharePublishingConfigData, record: RecordModel, articleId: string): Promise<Record<string, unknown>> {
  if (config.embargo.mode !== 'recordDriven') {
    return {};
  }

  const recordData = record as Record<string, unknown>;
  const embargoPayload: EmbargoPayload = {
    access_type: await evaluateBinding(config.embargo.accessRights.accessRights, recordData),
    embargo_date: await evaluateBinding(config.embargo.accessRights.fullEmbargoUntil, recordData),
    embargo_reason: await evaluateBinding(config.embargo.accessRights.reason, recordData)
  };

  const article = await client.getArticle(articleId);
  const emptyEmbargo = isEmptyEmbargo(embargoPayload);
  if (!config.embargo.forceSync && emptyEmbargo && article.is_embargoed !== true) {
    return {};
  }

  if (emptyEmbargo) {
    return client.clearEmbargo(articleId);
  }

  if (!config.embargo.forceSync && !embargoChanged(embargoPayload, article)) {
    return {};
  }

  return client.setEmbargo(articleId, embargoPayload as Record<string, unknown>);
}
