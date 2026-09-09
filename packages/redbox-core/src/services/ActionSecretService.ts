import { Services as Core } from '../CoreService';
import {
  RedboxActionRegistry,
  type ActionSecretSlotAccess,
  type ActionSecretWriteRequest,
  type ActionSecretReplaceRequest,
  type ActionSecretWriteResult,
} from '../action-registry';
import { coreRecordActionRegistry } from './record-actions/coordinator';
import { persistedRecordActionSecretProvider } from './action-secrets/storage';

export interface ActionSecretServiceExports {
  write(request: ActionSecretWriteRequest): Promise<ActionSecretWriteResult>;
  replace(request: ActionSecretReplaceRequest): Promise<void>;
  clear(request: ActionSecretSlotAccess): Promise<void>;
  isConfigured(request: ActionSecretSlotAccess): Promise<boolean>;
}

export namespace Services {
  /** Server-only administration boundary. Callers supply an authenticated, authorized brand.
   * B09 owns HTTP authorization; no route or plaintext read method is exposed here.
   */
  export class ActionSecrets extends Core.Core.Service implements ActionSecretServiceExports {
    protected override _exportedMethods = ['write', 'replace', 'clear', 'isConfigured'];
    private provider() {
      const configured = (sails.config as object as { actionRegistry?: RedboxActionRegistry }).actionRegistry;
      return persistedRecordActionSecretProvider(
        configured instanceof RedboxActionRegistry ? configured : coreRecordActionRegistry()
      );
    }
    public write(request: ActionSecretWriteRequest): Promise<ActionSecretWriteResult> {
      return this.provider().write(request);
    }
    public replace(request: ActionSecretReplaceRequest): Promise<void> {
      return this.provider().replace(request);
    }
    public clear(request: ActionSecretSlotAccess): Promise<void> {
      return this.provider().clear(request);
    }
    public isConfigured(request: ActionSecretSlotAccess): Promise<boolean> {
      return this.provider().isConfigured(request);
    }
  }
}
