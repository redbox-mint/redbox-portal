import { Controllers as controllers } from '../CoreController';

const redocBundlePath = require.resolve('redoc/bundles/redoc.standalone.js');

export namespace Controllers {
    export class RedocAsset extends controllers.Core.Controller {
        protected override _exportedMethods: string[] = [
            'asset',
        ];

        public asset(req: Sails.Req, res: Sails.Res): void {
            const asset = String(req.param('asset') ?? '').trim();

            if (asset === 'redoc.standalone.js') {
                res.type('application/javascript');
                res.set('Cache-Control', 'public, max-age=3600');
                res.sendFile(redocBundlePath);
                return;
            }

            if (asset === 'admin-api-docs-init.js') {
                res.type('application/javascript');
                res.send('window.SC_DISABLE_SPEEDY = true;');
                return;
            }

            if (asset === 'admin-api-docs-bootstrap.js') {
                res.type('application/javascript');
                res.send(`(function () {
  if (typeof Redoc === 'undefined') {
    return;
  }

  var mount = document.getElementById('redoc');
  if (!mount) {
    return;
  }

  Redoc.init(
    mount.getAttribute('data-openapi-url'),
    {
      hideDownloadButton: true,
      hideHostname: false,
      pathInMiddlePanel: true,
      scrollYOffset: 72
    },
    mount
  );
})();`);
                return;
            }

            res.notFound({ asset }, '404');
        }
    }
}
