import _ from 'lodash';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { FigshareClient } from './http';
import { AnyRecord } from './types';
import { evaluateBinding } from './bindings';

function isEmptyEmbargo(payload: AnyRecord): boolean {
  return _.every(Object.values(payload), (value: unknown) => _.isNil(value) || value === '');
}

function embargoChanged(payload: AnyRecord, article: AnyRecord): boolean {
  return (
    String(_.get(payload, 'access_type', '')) !== String(_.get(article, 'access_type', '')) ||
    String(_.get(payload, 'embargo_date', '')) !== String(_.get(article, 'embargo_date', '')) ||
    String(_.get(payload, 'embargo_reason', '')) !== String(_.get(article, 'embargo_reason', ''))
  );
}

export async function syncEmbargoPhase(client: FigshareClient, config: FigsharePublishingConfigData, record: AnyRecord, articleId: string): Promise<AnyRecord> {
  if (config.embargo.mode !== 'recordDriven') {
    return {};
  }

  const embargoPayload = {
    access_type: await evaluateBinding(config.embargo.accessRights.accessRights, record),
    embargo_date: await evaluateBinding(config.embargo.accessRights.fullEmbargoUntil, record),
    embargo_reason: await evaluateBinding(config.embargo.accessRights.reason, record)
  };

  const article = await client.getArticle(articleId);
  const emptyEmbargo = isEmptyEmbargo(embargoPayload);
  if (!config.embargo.forceSync && emptyEmbargo && _.get(article, 'is_embargoed', false) !== true) {
    return {};
  }

  if (emptyEmbargo) {
    return client.clearEmbargo(articleId);
  }

  if (!config.embargo.forceSync && !embargoChanged(embargoPayload, article)) {
    return {};
  }

  return client.setEmbargo(articleId, embargoPayload);
}
