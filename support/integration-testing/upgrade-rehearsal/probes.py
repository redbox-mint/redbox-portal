"""Black-box portal and Solr probes for the disposable upgrade."""
import hashlib
import http.client
import json
import socket
import urllib.parse

from lab import AUTH, LOGINS, ORIGIN, PREFIX, SOLR_PORT, URL, expect, provider, receipt, request, wait

def login(username, variant):
    cookie_name = f'wsu.{variant}.fm049.sid'
    def cookie(headers):
        return next(value.split(';',1)[0] for value in headers.get_all('Set-Cookie', []) if value.startswith(cookie_name+'='))
    headers, data = expect('/csrfToken', 200)
    csrf = json.loads(data)['_csrf']
    headers, payload = expect('/user/login_local', 200, method='POST', headers={'Cookie':cookie(headers), 'X-CSRF-Token':csrf},
                              body={'username':username, 'password':LOGINS[username], 'branding':'default', 'portal':'rdmp'})
    assert json.loads(payload)['user']['username'] == username
    session = cookie(headers)
    expect_user(username, session)
    return session


def expect_user(username, cookie):
    assert json.loads(expect(PREFIX + '/user/info', 200, headers={'Cookie':cookie})[1])['user']['username'] == username


def record_read(record):
    headers, body = expect(PREFIX + '/api/records/metadata/' + record['oid'] + '?apiVersion=2', 200, headers=AUTH)
    payload = json.loads(body)
    assert record['title'] in body.decode(), (record, payload)
    assert headers.get('ETag')
    return headers['ETag'], payload


def assert_wsu_route(record, cookie):
    headers, _ = expect(PREFIX + '/record/' + record['oid'] + '/latest-pdf', 302, headers={'Cookie':cookie})
    assert headers['Location'].endswith(PREFIX + '/record/view/' + record['oid']), headers['Location']
    return {'http':302,'target':headers['Location']}


def browser_http(record, cookie):
    headers, body = expect(PREFIX + '/record/edit/' + record['oid'], 200, headers={'Cookie':cookie,'Accept':'text/html','X-Source':'browser'})
    assert b'<html' in body.lower(), body[:400]
    return {'status':200, 'htmlBytes':len(body)}


def upload(record, filename, body, hold=False):
    boundary = 'fm049-wsu-rehearsal-datastream'
    first = (f'--{boundary}\r\nContent-Disposition: form-data; name="attachmentFields"; filename="{filename}"\r\n'
             'Content-Type: application/octet-stream\r\n\r\n').encode()
    end = f'\r\n--{boundary}--\r\n'.encode()
    path = PREFIX + '/api/records/datastreams/' + record['oid']
    etag, _ = record_read(record)
    headers = {**AUTH, 'Content-Type':f'multipart/form-data; boundary={boundary}', 'If-Match':etag, 'Origin':ORIGIN}
    if hold:
        sock = socket.create_connection((URL.hostname,URL.port), timeout=35)
        headers.update({'Host':URL.netloc,'Content-Length':str(len(first)+len(body)+len(end)),'Connection':'close'})
        start = (f'POST {path} HTTP/1.1\r\n' + ''.join(f'{key}: {value}\r\n' for key,value in headers.items()) + '\r\n').encode()
        midpoint = len(body)//2
        sock.sendall(start + first + body[:midpoint])
        return sock, body[midpoint:]+end, etag
    response = request(path, 'POST', headers, first+body+end)
    return verify_uploaded(record, response, body, etag)


def verify_uploaded(record, response, body, old_etag):
    status, headers, payload = response
    assert status == 200, (status, payload[:1200])
    ids = json.loads(payload)['message']['fileIds']
    assert len(ids) == 1 and ids[0]['fileId']
    assert headers['ETag'] and headers['ETag'] != old_etag
    attachment = {'oid':record['oid'], 'fileId':ids[0]['fileId'], 'bytes':len(body), 'sha256':hashlib.sha256(body).hexdigest(), 'http':status}
    download(attachment)
    return attachment


def download(attachment):
    path = PREFIX + '/api/records/datastreams/' + attachment['oid'] + '/' + urllib.parse.quote(attachment['fileId'], safe='')
    _, body = expect(path, 200, headers=AUTH)
    assert len(body) == attachment['bytes'], (len(body), attachment)
    assert hashlib.sha256(body).hexdigest() == attachment['sha256'], attachment


def solr_docs(records):
    import urllib.error
    import urllib.request
    query = urllib.parse.urlencode({'q':'*:*','fl':'id,redboxOid,title','rows':'100','wt':'json'})
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{SOLR_PORT}/solr/redbox/select?' + query, timeout=10) as stream:
            result = json.load(stream)['response']
    except urllib.error.HTTPError as error:
        if error.code != 503:
            raise
        return None
    except (ConnectionError, TimeoutError):
        return None
    except urllib.error.URLError as error:
        if not isinstance(error.reason, (ConnectionError, TimeoutError)):
            raise
        return None
    return result if all(record['title'] in json.dumps(result['docs']) for record in records) else None


def seed():
    provider('token')
    for slug in ('anzsrc-2020-for','anzsrc-2020-seo'):
        expect(PREFIX + '/api/vocabulary', 201, method='POST', headers=AUTH,
               body={'name':'FM-049 synthetic '+slug, 'slug':slug, 'type':'tree', 'source':'local',
                     'entries':[{'label':'Synthetic classification','value':'FM049','identifier':'FM049'}]})
    _, user = expect(PREFIX + '/api/users', 201, method='PUT', headers=AUTH,
                     body={'username':'fm049-researcher', 'name':'Rehearsal Researcher', 'email':'fm049-researcher@example.invalid',
                           'password':LOGINS['fm049-researcher'], 'roles':['Researcher']})
    users = {name:login(name,'express') for name in LOGINS}
    records = []
    for record_type in ['rdmp','dataRecord','dataPublication','instrument','ror']:
        title = f'FM-049 WSU {record_type} checkpoint'
        fields = {'title':title,'description':'Synthetic maintenance-window upgrade record','dataLocations':[]}
        if record_type == 'ror':
            fields |= {'display_name':title,'id':'https://ror.org/synthetic-fm049','types':['Education'],'status':'active'}
        _, data = expect(PREFIX + '/api/records/metadata/' + record_type, 201, method='POST', headers=AUTH, body=fields)
        record = {'type':record_type,'oid':json.loads(data)['oid'],'title':title}
        record_read(record)
        records.append(record)
    attachments = [upload(record, f'fm049-{record["type"]}.bin', (record['type'].encode()+b'\n') * 2048) for record in records[:2]]
    assert_wsu_route(records[0], users['admin'])
    indexed = wait(lambda: solr_docs(records[:2]), 120, 1)
    receipt('source-state', {'records':records,'attachments':attachments,'users':users,'solr':indexed,'researcherCreated':bool(json.loads(user))})
