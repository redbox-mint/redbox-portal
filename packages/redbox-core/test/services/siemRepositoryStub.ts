import { repositoryFixtures } from '../helpers/repositoryFixtures';
import * as sinon from 'sinon';
import * as persistence from '../../src/persistence/runtime';
import { repositoryFixtures as fixtures } from '../helpers/repositoryFixtures';
import type { SiemRepository } from '../../src/persistence/siem/SiemRepository';
/** Service behavior uses a plain repository fake; live tests inject the real Prisma owner. */
export function installSiemRepositoryStub(): void {
  sinon.stub(require('../../src/persistence/siem/runtime'), 'getSiemRepository').callsFake(() => fixtures.siem ?? {
    capture: async (row: unknown) => fixtures.SecurityEvent.create(row),
    findEvent: async (eventId: string, brandId: string) => fixtures.SecurityEvent.findOne({ eventId, brandId }),
    listEvents: async (where: object, skip: number, limit: number) => fixtures.SecurityEvent.find(where).sort('occurredAt DESC').skip(skip).limit(limit),
    countEvents: async (where: object) => fixtures.SecurityEvent.count(where),
    appendAttempt: async (row: unknown) => fixtures.SiemDeliveryAttempt.create(row),
    listAttempts: async (where: object, skip: number, limit: number) => fixtures.SiemDeliveryAttempt.find(where).sort('startedAt DESC').skip(skip).limit(limit),
    countAttempts: async (where: object) => fixtures.SiemDeliveryAttempt.count(where),
  } as SiemRepository);
}
