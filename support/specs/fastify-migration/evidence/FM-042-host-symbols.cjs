'use strict';
// TypeScript's export/symbol graph is the authority. There is deliberately no
// list of Express class/function names: new exports and aliases are discovered.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../../../..');
const ts = require(path.join(root, 'packages/redbox-core/node_modules/typescript'));
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const git = args => execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
const files = [...new Set([...git(['ls-files','-z']).split('\0'), ...git(['ls-files','--others','--exclude-standard','-z']).split('\0')])]
  .filter(f => f && fs.existsSync(path.join(root,f))).sort();
const testFiles = files.filter(f => /(?:^|\/)(?:test|tests|fixtures)(?:\/|$)/.test(f) && /\.[cm]?[jt]sx?(?:\.fixture)?$/.test(f));
const expressFiles = files.filter(f => f.startsWith('packages/redbox-core/src/http/express/') && f.endsWith('.ts'));
const privateFiles = [...['application','host','http'].map(f => 'packages/redbox-core/src/application/portal/' + f + '.ts'), 'packages/redbox-core/src/extensions/composition.ts'];
function scan({baseline = false, probes = {}, onlyProbes = false} = {}) {
  const options = {target:ts.ScriptTarget.ESNext, module:ts.ModuleKind.CommonJS,
    moduleResolution:ts.ModuleResolutionKind.Node10, allowJs:true, allowNonTsExtensions:true, skipLibCheck:true,
    esModuleInterop:true, noEmit:true, types:[], maxNodeModuleJsDepth:0};
  const host = ts.createCompilerHost(options);
  const originalRead = host.readFile;
  const originalExists = host.fileExists;
  const texts = new Map(Object.entries(probes).map(([file,text]) => [path.resolve(root,file),text]));
  if (baseline) {
    // One git plumbing invocation, not one process per test file.
    const entries = testFiles.filter(f => !f.endsWith('.legacy.ts'));
    const data = execFileSync('git',['cat-file','--batch'],{cwd:root,input:entries.map(f=>'HEAD:'+f+'\n').join(''),maxBuffer:32*1024*1024});
    let offset=0;
    for(const file of entries) {
      const end=data.indexOf(10,offset), header=data.subarray(offset,end).toString(); offset=end+1;
      if(header.endsWith(' missing')) {texts.set(path.resolve(root,file),'');continue;}
      const size=Number(header.split(' ')[2]);texts.set(path.resolve(root,file),data.subarray(offset,offset+size).toString());offset+=size+1;
    }
    for(const file of testFiles.filter(f=>f.endsWith('.legacy.ts'))) texts.set(path.resolve(root,file),'');
  }
  host.readFile = file => texts.has(file) ? texts.get(file) : originalRead(file);
  host.fileExists = file => texts.has(file) || originalExists(file);
  const selected = onlyProbes ? Object.keys(probes) : [...testFiles, ...Object.keys(probes)];
  const program = ts.createProgram([...new Set([...expressFiles,...privateFiles,...selected])].map(f=>path.resolve(root,f)),options,host);
  const checker=program.getTypeChecker();
  const canonical = symbol => symbol && (symbol.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(symbol) : symbol;
  const origins = new Map();
  const modules=[];
  function exported(file, retained) {
    const source=program.getSourceFile(path.resolve(root,file));
    const module=source && checker.getSymbolAtLocation(source);
    if(!module) throw Error('Cannot resolve host module '+file);
    const exports=[];
    for(const item of checker.getExportsOfModule(module)) {
      const symbol=canonical(item);
      if(!(symbol.flags & ts.SymbolFlags.Value)) continue;
      const declarations=symbol.declarations??[];
      const declaration=declarations.find(d=>!d.getSourceFile().isDeclarationFile);
      if(!declaration) continue;
      const origin=relative(declaration.getSourceFile().fileName);
      // Re-exported neutral helpers retain their real declaration identity.
      const row={name:item.name,origin,line:declaration.getSourceFile().getLineAndCharacterOfPosition(declaration.getStart()).line+1,
        kind:ts.SyntaxKind[declaration.kind], retained:retained && expressFiles.includes(origin)};
      exports.push(row);
      if(row.retained) origins.set(symbol,{module:file,...row});
    }
    const row={path:file,sha256:require('node:crypto').createHash('sha256').update(source.text).digest('hex'),exports:exports.sort((a,b)=>a.name.localeCompare(b.name))}; modules.push(row);
    return {source,module,row};
  }
  for(const file of expressFiles) exported(file,true);
  const privateModules=privateFiles.map(file=>exported(file,false));
  function inType(node) {
    for(let p=node.parent;p;p=p.parent) {
      if(ts.isTypeNode(p) || ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p)) return true;
      if(ts.isStatement(p) || ts.isExpression(p)) break;
    }
    return false;
  }
  // Follow private exported declarations to retained implementation symbols.
  // @preCutover marks data-only legacy bootstrap whose resolver is shared.
  let expanded;
  do {
    expanded=false;
    for(const {module,row} of privateModules) for(const item of checker.getExportsOfModule(module)) {
    const symbol=canonical(item);if(!(symbol.flags&ts.SymbolFlags.Value))continue;
    const declaration=symbol.valueDeclaration;
    if(!declaration)continue;
    let retained=/@preCutover/.test(declaration.getFullText().slice(0,declaration.getStart()-declaration.getFullStart()));
    function visit(n){if(ts.isIdentifier(n)&&!inType(n)&&origins.has(canonical(checker.getSymbolAtLocation(n))))retained=true;ts.forEachChild(n,visit);}
    visit(declaration);
    const entry=row.exports.find(e=>e.name===item.name);
    if(row.path.endsWith('/extensions/composition.ts') && entry?.origin === row.path) retained = true;
    if(retained&&entry&&!origins.has(symbol)){entry.retained=true;origins.set(symbol,{module:row.path,...entry});expanded=true;}
    }
  } while(expanded);
  function resolveModule(specifier,file) {
    const prefix='@researchdatabox/redbox-core';
    if(specifier===prefix || specifier.startsWith(prefix+'/')) {
      const key='.'+specifier.slice(prefix.length);
      const entry=JSON.parse(fs.readFileSync(path.join(root,'packages/redbox-core/package.json'),'utf8')).exports?.[key];
      const selected=typeof entry==='string'?entry:entry?.types??entry?.default;
      specifier=selected ? path.join(root,'packages/redbox-core',selected.replace(/^\.\/(?:types|dist)\//,'src/').replace(/\.(?:d\.ts|js)$/,'.ts'))
        : path.join(root,'packages/redbox-core/src',specifier.slice(prefix.length+1)||'index');
    }
    if (specifier.includes('/dist/')) specifier = specifier.replace('/dist/', '/src/');
    const result=ts.resolveModuleName(specifier,file,options,host).resolvedModule;
    let resolved = result?.resolvedFileName;
    if (resolved?.includes('/packages/redbox-core/dist/')) resolved = resolved.replace('/dist/', '/src/').replace(/\.(?:d\.ts|js)$/, '.ts');
    const source=resolved&&program.getSourceFile(resolved);
    return source&&checker.getSymbolAtLocation(source);
  }
  function knownOrigin(symbol) {
    if (origins.has(symbol)) return origins.get(symbol);
    for (const d of symbol?.declarations ?? []) {
      const file=relative(d.getSourceFile().fileName).replace('/dist/', '/src/').replace('/types/', '/src/').replace(/\.(?:d\.ts|js)$/, '.ts');
      const match=[...origins.values()].find(row=>row.origin===file && row.name===symbol.name);
      if(match)return match;
    }
  }
  const rows=[], dependencies={};
  for(const file of selected.sort()) {
    const source=program.getSourceFile(path.resolve(root,file));if(!source)continue;
    const found=[];const seen=new Set();
    function add(node,kind,origin) {
      const line=source.getLineAndCharacterOfPosition(node.getStart(source)).line+1;
      const key=[line,kind,origin?.name,origin?.origin].join(':');if(seen.has(key))return;seen.add(key);
      found.push({line,kind,symbol:origin?.name??'CommonJS executable',origin:origin?.origin??'app.express.cjs',text:source.text.split(/\r?\n/)[line-1].trim()});
    }
    function recordImport(node,specifier) {
      const dependency=ts.resolveModuleName(specifier,source.fileName,options,host).resolvedModule;
      if(dependency && testFiles.includes(relative(dependency.resolvedFileName))) {
        (dependencies[file]??=[]).push(relative(dependency.resolvedFileName));
      }
      if(specifier==='express') {add(node,ts.isImportDeclaration(node)&&node.importClause?.isTypeOnly?'type-import':'express-package-import',{name:'export = express',origin:'express (callable Application / Router factory)'});return;}
      const module=resolveModule(specifier,source.fileName);if(!module)return;
      const matches=checker.getExportsOfModule(module).map(canonical).filter(s=>knownOrigin(s));
      if(ts.isImportDeclaration(node)) {
        const clause=node.importClause;if(!clause)return;
        const names=clause.namedBindings;
        if(clause.name) { const target=canonical(checker.getSymbolAtLocation(clause.name)); if(knownOrigin(target))add(clause.name,clause.isTypeOnly?'type-import':'import',knownOrigin(target)); }
        if(names&&ts.isNamedImports(names))for(const element of names.elements) {
          const target=canonical(checker.getSymbolAtLocation(element.name));
          if(knownOrigin(target))add(element,clause.isTypeOnly||element.isTypeOnly?'type-import':'import',knownOrigin(target));
        }
        else if(names&&ts.isNamespaceImport(names))for(const target of matches)add(node,clause.isTypeOnly?'type-import':'namespace-import',knownOrigin(target));
      } else for(const target of matches)add(node,'require',knownOrigin(target));
    }
    function target(expression,visited=new Set()) {
      let symbol=canonical(checker.getSymbolAtLocation(expression));
      if(!symbol||visited.has(symbol))return;
      if(knownOrigin(symbol))return knownOrigin(symbol);visited.add(symbol);
      for(const d of symbol.declarations??[])if(ts.isVariableDeclaration(d)&&d.initializer){const result=target(d.initializer,visited);if(result)return result;}
      // Callable expressions from @types/express are factories, whatever alias is used.
      const type=checker.getTypeAtLocation(expression);
      const signatures=[...type.getCallSignatures(),...type.getConstructSignatures()];
      if(signatures.some(s=>s.declaration&&/node_modules\/@types\/express(?:\/|-)/.test(s.declaration.getSourceFile().fileName)))
        return {name:symbol.name,origin:'express (typed factory)'};
    }
    function visit(node) {
      if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier))recordImport(node,node.moduleSpecifier.text);
      if(ts.isExportDeclaration(node)&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))recordImport(node,node.moduleSpecifier.text);
      if(ts.isCallExpression(node)&&(node.expression.getText(source)==='require'||node.expression.kind===ts.SyntaxKind.ImportKeyword)&&node.arguments.length===1&&ts.isStringLiteral(node.arguments[0]))recordImport(node,node.arguments[0].text);
      if(ts.isCallExpression(node)||ts.isNewExpression(node)) {
        const origin=target(node.expression);if(origin)add(node,ts.isNewExpression(node)?'construct':'call',origin);
      }
      // CJS executables and generated/child-process source are still executable paths.
      if(ts.isStringLiteralLike(node)||ts.isTemplateExpression(node)) {
        const value=ts.isTemplateExpression(node)?node.getText(source):node.text;
        if(/app\.express\.cjs/.test(value))add(node,'executable-reference');
        const staticImport=ts.isImportDeclaration(node.parent)||ts.isExportDeclaration(node.parent)||
          (ts.isCallExpression(node.parent)&&(node.parent.expression.getText(source)==='require'||node.parent.expression.kind===ts.SyntaxKind.ImportKeyword));
        for(const module of staticImport?[]:modules) {
          const suffix=module.path.replace('packages/redbox-core/src/','').replace(/\.ts$/,'');
          const bare=suffix.replace(/\/index$/,'');
          if([suffix,bare].some(part=>value===part||value.endsWith('/'+part)||value.endsWith('/'+part+'.js')))
            for(const entry of module.exports.filter(entry=>entry.retained))add(node,'module-reference',entry);
        }
        // Record module references embedded in generated/copied source. All symbols
        // come from the actual module export graph, not an identifier name list.
        const pattern=/(?:require\s*\(|from\s+|import\s*\()['"]([^'"\n]+)['"]/g;
        for(const match of value.matchAll(pattern))recordImport(node,match[1]);
      }
      ts.forEachChild(node,visit);
    }
    visit(source);
    if(found.length)rows.push({path:file,hits:found.sort((a,b)=>a.line-b.line||a.kind.localeCompare(b.kind)||a.symbol.localeCompare(b.symbol))});
  }
  return {modules,tests:rows,dependencies:Object.fromEntries(Object.entries(dependencies).map(([file,imports])=>[file,[...new Set(imports)].sort()]))};
}
function selfTest() {
  const assert = require('node:assert/strict');
  const source = 'packages/redbox-core/src/http/express/ExpressHost.ts';
  const probe = 'packages/redbox-core/test/fixtures/fm042-symbol-probe.ts';
  const result = scan({onlyProbes:true,probes:{
    [source]: fs.readFileSync(path.join(root,source),'utf8') + '\nexport class UnlistedCompositionForAudit {}\n',
    [probe]: `import { PortalHttp as Renamed } from '../../src/application/portal/http';
import * as hosts from '../../src/application/portal/host';
import { ExpressHost as Old, UnlistedCompositionForAudit as NewExport } from '../../src/http/express/ExpressHost';
import factory from 'express';
const Alias = Renamed; new Alias({} as never); new Old({} as never, {} as never);
const renamedFactory = factory; renamedFactory(); hosts.createPortalHost({} as never, {} as never);
new NewExport();
const cjs = require('../../src/application/portal/http'); new cjs.PortalHttp({});
const packed = require('../../dist/http/express/ExpressHost'); new packed.ExpressHost({});
const executable = 'app.express.cjs';
`,
  }});
  const hits = result.tests.find(row=>row.path===probe).hits;
  for (const [symbol,kind] of [['PortalHttp','import'],['PortalHttp','construct'],['ExpressHost','construct'],['createPortalHost','call'],['UnlistedCompositionForAudit','construct']])
    assert(hits.some(hit=>hit.symbol===symbol&&hit.kind===kind), `${symbol} ${kind}`);
  assert(hits.some(hit=>hit.origin==='express (typed factory)'&&hit.kind==='call'));
  assert(hits.some(hit=>hit.symbol==='PortalHttp'&&hit.kind==='require'));
  assert(hits.some(hit=>hit.symbol==='ExpressHost'&&hit.kind==='require'));
  assert(hits.some(hit=>hit.kind==='executable-reference'));
  return {checks:9,modules:result.modules.length};
}
module.exports={scan,selfTest};
if(require.main===module)process.stdout.write(JSON.stringify(process.argv.includes('--self-test') ? selfTest() : scan({baseline:process.argv.includes('--baseline')})));
