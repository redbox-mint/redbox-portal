(function () {
  function renderRedoc() {
    var mount = document.getElementById('redoc');
    if (!mount || typeof Redoc === 'undefined') {
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderRedoc, { once: true });
    return;
  }

  renderRedoc();
})();
