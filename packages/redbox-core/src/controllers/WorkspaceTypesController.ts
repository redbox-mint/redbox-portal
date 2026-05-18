import { Controllers as controllers } from '../CoreController';
import { BrandingModel } from '../index';
import { promises as fsp } from 'fs';
import * as path from 'path';


export namespace Controllers {
  /**
   * WorkspaceType related methods
   *
   * Author: <a href='https://github.com/moisbo' target='_blank'>moisbo</a>
   */
  export class WorkspaceTypes extends controllers.Core.Controller {

    protected override _exportedMethods: string[] = [
      'init',
      'get',
      'getOne',
      'uploadLogo',
      'renderImage'
    ];

    public init() {
      return;
    }

    public bootstrap() {
    }

    private getDefaultLogoPath(): string {
      return path.resolve(sails.config.appPath, 'assets/images', sails.config.static_assets.logoName);
    }

    private resolveLocalAssetPath(logo: string): string | null {
      const assetsRoot = path.resolve(sails.config.appPath, 'assets');
      const logoPath = path.resolve(path.join(sails.config.appPath, logo.replace(/^\//, '')));
      const relativeLogoPath = path.relative(assetsRoot, logoPath);

      if (relativeLogoPath.startsWith('..') || path.isAbsolute(relativeLogoPath)) {
        return null;
      }

      return logoPath;
    }

    public get(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
      return WorkspaceTypesService.get(brand).subscribe((response: unknown[]) => {
        let workspaceTypes: unknown[] = [];
        if (response) {
          workspaceTypes = response.slice();
        }
        this.sendResp(req, res, { data: { status: true, workspaceTypes: workspaceTypes }, headers: this.getNoCacheHeaders() });
      }, (error: unknown) => {
        const errorMessage = 'Cannot get workspace types';
        const payload = errorMessage ?? { status: false, message: error };
        this.sendResp(req, res, { data: payload, headers: this.getNoCacheHeaders() });
      });
    }

    public getOne(req: Sails.Req, res: Sails.Res) {
      const name = req.param('name');
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
      return WorkspaceTypesService.getOne(brand, name)
        .subscribe((response: unknown) => {
          let workspaceType = null;
          if (response) {
            workspaceType = response;
          }
          this.sendResp(req, res, { data: { status: true, workspaceType: workspaceType }, headers: this.getNoCacheHeaders() });
        }, (error: unknown) => {
          const errorMessage = 'Cannot get workspace types';
          const payload = errorMessage ?? { status: false, message: error };
          this.sendResp(req, res, { data: payload, headers: this.getNoCacheHeaders() });
        });
    }

    //May be irrelevant because the logo upload should be done at bootstrap.
    public async uploadLogo(req: Sails.Req, res: Sails.Res) {
      try {
        const workspaceTypeName = String(req.param('workspaceType') || req.param('name') || '').trim();
        if (!workspaceTypeName) {
          return this.sendResp(req, res, { data: { status: false, message: 'workspaceType missing' }, headers: this.getNoCacheHeaders() });
        }

        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        const workspaceType = await WorkspaceType.findOne({ branding: brand.id, name: workspaceTypeName });
        if (!workspaceType) {
          return this.sendResp(req, res, { data: { status: false, message: 'workspaceType not found' }, headers: this.getNoCacheHeaders() });
        }

        const fileUploader = req.file as (name: string) => { upload: (cb: (err: unknown, files: Array<{ fd: string; type?: string }>) => void) => void };
        const files = await new Promise<Array<{ fd: string; type?: string }>>((resolve, reject) => {
          fileUploader('logo').upload((err, uploadedFiles) => err ? reject(err) : resolve(uploadedFiles));
        });

        if (!files.length) {
          return this.sendResp(req, res, { data: { status: false, message: 'no logo uploaded' }, headers: this.getNoCacheHeaders() });
        }

        const file = files[0];
        const buffer = await fsp.readFile(file.fd);
        const contentType = file.type || 'application/octet-stream';
        const ext = contentType === 'image/png'
          ? 'png'
          : contentType === 'image/jpeg'
            ? 'jpg'
            : contentType === 'image/svg+xml'
              ? 'svg'
              : path.extname(file.fd).replace(/^\./, '') || 'bin';
        const storageKey = `workspace-types/${brand.id}/${workspaceTypeName}/logo.${ext}`;
        await StorageManagerService.primaryDisk().put(storageKey, buffer, { contentType });
        await WorkspaceType.update({ id: workspaceType.id }, { logo: storageKey });
        try {
          await fsp.unlink(file.fd);
        } catch (cleanupErr) {
          sails.log.warn('WorkspaceTypesController.uploadLogo failed to remove temporary upload', cleanupErr);
        }

        return this.sendResp(req, res, { data: { status: true, storageKey }, headers: this.getNoCacheHeaders() });
      } catch (err) {
        sails.log.error('WorkspaceTypesController.uploadLogo failed', err ?? 'Unknown error');
        return this.sendResp(req, res, {
          data: { status: false, message: 'Internal server error' },
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public renderImage(req: Sails.Req, res: Sails.Res) {
      const type = req.param('workspaceType');
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
      return WorkspaceTypesService.getOne(brand, type).subscribe(async (response: unknown) => {
        const workspaceType = response as globalThis.Record<string, unknown> | null;
        const logo = typeof workspaceType?.logo === 'string' ? workspaceType.logo : '';

        if (!logo) {
          return res.sendFile(this.getDefaultLogoPath());
        }

        if (logo.startsWith('/assets/') || logo.startsWith('assets/')) {
          const logoPath = this.resolveLocalAssetPath(logo);
          if (!logoPath) {
            sails.log.warn('WorkspaceTypesController.renderImage rejected an out-of-bounds asset path. Sending default image instead.', logo);
            return res.sendFile(this.getDefaultLogoPath());
          }
          return res.sendFile(logoPath);
        }

        try {
          const primaryDisk = StorageManagerService.primaryDisk();
          const [bytes, metadata] = await Promise.all([
            primaryDisk.getBytes(logo),
            primaryDisk.getMetaData(logo).catch(() => null),
          ]);
          res.contentType(metadata?.contentType || sails.config.static_assets.imageType);
          return res.send(Buffer.from(bytes));
        } catch (_error) {
          sails.log.warn(
            'WorkspaceTypesController.renderImage failed to load a workspace logo. Sending default image instead.',
            _error instanceof Error ? (_error.stack ?? _error.message) : _error,
          );
          return res.sendFile(this.getDefaultLogoPath());
        }
      });
    }
  }
}
