// Comparison entrypoint retained for direct consumers; the owned runtime uses PrismaAttachments.
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { Services as Owned } from './PrismaAttachments';
import type { CorePrismaClient } from '../prisma/client';
import { sailsAttachmentAudit } from '../../compat/sails/attachmentAudits';
export namespace Services {
  export class PrismaAttachmentRepository extends Owned.PrismaAttachmentRepository {
    protected get logger() {
      return typeof sails === 'undefined' ? nothingLogger : sails.log;
    }
    public constructor(client: CorePrismaClient) {
      super(client, {
        log: { error: message => instance.logger.error(message) },
        emitAccessEvent: event =>
          typeof sails === 'undefined' ? Promise.resolve() : sailsAttachmentAudit(sails).emitAccessEvent!(event),
        retainFollowup: work =>
          typeof sails === 'undefined' ? work : sailsAttachmentAudit(sails).retainFollowup!(work),
      });
      const instance = this;
    }
  }
}
