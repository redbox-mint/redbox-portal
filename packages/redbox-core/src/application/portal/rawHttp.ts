import type { Server } from 'node:http';
import type { ApplicationModule } from '../Application';
import type { PortalApplicationContext } from './application';
import { StreamingMultipart } from '../../http/express/multipart';
import { ProgressSockets, type ProgressCredential } from '../../http/express/progressSockets';
import type { AuthenticatedActor } from '../../http/express/identity';

/** Selected raw transports borrow the production domains and the host's one server. */
export class PortalRawHttp implements ApplicationModule {
  multipart!: StreamingMultipart;
  sockets!: ProgressSockets;
  private authenticate?: (credential: ProgressCredential) => Promise<AuthenticatedActor | false>;
  constructor(
    private readonly portal: PortalApplicationContext,
    readonly upload: boolean,
    readonly progress: boolean
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
    if (this.progress)
      this.sockets = new ProgressSockets({
        owner,
        path: config.server.rootContext + '/portal-socket.io',
        origins: [new URL(config.server.publicUrl).origin],
        records: data.records.get(),
        progress: data.progress.get(),
        authenticate: credential => {
          if (!this.authenticate) throw new Error('HTTP authentication is not prepared.');
          return this.authenticate(credential);
        },
      });
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
  prepare(server: Server): void {
    if (this.progress) this.sockets.attach(server, { borrowedServer: true });
  }
  quiesce(): void {
    this.multipart?.quiesce();
    this.sockets?.quiesce();
  }
  async drain(): Promise<void> {
    await this.multipart?.drain();
    await this.sockets?.drain();
  }
  async close(): Promise<void> {
    await this.multipart?.close();
    await this.sockets?.close();
  }
}
