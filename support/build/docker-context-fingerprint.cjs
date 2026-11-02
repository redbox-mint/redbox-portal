// Inventory the local Docker context without Docker or npm dependencies. Match
// Docker's root-relative patterns (including parent directories), ** and ordered
// negations. Hash modes and symlink targets too; deliberately ignore mtimes.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const sha = value => createHash('sha256').update(value).digest('hex');

function glob(pattern) {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '*' && pattern[i + 1] === '*') {
      i++;
      if (pattern[i + 1] === '/') { i++; source += '(?:.*/)?'; }
      else source += '.*';
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else if (char === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end < 0) throw new Error(`Invalid Docker ignore pattern: ${pattern}`);
      source += pattern.slice(i, end + 1).replace(/^\[!/, '[^'); i = end;
    } else if (char === '\\') {
      if (++i === pattern.length) throw new Error('Trailing Docker ignore escape');
      source += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}(?:/.*)?$`);
}

function rules(text) {
  return text.replace(/^\uFEFF/, '').split(/\r?\n/).flatMap(line => {
    if (line.startsWith('#') || !line.trim()) return [];
    let pattern = line.trim();
    const include = pattern.startsWith('!');
    if (include) pattern = pattern.slice(1).trim();
    pattern = path.posix.normalize(pattern).replace(/^\/+|\/+$/g, '');
    if (pattern === '.') return [];
    return [{ pattern, include, match: glob(pattern) }];
  });
}

function inventory(root) {
  const ignoreFile = fs.existsSync(path.join(root, 'Dockerfile.dockerignore')) ? 'Dockerfile.dockerignore' : '.dockerignore';
  const ignores = fs.existsSync(path.join(root, ignoreFile)) ? rules(fs.readFileSync(path.join(root, ignoreFile), 'utf8')) : [];
  const rows = [];
  function walk(relative = '') {
    for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
      const file = relative ? `${relative}/${name}` : name;
      let excluded = false;
      for (const rule of ignores) if (rule.match.test(file)) excluded = !rule.include;
      const stat = fs.lstatSync(path.join(root, file));
      // Docker consumes these control files even when ignore rules exclude them.
      if (!excluded || file === 'Dockerfile' || file === ignoreFile) {
        const type = stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'dir' : 'file';
        const content = type === 'file' ? sha(fs.readFileSync(path.join(root, file))) : type === 'link' ? fs.readlinkSync(path.join(root, file)) : '';
        rows.push([file, type, (stat.mode & 0o7777).toString(8), content]);
      }
      // Do not descend excluded node_modules/.git, but permit negations below
      // an excluded directory, including patterns with wildcard ancestors.
      if (stat.isDirectory() && (!excluded || ignores.some(rule => rule.include &&
        (() => {
          const prefix = rule.pattern.split(/[*?[]/, 1)[0];
          return prefix.startsWith(`${file}/`) || file.startsWith(prefix);
        })()))) walk(file);
    }
  }
  walk();
  return rows.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
}

function fingerprint(root, output) {
  const rows = inventory(root);
  const manifest = rows.map(row => JSON.stringify(row)).join('\n') + '\n';
  if (output) {
    if (path.resolve(output) === path.resolve(root) || path.resolve(output).startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Context inventory must be outside the checkout');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'inventory.jsonl'), manifest);
    const status = spawnSync('git', ['status', '--short', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
    if (status.status === 0) {
      fs.writeFileSync(path.join(output, 'checkout-status.txt'), status.stdout);
      console.log(`Checkout changes before Docker (including ignored-by-Docker paths):\n${status.stdout || '<none>'}`);
    }
  }
  const value = sha(manifest);
  console.log(`Docker context fingerprint: sha256:${value}; entries=${rows.length}; inventory=${output || '<none>'}`);
  return value;
}
module.exports = { inventory, fingerprint, rules };
if (require.main === module) fingerprint(process.argv[2] || '.', process.argv[3]);
