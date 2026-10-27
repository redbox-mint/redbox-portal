// Build-time assembly only. The runtime resolves the installed artifact roots.
const { cp, mkdir, rm, stat, realpath } = require('node:fs/promises');
const { resolve, join, relative, sep } = require('node:path');
async function main() {
  if (process.argv.length !== 5)
    throw Error('Usage: package-pages.cjs <views-root> <compiled-public-root> <destination>');
  const [views, assets, destination] = process.argv.slice(2).map(value => resolve(value));
  if (!views || !assets || !destination || destination === views || destination === assets)
    throw Error('Usage: package-pages.cjs <views-root> <compiled-public-root> <destination>');
  for (const source of [views, assets]) {
    if (!(await stat(source)).isDirectory()) throw Error('Page artifact source is not a directory.');
    if (source.startsWith(destination + '/') || destination.startsWith(source + '/'))
      throw Error('Page artifact destination must be separate from its sources.');
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const [source, kind] of [
    [views, 'views'],
    [assets, 'assets'],
  ]) {
    const realRoot = await realpath(source);
    await cp(source, join(destination, kind), {
      recursive: true,
      dereference: true,
      filter: async file => {
        const name = relative(source, file);
        return (
          !name.split(sep).some(part => part.startsWith('.')) &&
          (file === source || (await realpath(file)).startsWith(realRoot + sep))
        );
      },
    });
  }
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
