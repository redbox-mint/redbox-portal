import { createHash } from 'node:crypto';
import { PathRules } from '../../../src/authorization/PathRules';
import type { mongoFixture } from '../mongoFixture';
type Mongo = Awaited<ReturnType<typeof mongoFixture>>;
export async function productionActors(mongo: Mongo, openPaths = false) {
  const hash = (token: string) => createHash('sha256').update(token).digest('base64');
  const role = await mongo.identities.create('role', { name: 'Admin', branding: mongo.otherBrand.id });
  await mongo.identities.create('user', {
    username: 'foreign',
    name: 'Foreign',
    email: 'foreign@example.invalid',
    type: 'local',
    token: hash('foreign-token'),
    roles: [role.id],
  });
  await mongo.identities.create('user', {
    username: 'wrong-role',
    name: 'Reader',
    email: 'reader@example.invalid',
    type: 'local',
    token: hash('wrong-role-token'),
    roles: [mongo.reader.id],
  });
  await mongo.identities.create('pathrule', {
    path: '/:branding/:portal(/*)',
    role: mongo.role.id,
    branding: mongo.brand.id,
    can_read: true,
  });
  const rules = new PathRules(() =>
    openPaths ? Promise.resolve([]) : mongo.identities.list('pathrule', {}, { populate: ['role', 'branding'] })
  );
  await rules.loadRules();
  return rules;
}
