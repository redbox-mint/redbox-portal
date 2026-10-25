'use strict';
// Actual delayed widget methods update actual installed Uppy RequestClients.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const ts=require(process.cwd()+'/node_modules/typescript');
function extract(file,version){
  const source=version==='incoming'?cp.execFileSync('git',['show','e4a198691:'+file],{encoding:'utf8'}):fs.readFileSync(file,'utf8');
  const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),methods=[];
  const names=new Set(['ensureTusHeadersContainCsrf','buildTusHeaders','buildCompanionHeaders','resolveImmediateCsrfToken','readCsrfToken','isProviderPlugin']);
  function visit(n){if(ts.isMethodDeclaration(n)&&names.has(n.name.getText(tree)))methods.push(n.getText(tree));ts.forEachChild(n,visit);}visit(tree);
  const js=ts.transpileModule('class Consumer {'+methods.join('\n')+'}',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return new Function(js+';return Consumer;')();
}
async function main(){
  const {default:RequestClient}=await import(pathToFileURL(process.cwd()+'/angular/node_modules/@uppy/core/lib/companion-client/RequestClient.js'));
  const observations=[];
  for(const widget of ['file-upload','data-location'])for(const version of ['incoming','current']){
    const file=`angular/projects/researchdatabox/form/src/app/component/${widget}.component.ts`,Consumer=extract(file,version),app=new Consumer();
    const pending=Promise.withResolvers(),plugins=new Map(),token='synthetic-delayed-csrf';
    for(const id of ['Dropbox','GoogleDrive','OneDrive']) plugins.set(id,{provider:new RequestClient({getState:()=>({})},{companionUrl:'https://synthetic.invalid',companionHeaders:{}})});
    const tus={opts:{headers:{}},setOptions(options){Object.assign(this.opts,options);}};plugins.set('Tus',tus);
    Object.assign(app,{tusHeaders:{},configService:{getConfig:()=>pending.promise},uppy:{getPlugin:id=>plugins.get(id)},loggerService:{error(){throw new Error('unexpected update error');}}});
    const update=app.ensureTusHeadersContainCsrf();pending.resolve({csrfToken:token});await update;await new Promise(resolve=>setImmediate(resolve));
    assert.equal(tus.opts.headers['X-CSRF-Token'],token);
    for(const id of ['Dropbox','GoogleDrive','OneDrive']){
      const headers=await plugins.get(id).provider.headers();
      assert.equal(headers['X-CSRF-Token'],version==='current'?token:undefined);
      observations.push({file,version,provider:id,privateClientHeaderPresent:headers['X-CSRF-Token']===token,tusHeaderPresent:true});
    }
  }
  fs.writeFileSync(require('node:path').join(__dirname, 'r15-delayed-widget-results.json'),JSON.stringify({node:process.version,proof:'Actual extracted ensureTusHeadersContainCsrf and helpers update installed RequestClient private headers after a controlled configuration Promise resolves. No provider/network/browser claim.',observations},null,2)+'\n');
  console.log(`${observations.length} delayed widget/private-client observations passed`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
