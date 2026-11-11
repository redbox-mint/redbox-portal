/**
 * Type-only bridge for the admin-design base, which has no GraphQL implementation.
 * Public execute signature, ReadCaller and response copied from parent 570c34d28:
 * services/RecordGraphqlService.ts and record-graphql/read-record.ts.
 * When combined with the parent, module resolution selects its actual .ts class.
 * This file provides no runtime implementation, shim or alternative endpoint.
 */
import type { BrandingModel } from '../model/storage/BrandingModel';
import type { ContractJsonObject } from '../record-contract/types';
export namespace Services {
  interface RecordGraphql {
    describeReadSchema(caller: Parameters<RecordGraphql['execute']>[0]): Promise<string>;
    execute(
      caller: {
        readonly brand: BrandingModel;
        readonly portal: string;
        readonly user: Record<string, unknown>;
        readonly roles: object[];
      },
      body: unknown
    ): Promise<{ readonly status: number; readonly data: ContractJsonObject }>;
  }
}
