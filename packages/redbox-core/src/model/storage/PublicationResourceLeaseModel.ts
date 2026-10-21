import type { PublicationOperation, PublicationWorkKey } from '../../services/publication/contracts';
import type { PublicationLease } from '../../services/publication/ownership';

export interface PublicationResourceKey {
  providerId: string;
  namespace: string;
  resourceKey: string;
}
export interface PublicationResourceLeaseModel extends PublicationResourceKey {
  schemaVersion: 1;
  revision: number;
  lease: (PublicationLease & { brandId: string }) | null;
  operations: Array<{ work: PublicationWorkKey; operation: PublicationOperation }>;
}
