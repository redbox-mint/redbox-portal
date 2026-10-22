// Redoc 3 ships its standalone bundle as an ES module, so this bootstrap is
// loaded with type="module" and imports `init` instead of using a global.
import { init } from './redoc.standalone.js';

var mount = document.getElementById('redoc');

if (mount) {
  init(
    mount.getAttribute('data-openapi-url'),
    {
      disableTelemetry: true,
      hideDownloadButtons: true,
      scrollYOffset: 72
    },
    mount
  );
}
