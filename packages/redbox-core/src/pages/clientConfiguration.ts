import _ from 'lodash';

export interface ClientConfigurationInput {
  appUrl?: string;
  i18n?: { next?: { init?: object }; editor?: { allowedClasses?: unknown } };
  vocab?: { clientUri?: string; collectionUri?: string; userRootUri?: string };
  mint?: { mintRootUri?: string };
  startupMinute?: number;
  record?: { transfer?: { maxRecordsPerPage?: number }; search?: { maxRecordsPerPage?: number } };
  api?: { additionalClientConfig?: Record<string, unknown> };
}

/** Only these existing public client settings cross the server/browser boundary. */
export function clientConfiguration(
  config: ClientConfigurationInput,
  branding: string,
  portal: string,
  language: string
) {
  const i18NextOpts: Record<string, unknown> = _.cloneDeep({ ...config.i18n?.next?.init });
  delete i18NextOpts.backend;
  i18NextOpts.supportedLngs = [language];
  i18NextOpts.preload = [language];
  return _.merge(
    {
      baseUrl: config.appUrl,
      branding,
      portal,
      vocabRootUrl: config.vocab?.clientUri,
      collectionRootUri: config.vocab?.collectionUri,
      mintRootUri: config.mint?.mintRootUri,
      userRootUri: config.vocab?.userRootUri,
      translationVersion: config.startupMinute,
      maxTransferRowsPerPage: config.record?.transfer?.maxRecordsPerPage,
      maxSearchRowsPerPage: config.record?.search?.maxRecordsPerPage,
      i18NextOpts,
      translationEditor: { allowedClasses: config.i18n?.editor?.allowedClasses ?? {} },
      lang: language,
    },
    config.api?.additionalClientConfig ?? {}
  );
}
