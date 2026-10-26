export type {
  CompanionConfig,
  CompanionServerConfig,
  CompanionProviderCredentials,
  CompanionProviderOptions,
} from './companionDefaults';
import { resolveCompanionConfiguration } from './companionDefaults';

/** Temporary comparison adapter for the documented legacy UPPY environment. */
export const companion = resolveCompanionConfiguration(process.env, message => console.warn(message));
