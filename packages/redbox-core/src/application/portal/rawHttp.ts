import { Services as Logos } from '../../branding/BrandingLogo';
import * as persistence from '../../persistence/runtime';
import { getBrandingRepository } from '../../persistence/branding/runtime';
import { firstValueFrom } from 'rxjs';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { ResumableUploads } from '../../http/actions/resumableUploads';
import type { Server } from 'node:http';
import type { ApplicationModule } from '../Application';
import type { PortalApplicationContext } from './application';
import { StreamingMultipart } from '../../http/integrations/multipart';
import { ProgressSockets, progressSocketPath, type ProgressCredential } from '../../http/integrations/progressSockets';
import type { AuthenticatedActor } from '../../authentication/HttpIdentity';
import { CompanionUploads, companionOptions } from '../../http/integrations/companion/uploads';

// Companion's Express adapter stays behind the private production integration seam.
const companions = new WeakMap<PortalRawHttp, CompanionUploads>();
/** Private Companion borrowing seam. @preCutover */
export const portalCompanion = (raw: PortalRawHttp | undefined): CompanionUploads | undefined =>
  raw && companions.get(raw);

/** Selected raw transports borrow the production domains and the host's one server. */
export class PortalRawHttp implements ApplicationModule {
  multipart!: StreamingMultipart;
  sockets!: ProgressSockets;
  resumable!: ResumableUploads;
  logos!: Logos.BrandingLogo;
  private isReady = () => false;
  private authenticate?: (credential: ProgressCredential) => Promise<AuthenticatedActor | false>;
  constructor(
    private readonly portal: PortalApplicationContext,
    readonly upload: boolean,
    readonly progress: boolean,
    readonly tus: boolean,
    readonly brandingUpload: boolean
  ) {}
  async initialize(): Promise<void> {
    const { data, config, owner } = this.portal;
    if (this.upload)
      this.multipart = new StreamingMultipart(data.disks.get().stagingDisk(), {
        files: 100,
        fileSize: config.record.maxUploadSize,
        fields: 100,
        fieldSize: 1024 * 1024,
      });
    if (this.brandingUpload)
      this.logos = new Logos.BrandingLogo({
        repository: getBrandingRepository(owner),
        disk: () => data.disks.get().primaryDisk(),
        legacyDatabase: () => persistence.mongoDatabase(owner, 'mongodb'),
        sanitize: (...args) => data.reference.sanitizer.get().sanitize(...args),
        config: config.branding,
        log: this.portal.log,
      });
    if (this.tus) {
      const stagingConfiguration = data.disks.get().getStagingDiskConfig();
      this.resumable = new ResumableUploads({
        disk: data.disks.get().stagingDisk(),
        records: data.records.get(),
        maxSize: config.record.maxUploadSize,
        origins: [new URL(config.server.publicUrl).origin],
        rootContext: config.server.rootContext,
        log: this.portal.log,
        ...(stagingConfiguration.driver === 'fs'
          ? {
              stagingFilesystem: {
                root: stagingConfiguration.config.root,
                reserveBytes: config.record.diskSpaceThreshold,
              },
            }
          : {}),
        authorizePending: async context => {
          if (!context.actor) return false;
          const brand = Object.assign(new BrandingModel(), context.brand);
          const types = await firstValueFrom(data.reference.types.get().getAll(brand));
          for (const type of types) {
            const step = await firstValueFrom(data.reference.workflows.get().getFirst(type));
            if (
              step &&
              (await data.records.get().hasCreateAccess(
                brand,
                { ...context.actor },
                context.actor.roles.map(role => ({ ...role })),
                type.packageType,
                step.name
              ))
            )
              return true;
          }
          return false;
        },
        audit: (actor, action, context) => data.users.get().addUserAuditEvent({ ...actor }, action, context),
      });
    }
    if (this.progress)
      this.sockets = new ProgressSockets({
        owner,
        path: config.server.rootContext + progressSocketPath,
        origins: [new URL(config.server.publicUrl).origin],
        records: data.records.get(),
        progress: data.progress.get(),
        authenticate: credential => {
          if (!this.authenticate) throw new Error('HTTP authentication is not prepared.');
          return this.authenticate(credential);
        },
      });
    if (config.companion.enabled)
      companions.set(
        this,
        new CompanionUploads({
          owner,
          path: config.companion.route,
          origins: [new URL(config.server.publicUrl).origin],
          isReady: () => this.isReady(),
          options: companionOptions(config.companion, config.server.rootContext),
        })
      );
  }
  uploadInput() {
    if (!this.upload || !this.multipart)
      throw new TypeError('Raw upload inputs require the prepared production owner.');
    return {
      records: this.portal.data.records.get(),
      datastream: this.portal.data.datastream.get(),
      log: this.portal.log,
      multipart: this.multipart,
    };
  }
  bindAuthentication(authenticate: NonNullable<PortalRawHttp['authenticate']>): void {
    this.authenticate = authenticate;
  }
  async prepare(server: Server, isReady: () => boolean): Promise<void> {
    this.isReady = isReady;
    if (this.progress) this.sockets.attach(server, { borrowedServer: true });
    await companions.get(this)?.initialize(server, { borrowedLifecycle: true });
  }
  quiesce(): void {
    this.multipart?.quiesce();
    this.resumable?.quiesce();
    this.logos?.quiesce();
    this.sockets?.quiesce();
    companions.get(this)?.quiesce();
  }
  async drain(options: { deadline?: number } = {}): Promise<void> {
    await Promise.all([
      this.multipart?.drain(),
      this.resumable?.drain(),
      this.sockets?.drain(),
      companions.get(this)?.drain(options),
    ]);
  }
  async close(): Promise<void> {
    await this.multipart?.close();
    await this.resumable?.close();
    await this.logos?.close();
    await this.sockets?.close();
    await companions.get(this)?.close();
  }
}
