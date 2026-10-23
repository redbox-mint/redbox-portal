import json, urllib.request, urllib.error, http.cookiejar
from pathlib import Path
base = 'http://127.0.0.1:18544'
cookies = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
req = urllib.request.Request(base + '/user/login_local', data=json.dumps({'username':'admin','password':'rbadmin','branding':'default','portal':'rdmp'}).encode(), headers={'Content-Type':'application/json','Accept':'application/json','X-Source':'jsclient'})
with opener.open(req, timeout=15) as response:
    assert response.status == 200
    assert json.load(response)['user']['username'] == 'admin'
cases=[]
for label, path, version in [
 ('list-v1','/default/rdmp/api/recordtypes',None),
 ('get-v1','/default/rdmp/api/recordtypes/get?name=dataRecord',None),
 ('get-fields','/default/rdmp/api/recordtypes/get?name=dataRecord&fields=name',None),
 ('list-v2','/default/rdmp/api/recordtypes','2.0'),
 ('get-v2','/default/rdmp/api/recordtypes/get?name=dataRecord','2.0'),
 ('missing-v1','/default/rdmp/api/recordtypes/get?name=does-not-exist',None),
 ('missing-v2','/default/rdmp/api/recordtypes/get?name=does-not-exist','2.0'),
 ('invalid-v1','/default/rdmp/api/recordtypes/get',None),
 ('invalid-v2','/default/rdmp/api/recordtypes/get','2.0'),
 ('repeated-name','/default/rdmp/api/recordtypes/get?name=a&name=b',None),
 ('conflicting-success','/default/rdmp/api/recordtypes/get?name=dataRecord&apiVersion=1.0','2.0'),
 ('conflicting-validation','/default/rdmp/api/recordtypes/get?apiVersion=1.0','2.0'),
 ('unknown-version','/default/rdmp/api/recordtypes/get?name=dataRecord','unknown'),
]:
    headers={'Authorization':'Bearer d077835a-696b-4728-85cf-3ffd57152b1e'}
    if version: headers['X-ReDBox-Api-Version']=version
    req=urllib.request.Request(base+path, headers=headers)
    try: response=opener.open(req,timeout=15)
    except urllib.error.HTTPError as error: response=error
    with response:
        body=json.loads(response.read())
        case={'label':label,'method':'GET','path':path,'versionHeader':version,'status':response.status,
              'cacheControl':response.headers.get('Cache-Control'),'bodyKeys':sorted(body) if isinstance(body,dict) else None}
        data=body.get('data',body)
        if isinstance(data,dict):
            if 'summary' in data: case['summary']=data['summary']; case['names']=sorted(row.get('name','') for row in data.get('records',[]))
            elif 'packageType' in data: case['definition']={key:data.get(key) for key in ['name','packageType','searchable']};case['definitionKeys']=sorted(data)
            elif 'errors' in body or 'message' in body: case['error']=body
        cases.append(case)
        print(label, response.status, case['bodyKeys'])
result={'sourceTag':'v5.0.4','sourceCommit':'c1dda53999f3b026347008731f33dba834e06c27',
'artifact':'qcifengineering/redbox-portal@sha256:9bf944d09e370e3fc65612f2df40286431095d216c8a22bd4c34a939a12485f9',
'node':'24.16.0','mongo':'7.0.43','solr':'10.0.0','host':'released Sails/Waterline on 127.0.0.1:18544','cases':cases}
Path('support/specs/sails-retirement/evidence/released-v5-p4-results.json').write_text(json.dumps(result,indent=2)+'\n')
