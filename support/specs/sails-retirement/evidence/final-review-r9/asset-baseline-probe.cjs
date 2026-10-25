const fs=require('node:fs'), path=require('node:path'), os=require('node:os'), cp=require('node:child_process'), vm=require('node:vm'), assert=require('node:assert/strict'), ts=require('typescript');
const source=cp.execFileSync('git',['show','a49366803:packages/redbox-core/src/config/http.config.ts'],{encoding:'utf8'});
const ast=ts.createSourceFile('baseline.ts',source,ts.ScriptTarget.Latest,true);
const names=new Set(['isStaticAssetPath','sanitizeStaticSegment','sanitizeStaticResourcePath','resolvePublicAssetPath','resolveHookStaticAssetPath','decodeStaticPathPart']);
const selected=ast.statements.filter(s=>ts.isFunctionDeclaration(s)&&names.has(s.name?.text)).map(s=>s.getText(ast)).join('\n');
assert.equal(ast.statements.filter(s=>ts.isFunctionDeclaration(s)&&names.has(s.name?.text)).length,names.size);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sr-r9-baseline-assets-'));
const hooks=[path.join(root,'hook-high'),path.join(root,'hook-low')];
const compiled=path.join(root,'.tmp/public');
const context={exports:{},fs,path,resolveHookAssetFile:(_app,candidate)=>{for(const r of hooks){const p=path.join(r,candidate);if(fs.existsSync(p))return {absolutePath:p};}return null;}};
vm.runInNewContext(ts.transpileModule(selected,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
function write(r,p,text){fs.mkdirSync(path.dirname(path.join(r,p)),{recursive:true});fs.writeFileSync(path.join(r,p),text);}
let checks=0;
try {
 for(const folder of ['js','styles','images','fonts','angular','icons']){
  const name=folder+'/same.bin';
  write(compiled,'default/default/'+name,'application');for(const h of hooks)write(h,'default/default/'+name,'hook');
  assert.equal(context.exports.resolveHookStaticAssetPath(root,'/institution/rdmp/'+name),null);checks++;
  write(hooks[0],'institution/rdmp/'+name,'specific hook');
  assert.equal(fs.readFileSync(context.exports.resolveHookStaticAssetPath(root,'/institution/rdmp/'+name),'utf8'),'specific hook');checks++;
  write(compiled,name,'application direct');for(const h of hooks)write(h,name,'hook direct');
  assert.equal(context.exports.resolveHookStaticAssetPath(root,'/'+name),null);checks++;
 }
 for(const name of ['favicon-32x32.png','apple-touch-icon.png','site.webmanifest']){
  write(compiled,name,'application direct');for(const h of hooks)write(h,name,'hook direct');
  assert.equal(context.exports.resolveHookStaticAssetPath(root,'/'+name),null);checks++;
 }
 console.log(JSON.stringify({baseline:'a49366803',checks,compiledWinsSamePath:true,moreSpecificHookWins:true,directAssets:true,explicitLegacyCopies:'separate initialization operation'}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
