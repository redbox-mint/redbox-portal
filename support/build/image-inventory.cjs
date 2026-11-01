// Run inside an image. Record regular files and symlinks without following links.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
async function walk(directory) {
  for (const name of fs.readdirSync(directory).sort()) {
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    if (stat.isDirectory()) await walk(file);
    else if (stat.isSymbolicLink()) console.log(JSON.stringify([file, 'symlink', fs.readlinkSync(file)]));
    else if (stat.isFile()) {
      const hash = crypto.createHash('sha256');
      for await (const data of fs.createReadStream(file)) hash.update(data);
      console.log(JSON.stringify([file, stat.size, hash.digest('hex')]));
    } else throw new Error(`Unsupported inventory entry: ${file}`);
  }
}
walk('/opt/redbox-portal').catch(error => { console.error(error); process.exitCode = 1; });
