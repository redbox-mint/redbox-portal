// Give the server-rendered admin shell and reference loading state a paint before
// parsing the reference renderer. Two animation frames cross a paint boundary;
// loading starts immediately afterwards, independent of user interaction.
requestAnimationFrame(() => {
  requestAnimationFrame(() => import('./admin-api-docs-bootstrap.js'));
});
