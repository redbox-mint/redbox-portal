/* Source-derived write/read/control inventory. Run from the repository root. */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const ts = require('typescript');
const base = 'a49366803164429f9d8bdd249dadcdf856c9d13e';
const out = 'support/specs/sails-retirement/evidence/final-review-r15/persistence-inventory.json';
const git = (...args) => cp.execFileSync('git', args, {encoding: 'utf8', maxBuffer: 24e6});
const tracked = git('ls-files').trim().split('\n');
const baselinePaths = new Set(git('ls-tree', '-r', '--name-only', base).trim().split('\n'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const baseText = file => baselinePaths.has(file) ? git('show', base + ':' + file) : null;
const mappings = new Map();
for(const line of git('diff','--name-status','--find-renames=40%',base+'...HEAD','--','packages/redbox-core/src','packages/sails-hook-redbox-storage-mongo/src').trim().split('\n')) {
  const [status,previous,current]=line.split('\t');
  if(status.startsWith('R')) mappings.set(current,previous);
}
for (const file of tracked.filter(f => /^packages\/redbox-core\/src\/services\/.*\.ts$/.test(f))) {
  const match = fs.readFileSync(file, 'utf8').match(/^export \* from ['"]([^'"]+)['"];\s*$/);
  if (match && baselinePaths.has(file)) mappings.set(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1])) + '.ts', file);
}
mappings.set('packages/redbox-core/src/authentication/Accounts.ts', 'packages/redbox-core/src/services/UsersService.ts');
mappings.set('packages/redbox-core/src/persistence/storage/PrismaAttachments.ts', 'packages/redbox-core/src/persistence/storage/PrismaAttachmentRepository.ts');
const scope = f => /^packages\/(?:redbox-core|sails-hook-redbox-storage-mongo)\/src\//.test(f);
const files = tracked.filter(f => scope(f) && /\.ts$/.test(f) && !/\/generated\/|\/storage-generated\/|\.d\.ts$/.test(f));
// Enumerate candidate calls broadly, then separate state sinks from in-memory
// mutators. Keeping exclusions makes the finite enumeration auditable.
const write = /^(?:create|insert|update|upsert|replace|remove|delete|save|write|persist|patch|mutate|mark|recordAccess|recordAudit|auditRecord|auditUser|setPassword|changePassword|replaceMemberships|addMembership|removeMembership|assignBrandRoles|rebindOid|prepareMutations|compareAndSwap|publish|restore|destroy|transition|migrate|setEntry|setBundle|addDatastream|streamFileToBucket|claim|complete|release|renew|acquire|append|increment|promote|setConfig|store|ensureRecordIdentity|put|bulkWrite|findOneAnd(?:Update|Replace|Delete))/i;
const memory = /^(?:set|map|array|fields|keys|values|entries|rules|roles|users|messages|warnings|errors|results|candidates|branches|clauses|rows|options|pending|active|tracked|seen|cache|locks|this\.(?:binaryActive|[A-Za-z]+(?:Promises|Timers|Dispatches|Intents|Scopes|Operations)))$/i;
function tree(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter({removeComments: true});
  const canonical = node => printer.printNode(ts.EmitHint.Unspecified, node, sf).replace(/\s+/g, ' ').trim();
  const methods = [];
  const calls = [];
  function visit(node, owner = '<module>') {
    if ((ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && node.body) {
      owner = node.name?.getText(sf) ?? '<anonymous>';
      methods.push({name: owner, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, tokens: canonical(node.body), start: node.getStart(sf), end: node.end});
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const name = node.expression.name.text;
      if (write.test(name)) {
        const receiver = node.expression.expression.getText(sf);
        const excluded = memory.test(receiver) || /^(?:_|Object|Reflect|JSON|Promise|fs|this\.input\.log|this\.log|sails\.log)$/.test(receiver);
        calls.push({method: owner, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1, receiver, operation: name,
          args: node.arguments.map(canonical), text: canonical(node), exclusion: excluded ? 'in-memory or local non-document operation' : null});
      }
    }
    ts.forEachChild(node, child => visit(child, owner));
  }
  visit(sf);
  return {methods, calls};
}
const inventory = [];
const controls = [];
const writes = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const previousFile = mappings.get(file) ?? file;
  const old = baseText(previousFile);
  const current = tree(file, text);
  const previous = old === null ? {methods: [], calls: []} : tree(previousFile, old);
  const methodRows = current.methods.map(method => {
    const before = previous.methods.find(m => m.name === method.name);
    const exact = before?.tokens === method.tokens;
    const row = {file, method: method.name, line: method.line, baseline: before ? {file: previousFile, line: before.line} : null,
      body: !before ? 'new-or-extracted' : exact ? 'unchanged-body-control' : 'changed-body', bodySha256: hash(method.tokens), baselineBodySha256: before ? hash(before.tokens) : null};
    if (exact) controls.push(row);
    return row;
  });
  for (const call of current.calls) {
    const method = methodRows.find(m => m.method === call.method);
    const candidates = previous.calls.filter(c => c.method === call.method && c.operation === call.operation);
    const sameArgs = candidates.find(c => JSON.stringify(c.args) === JSON.stringify(call.args));
    writes.push({id: 'PERSIST-' + String(writes.length+1).padStart(4, '0'), file, ...call, baseline: sameArgs ? {file:previousFile,line:sameArgs.line,receiver:sameArgs.receiver} : candidates.length ? {file:previousFile,candidateLines:candidates.map(c=>c.line)} : null,
      argumentComparison: sameArgs ? 'unchanged-argument-tokens' : candidates.length ? 'changed-arguments-review' : 'new-or-extracted-call',
      enclosingBody: method?.body ?? 'module-or-function-expression', disposition: call.exclusion ? 'excluded' : 'source-reviewed-write-candidate'});
  }
  inventory.push({file, baselineFile: old === null ? null : previousFile, sha256: hash(text), baselineSha256: old === null ? null : hash(old),
    fileState: old === text ? 'unchanged-file-control' : old === null ? 'new-or-extracted-file' : 'changed-or-moved-file', methods: methodRows});
}
const counts = rows => Object.fromEntries([...new Set(rows)].sort().map(k=>[k,rows.filter(x=>x===k).length]));
const contractFields=[];
for(const file of ['packages/redbox-core/src/persistence/prisma/generated/contract.json','packages/redbox-core/src/persistence/prisma/storage-generated/contract.json']) {
  const before=JSON.parse(baseText(file)),current=JSON.parse(fs.readFileSync(file,'utf8'));
  const models=value=>value.domain.namespaces.__unbound__.models;
  for(const [name,model] of Object.entries(models(current))) for(const [field,definition] of Object.entries(model.fields)) {
    const old=models(before)[name]?.fields[field];
    contractFields.push({file,model:name,field,definition,baselineDefinition:old??null,comparison:JSON.stringify(old)===JSON.stringify(definition)?'unchanged':'added-or-changed'});
  }
  for(const [name,model] of Object.entries(models(before))) for(const field of Object.keys(model.fields)) if(!models(current)[name]?.fields[field])throw Error('Removed field: '+name+'.'+field);
}
const defaultSources=tracked.filter(f=>/^packages\/redbox-core\/src\/persistence\//.test(f) && /\/(?:fields|physical|timestamps|fieldNormalization|attachmentFields|attachmentNormalization|attachmentValues|attachmentPhysical|auditFields|scalars|modelValues|modelRow)\.ts$/.test(f)).map(file=>({file,sha256:hash(fs.readFileSync(file)),baselineSha256:baseText(file)===null?null:hash(baseText(file)),comparison:fs.readFileSync(file,'utf8')===baseText(file)?'unchanged':'changed'}));
const result = {base, initialHead:'bda01cb2525ef31bdb1f449ddb7ea52e52deafb3', reviewedHead:git('rev-parse','HEAD').trim(), generatedAt:new Date().toISOString(),
  method: 'TypeScript AST, all tracked runtime files in the listed persistence/domain/HTTP/composition roots, including unchanged files and moved bodies. Candidate calls are a conservative superset, not a claim that each is a physical database dispatch. Caller and sink layers overlap. Argument-token equality is a static control, not an executed compatibility proof.',
  roots: ['packages/redbox-core/src/', 'packages/sails-hook-redbox-storage-mongo/src/'],
  counts:{files:inventory.length, fileStates:counts(inventory.map(x=>x.fileState)), methods:inventory.reduce((s,f)=>s+f.methods.length,0), methodStates:counts(inventory.flatMap(x=>x.methods.map(m=>m.body))), writeCandidates:writes.length, excludedCandidates:writes.filter(x=>x.exclusion).length, argumentStates:counts(writes.filter(x=>!x.exclusion).map(x=>x.argumentComparison))},
  movedFiles:Object.fromEntries(mappings), contractFields, defaultSources, files:inventory, writes, unchangedMethodControls:controls};
result.counts.contractFields=contractFields.length;
result.counts.contractFieldStates=counts(contractFields.map(f=>f.comparison));
result.counts.defaultSources=counts(defaultSources.map(f=>f.comparison));
fs.writeFileSync(out, JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.counts,null,2));
