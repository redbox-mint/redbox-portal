/* Source-derived call/consumer inventory. Run from the repository root. */
'use strict';
const fs = require('node:fs');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const ts = require(process.cwd() + '/node_modules/typescript');
const out = 'support/specs/sails-retirement/evidence/final-review-r15';
const files = cp.execFileSync('git', ['ls-files', 'angular', 'packages'], {encoding:'utf8'}).trim().split('\n');
const input = files.filter(f => f.startsWith('angular/projects/') && /\.(ts|html)$/.test(f));
const prod = input.filter(f => !/\.(spec|test)\.ts$/.test(f) && !/(^|\/)(test|testing)\//.test(f));
const trees = prod.filter(f => f.endsWith('.ts')).map(f => ts.createSourceFile(f, fs.readFileSync(f,'utf8'), ts.ScriptTarget.Latest, true));
const line = n => n.getSourceFile().getLineAndCharacterOfPosition(n.getStart()).line + 1;
const ref = n => ({file:n.getSourceFile().fileName,line:line(n)});
const src = n => n?.getText() ?? null;
const walk = (n, fn) => {fn(n);ts.forEachChild(n,c=>walk(c,fn));};
const parent = (n, pred) => {while(n && !pred(n)) n=n.parent;return n;};
const owner = n => parent(n, x=>ts.isMethodDeclaration(x)||ts.isConstructorDeclaration(x)||ts.isFunctionDeclaration(x)||ts.isGetAccessor(x)||ts.isPropertyDeclaration(x));
const cls = n => parent(n, ts.isClassDeclaration)?.name?.text ?? '<module>';
const classKey = n => `${n.getSourceFile().fileName}#${cls(n)}`;
const methods = new Map();
const members = new Map();
const classes = new Map();
const aliases = new Map();
for(const tree of trees) walk(tree,n=>{
  if(ts.isImportSpecifier(n)) aliases.set(`${tree.fileName}#${n.name.text}`,n.propertyName?.text??n.name.text);
  if(ts.isClassDeclaration(n)&&n.name) {
    const keys=classes.get(n.name.text)??[];keys.push(classKey(n));classes.set(n.name.text,keys);
  }
});
const findClass = (n,name) => {
  name=aliases.get(`${n.getSourceFile().fileName}#${name}`)??name;
  const keys=classes.get(name)??[];
  return keys.length===1?keys[0]:keys.find(k=>k.startsWith(n.getSourceFile().fileName+'#'));
};
for(const tree of trees) walk(tree,n=>{
  if(ts.isMethodDeclaration(n)||ts.isConstructorDeclaration(n)||ts.isGetAccessor(n)||ts.isFunctionDeclaration(n)||ts.isPropertyDeclaration(n)) {
    const name=ts.isConstructorDeclaration(n)?'constructor':src(n.name);
    methods.set(`${classKey(n)}.${name}`,{...ref(n),class:cls(n),method:name,source:src(n),node:n});
  }
  if(ts.isParameter(n)&&ts.isConstructorDeclaration(n.parent)&&n.type) {
    const injection=(ts.getDecorators(n)??[]).map(d=>d.expression).find(d=>ts.isCallExpression(d)&&src(d.expression)==='Inject');
    members.set(`${classKey(n)}.${src(n.name)}`,injection?src(injection.arguments[0]):src(n.type));
  }
  if(ts.isPropertyDeclaration(n)&&n.initializer&&ts.isCallExpression(n.initializer)&&src(n.initializer.expression)==='inject') members.set(`${classKey(n)}.${src(n.name)}`,src(n.initializer.arguments[0]));
});
const edges=[];
const calls=[];
const indirect=[];
for(const tree of trees) walk(tree,n=>{
  if(!ts.isCallExpression(n)) return;
  const e=n.expression;
  const own=owner(n);const caller=`${classKey(n)}.${own?(ts.isConstructorDeclaration(own)?'constructor':src(own.name)):'<module>'}`;
  if(ts.isPropertyAccessExpression(e)) {
    const receiver=src(e.expression),method=e.name.text;
    if(receiver==='this.http'&&/^(get|post|put|delete|patch|request|head|options|jsonp)$/.test(method)) {
      calls.push({...ref(n),class:cls(n),method:own?src(own.name):null,httpMethod:method.toUpperCase(),urlExpression:src(n.arguments[0]),arguments:n.arguments.map(src),responseType:n.typeArguments?.map(src)??[],source:src(n),owner:caller});
    }
    let targetClass;
    if(receiver==='this')targetClass=classKey(n);
    else if(/^this\.\w+$/.test(receiver)) targetClass=findClass(n,members.get(`${classKey(n)}.${receiver.slice(5)}`));
    else if(receiver.endsWith('.recordService')) targetClass=findClass(n,'RecordService');
    if(targetClass&&methods.has(`${targetClass}.${method}`)) {
      const binding=parent(n,x=>ts.isVariableDeclaration(x)||ts.isBinaryExpression(x)&&x.operatorToken.kind===ts.SyntaxKind.EqualsToken);
      const resultBinding=binding?(ts.isVariableDeclaration(binding)?src(binding.name):src(binding.left)):null;
      const fieldReads=[];
      if(own&&resultBinding)walk(own,x=>{
        if((ts.isPropertyAccessExpression(x)||ts.isElementAccessExpression(x))&&src(x).startsWith(resultBinding+'.'))fieldReads.push({...ref(x),expression:src(x)});
        if(ts.isCallExpression(x)&&/^_get$|^get$/.test(src(x.expression))&&src(x.arguments[0])===resultBinding)fieldReads.push({...ref(x),expression:src(x)});
      });
      edges.push({...ref(n),caller,callee:`${targetClass}.${method}`,source:src(n),resultBinding,fieldReads});
    }
  }
  const text=src(n);
  if((e.kind===ts.SyntaxKind.ImportKeyword&&!/^import\(\s*['"]/.test(text))||/getDynamicImport$/.test(src(e))||/\.use$/.test(src(e))&&/TusPlugin|DropboxPlugin|GoogleDrivePlugin|OneDrivePlugin|HttpApi/.test(src(n.arguments[0])??'')||/createElement$/.test(src(e))&&/script|link|iframe/.test(text)) indirect.push({...ref(n),owner:caller,source:text});
});
for(let i=0;i<calls.length;i++) {
  const row=calls[i];row.id=`ANG-${String(i+1).padStart(3,'0')}`;
  const seen=new Set([row.owner]),queue=[row.owner];const consumers=[];
  while(queue.length) {
    const selected=queue.shift();
    for(const e of edges.filter(e=>e.callee===selected)) {
      consumers.push(e);
      if(!seen.has(e.caller)){seen.add(e.caller);queue.push(e.caller);}
    }
  }
  row.consumers=consumers;
  row.sourceMethod=methods.get(row.owner)?.source??null;
}
const configs=JSON.parse(fs.readFileSync('angular/angular.json','utf8')).projects;
const projects=Object.entries(configs).map(([name,cfg])=>({name,type:cfg.projectType,root:cfg.root,sourceFiles:prod.filter(f=>f.startsWith('angular/'+cfg.root+'/')).length,callIds:calls.filter(c=>c.file.startsWith('angular/'+cfg.root+'/')).map(c=>c.id)}));
const shared=files.filter(f=>f.startsWith('packages/sails-ng-common/src/')&&f.endsWith('.ts'));
const outside=files.filter(f=>!f.startsWith('angular/projects/')&&f.endsWith('.ts')&&!/\/(dist|test|node_modules)\//.test(f)).filter(f=>/@angular\/common\/http|HttpClientService/.test(fs.readFileSync(f,'utf8'))).map(f=>({file:f,disposition:'Development generator template; no shipped shared Angular runtime outside projects.'}));
const methodsOut=[...new Set(calls.flatMap(r=>[r.owner,...r.consumers.map(e=>e.caller)]))].map(k=>{const {node,...value}=methods.get(k)??{unresolvedOwner:k};return value;});
const ledger={sharedClientPackage:{root:'packages/sails-ng-common/src',productionTypeScript:shared.length,network:'No HttpClient/raw HTTP calls. One bundled marked import in markdown-parser.browser.ts (angular-network.json). Browser finalizer selects that implementation for Angular imports.',browserMapping:'packages/sails-ng-common/scripts/finalize-browser-build.mjs'},schemaVersion:1,baseline:'a49366803',incoming:'bda01cb2525ef31bdb1f449ddb7ea52e52deafb3',headAtGeneration:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'All tracked Angular project production TypeScript and templates; tests excluded explicitly; shared library location search includes tracked packages.',counts:{projects:projects.length,productionTypeScript:trees.length,productionTemplates:prod.filter(f=>f.endsWith('.html')).length,httpCallSites:calls.length,consumerEdges:edges.length,indirectSites:indirect.length},projects,outsideProjects:outside,calls,indirect,methods:methodsOut,inputs:[...prod,...shared].map(f=>({file:f,sha256:crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}))};
fs.writeFileSync(`${out}/angular-source.json`,JSON.stringify(ledger,null,2)+'\n');
fs.writeFileSync('.tmp/sails-retirement/final-review-r15/angular/calls.txt',calls.map(r=>`${r.id} ${r.class}.${r.method} ${r.httpMethod} ${r.urlExpression} (${r.consumers.length} consumer edges)`).join('\n')+'\n');
console.log(JSON.stringify(ledger.counts));
