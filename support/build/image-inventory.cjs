// Run inside an image. Include metadata and directories without following links.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
async function walk(directory) {
  const directoryStat = fs.lstatSync(directory);
  console.log(JSON.stringify([directory, 'directory', directoryStat.mode & 0o7777, directoryStat.uid, directoryStat.gid]));
  for (const name of fs.readdirSync(directory).sort()) {
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    if (stat.isDirectory()) await walk(file);
    else if (stat.isSymbolicLink()) console.log(JSON.stringify([file, 'symlink', stat.mode & 0o7777, stat.uid, stat.gid, fs.readlinkSync(file)]));
    else if (stat.isFile()) {
      const hash = crypto.createHash('sha256');
      for await (const data of fs.createReadStream(file)) hash.update(data);
      console.log(JSON.stringify([file, 'file', stat.mode & 0o7777, stat.uid, stat.gid, stat.size, hash.digest('hex')]));
    } else throw new Error(`Unsupported inventory entry: ${file}`);
  }
}
module.exports = { walk };
if (require.main === module) walk('/opt/redbox-portal').catch(error => { console.error(error); process.exitCode = 1; });
