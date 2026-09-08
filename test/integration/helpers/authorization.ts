import {
  acquireMigrationLease,
  type MigrationLeaseHandle,
} from '../../../packages/redbox-core/src/services/AuthorizationMigrationService';

export async function withMigrationLease<T>(work: (lease: MigrationLeaseHandle) => Promise<T>): Promise<T> {
  const lease = await acquireMigrationLease();
  try {
    return await work(lease);
  } finally {
    await lease.release();
  }
}

export async function adminMutationOptions() {
  const brand = BrandingService.getDefault();
  const admin = await User.findOne({ username: 'admin' });
  return {
    brandId: String(brand.id),
    actorContext: await AuthorizationService.resolveUserContext(admin.id, brand.id, 'session'),
  };
}
