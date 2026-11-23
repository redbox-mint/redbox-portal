import datetime as dt
import http.client
import json
import os
import socket
import subprocess
import time
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUN = Path(os.environ['FM049_RUN']).resolve()
SETTINGS = json.loads((RUN / 'settings.json').read_text())
NAMESPACE = SETTINGS['namespace']
ATTEMPT = SETTINGS['attemptId']
assert NAMESPACE.startswith(('fm049-', 'fm050-')) and NAMESPACE not in ('fm049-', 'fm050-')
CORE_PORT, STORAGE_PORT, SOLR_PORT, S3_PORT, PORTAL_PORT, PROXY_PORT = range(SETTINGS['basePort'], SETTINGS['basePort'] + 6)
DATA_NAMESPACE = SETTINGS.get('dataNamespace', NAMESPACE)
S3_BUCKET = SETTINGS.get('s3Bucket', DATA_NAMESPACE)
DB = 'sr_wsu_' + DATA_NAMESPACE.replace('-', '_')
OWNER_LABEL = f'fm049.attempt={ATTEMPT}'
ORIGIN = SETTINGS['origin']
URL = urllib.parse.urlsplit(ORIGIN)
PREFIX = '/default/rdmp'
CORE = NAMESPACE + '-core'
STORAGE = NAMESPACE + '-storage'
SOLR = NAMESPACE + '-solr'
S3 = NAMESPACE + '-s3'
PROXY = NAMESPACE + '-proxy'
MONGO = 'mongo@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8'
SOLR_REF = 'solr@sha256:b866a82ef3a0a16ed25005731dd0c5d87541b70783a14a2392ecfa12810541cb'
S3_REF = 'chrislusf/seaweedfs:4.47@sha256:ce9e796f1fe6f06968f4c04bdaf8f678dad9c8acdfef3d244133d71bfa6bf882'
NGINX = 'nginx@sha256:b3c656d55d7ad751196f21b7fd2e8d4da9cb430e32f646adcf92441b72f82b14'
PROVIDER_IMAGES = (MONGO, SOLR_REF, S3_REF, NGINX)
NODES = [(CORE, CORE_PORT), (STORAGE, STORAGE_PORT)]
VOLUMES = {name: name + '-data' for name in (CORE, STORAGE, SOLR, S3)}
CHECKPOINT = RUN / 'checkpoint'
FENCE = RUN / 'gate/maintenance'
AUTH = {'Authorization': 'Bearer ' + SETTINGS['bearer']}
OPERATOR = 'fm049_operator=' + SETTINGS['operator']
DATABASES = {'core':(CORE, DB), 'storage':(STORAGE, DB+'_storage'),
             'agenda':(CORE, DB+'_agenda'), 'sessions':(CORE, DB+'_sessions')}
HELD_PATH = RUN / 'source-state.json'
LOGINS = {'admin':'rbadmin', 'fm049-researcher':SETTINGS['researcherPassword']}


def utc():
    return dt.datetime.now(dt.UTC).isoformat(timespec='milliseconds')


def write(filename, value):
    path = RUN / filename
    pending = path.with_suffix('.pending')
    pending.write_text(json.dumps(value, indent=2) + '\n')
    pending.replace(path)


def receipt(step, data):
    write(step + '.json', data)


def timed(label, action):
    start = time.monotonic()
    timestamp = utc()
    passed = False
    try:
        result = action()
        passed = True
        return result
    finally:
        row = {'attemptId':ATTEMPT, 'step':label, 'startedUtc':timestamp, 'finishedUtc':utc(),
               'seconds':round(time.monotonic() - start, 3), 'passed':passed}
        with (RUN / 'timings.jsonl').open('a') as target:
            target.write(json.dumps(row) + '\n')
        print(json.dumps(row), flush=True)


def docker(*args, seconds=45, validate=True, output=None):
    if args[0] in {'run', 'create'}:
        args = (args[0], '--label', OWNER_LABEL, *args[1:])
    command = ['timeout', '--kill-after=5s', f'{seconds}s', 'docker', *map(str, args)]
    if output is not None:
        with (RUN / output).open('wb') as fd:
            return subprocess.run(command, stdout=fd, stderr=subprocess.PIPE, check=validate)
    return subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=validate)


def container(name):
    result = docker('container', 'inspect', name, validate=False)
    if result.returncode:
        if b'No such' in result.stderr:
            return None
        result.check_returncode()
    status = json.loads(result.stdout)[0]
    assert status['Config']['Labels'].get('fm049.attempt') == ATTEMPT, f'{name} belongs to another run'
    return status


def did(name):
    status = container(name)
    assert status is not None, f'{name} is missing'
    return status


def launch_identity(status):
    return {'containerId': status['Id'], 'image': status['Image'], 'startedAt': status['State']['StartedAt']}


def candidate(status=None):
    status = did(NAMESPACE + '-fastify') if status is None else status
    state = status['State']
    assert state['Running'], 'candidate is stopped'
    assert status['Image'] == image('fastify'), 'running candidate image differs from selected image'
    return launch_identity(status)


def remove_job(name):
    if container(name) is not None:
        docker('rm', '-fv', name)


def log(name, filename):
    result = docker('logs', '--timestamps', name, validate=False)
    (RUN / filename).write_bytes(result.stdout + result.stderr)
    return (result.stdout + result.stderr).decode(errors='replace')


def wait(callback, seconds, delay=.2):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        result = callback()
        if result:
            return result
        time.sleep(delay)
    raise TimeoutError(callback.__name__)


def request(path, method='GET', headers=None, body=None, *, operator=True):
    wire = http.client.HTTPConnection(URL.hostname, URL.port, timeout=35)
    selected = {'Accept':'application/json', 'X-Source':'jsclient', 'Origin':ORIGIN}
    selected.update(headers or {})
    cookie = selected.pop('Cookie', '')
    if operator:
        cookie = '; '.join(filter(None, (OPERATOR, cookie)))
    if cookie:
        selected['Cookie'] = cookie
    if isinstance(body, dict):
        selected['Content-Type'] = 'application/json'
        body = json.dumps(body).encode()
    try:
        wire.request(method, path, body=body, headers=selected)
        result = wire.getresponse()
        return result.status, result.headers, result.read()
    finally:
        wire.close()


def expect(path, status, **kwargs):
    result = request(path, **kwargs)
    assert result[0] == status, (path, status, result[0], result[2][:1300])
    return result[1], result[2]


def assert_fenced():
    for path in ('/readyz', '/healthz', PREFIX + '/home', PREFIX + '/api/records/metadata/dataRecord'):
        expect(path, 503, operator=False)
    expect(PREFIX + '/api/records/metadata/dataRecord', 503, operator=False, method='POST', body={'title':'blocked while fenced'})
    expect('/readyz', 503, operator=False, headers={'Cookie':'fm049_operator=invalid'})
    return 503


def mount(source, destination, readonly=False):
    return f'type=bind,src={RUN / source},dst={destination}' + (',readonly' if readonly else '')


def provider_image_present(image_ref):
    return docker('image', 'inspect', image_ref, validate=False).returncode == 0


def preload():
    results = {}
    for image_ref in PROVIDER_IMAGES:
        present = provider_image_present(image_ref)
        if not present:
            repository = image_ref.split('@')[0].replace('/', '-').split(':')[0]
            docker('pull', image_ref, seconds=240, output=f'{repository}-pull.log')
            assert provider_image_present(image_ref), image_ref
        results[image_ref] = 'reused' if present else 'pulled'
    receipt('preload', results)


def services(initialize_volumes=None):
    for image_ref in PROVIDER_IMAGES:
        assert provider_image_present(image_ref), f'Run preload before services to obtain {image_ref}'
    for port in range(CORE_PORT, PROXY_PORT + 1):
        for host in ('0.0.0.0', '::'):
            family = socket.AF_INET6 if host == '::' else socket.AF_INET
            with socket.socket(family, socket.SOCK_STREAM) as probe:
                probe.bind((host, port))
    for resource in [*VOLUMES, PROXY, NAMESPACE + '-express', NAMESPACE + '-fastify']:
        assert docker('container', 'inspect', resource, validate=False).returncode != 0, resource
    for volume in VOLUMES.values():
        assert docker('volume', 'inspect', volume, validate=False).returncode != 0, volume
    for volume in VOLUMES.values():
        docker('volume', 'create', '--label', f'rehearsal=FM-{NAMESPACE[2:5]}', '--label', OWNER_LABEL, volume)
    if initialize_volumes is not None:
        initialize_volumes()
    for name, port in NODES:
        docker('run', '--pull=never', '-d', '--name', name, '-p', f'127.0.0.1:{port}:27017',
               '--memory=1536m', '--ulimit', 'nofile=64000:64000',
               '--mount', f'type=volume,src={VOLUMES[name]},dst=/data/db',
               MONGO, '--wiredTigerCacheSizeGB', '0.25', '--bind_ip_all')
    docker('run', '--pull=never', '-d', '--name', SOLR, '-p', f'127.0.0.1:{SOLR_PORT}:8983', '--memory=1280m', '-e', 'SOLR_HEAP=512m',
           '--mount', f'type=volume,src={VOLUMES[SOLR]},dst=/var/solr', SOLR_REF,
           'bash', '-c', 'precreate-core redbox /opt/solr/server/solr/configsets/_default && exec solr-foreground --user-managed')
    docker('run', '--pull=never', '-d', '--name', S3, '-p', f'127.0.0.1:{S3_PORT}:8333', '--memory=768m',
           '--mount', f'type=volume,src={VOLUMES[S3]},dst=/data', '-e', 'AWS_ACCESS_KEY_ID=seaweedadmin',
           '-e', 'AWS_SECRET_ACCESS_KEY=seaweedadmin', S3_REF, 'mini', '-dir=/data', '-ip=127.0.0.1', '-master.telemetry=false',
           '-admin.user=seaweedadmin','-admin.password=seaweedadmin','-s3.autoCreateBucket=false',
           '-s3.allowDeleteBucketNotEmpty=false','-webdav=false','-s3.port.iceberg=0','-s3.port.lance=0')
    # The unprivileged Nginx worker must be able to stat the mounted marker.
    FENCE.parent.chmod(0o711)
    docker('run', '--pull=never', '-d', '--network=host', '--name', PROXY, '--mount', mount('proxy.conf','/etc/nginx/nginx.conf',True),
           '--mount', mount('gate','/fm049-gate',True), NGINX, 'nginx', '-g', 'daemon off;')
    versions = {}
    for name, _ in NODES:
        def inspect_mongo():
            probe = docker('exec', name, 'mongosh', '--quiet', '--eval',
                           'print(JSON.stringify({version:db.version(),fcv:db.adminCommand({getParameter:1,featureCompatibilityVersion:1}).featureCompatibilityVersion.version}))',
                           validate=False)
            return json.loads(probe.stdout) if probe.returncode == 0 and probe.stdout.strip() else None
        versions[name] = wait(inspect_mongo, 60, 1)
        assert versions[name] == {'version':'9.0.4','fcv':'9.0'}, versions[name]
    wait(lambda: tcp(SOLR_PORT), 75)
    wait(lambda: tcp(S3_PORT), 75)
    receipt('services', {'versions':versions, 'containers':{name:did(name)['Image'] for name in [*VOLUMES, PROXY]}, 'volumes':VOLUMES})


def tcp(port):
    try:
        with socket.create_connection(('127.0.0.1',port), timeout=.2):
            return True
    except OSError:
        return False


def config_args(variant):
    secret_path = RUN / (variant + '.env')
    assert secret_path.is_file(), secret_path
    return ['--network=host', '--user', f'{os.getuid()}:{os.getgid()}', '--stop-timeout', '65', '--memory=2500m',
            '--env-file', secret_path, '--mount', mount(f'{variant}.cjs','/fm049-config.cjs',True),
            '--mount', mount('state','/fm049-state')]


def set_env(variant, secret):
    values = {'REDBOX_PUBLIC_URL':ORIGIN, 'REDBOX_PORT':str(PORTAL_PORT),
              'REDBOX_SESSION_SECRET':secret, 'REDBOX_APPLICATION_CONFIG':'/fm049-config.cjs',
              'HOOK_S3_BUCKET':S3_BUCKET, 'HOOK_S3_REGION':'ap-southeast-2',
              'HOOK_S3_ENDPOINT':f'http://127.0.0.1:{S3_PORT}', 'HOOK_S3_ACCESS_KEY':'seaweedadmin',
              'HOOK_S3_SECRET_KEY':'seaweedadmin', 'HOOK_S3_FORCE_PATH_STYLE':'true',
              'HOOK_S3_SUPPORTS_ACL':'false', 'HOOK_ATTACHMENTS_STAGE_DIR':'/fm049-state/staging'}
    file = RUN / (variant + '.env')
    file.write_text(''.join(f'{key}={value}\n' for key,value in values.items()))
    file.chmod(0o600)


def image(variant):
    return (RUN / f'components/{variant}.iid').read_text().strip()


def provider(mode, *, input_file=None):
    name = f'{NAMESPACE}-provider-{mode}'
    assert container(name) is None
    input_mount = ['--user', f'{os.getuid()}:{os.getgid()}', '--mount',
                   mount(input_file, '/fm049-provider-input.json', True)] if input_file else []
    try:
        result = docker('run', '--pull=never', '--rm', '--name', name, '--network=host', '--no-healthcheck',
                        '--mount', f'type=bind,src={HERE / "providers.cjs"},dst=/fm049-providers.cjs,readonly',
                        *input_mount, '-e','FM049_DISPOSABLE=true', '-e',f'FM049_BASE_PORT={CORE_PORT}',
                        '-e',f'FM049_NAMESPACE={DATA_NAMESPACE}', '-e',f'FM049_BUCKET={S3_BUCKET}',
                        '-e','FM049_BEARER=' + SETTINGS['bearer'],
                        image('express'), 'node', '/fm049-providers.cjs', mode, seconds=120, validate=False)
        if result.returncode:
            (RUN / f'provider-{mode}-error.log').write_bytes(result.stderr)
            raise RuntimeError(f'provider {mode} exited {result.returncode}; see provider-{mode}-error.log')
        return json.loads(result.stdout) if result.stdout.strip() else None
    finally:
        remove_job(name)


def maintenance(variant, mode, expected):
    name = f'{NAMESPACE}-oneshot-{variant}'
    assert container(name) is None
    try:
        result = docker('run', '--pull=never', '--rm', '--name', name, '--no-healthcheck', *config_args(variant),
                        image(variant), 'node', 'node_modules/redbox-hook-wsu/support/v6/app.cjs',
                        '--maintenance=indexes:' + mode, seconds=180, validate=False)
        with (RUN / f'{variant}-indexes-{mode}.log').open('ab') as out:
            out.write(result.stdout + result.stderr)
        assert result.returncode == expected, (mode, expected, result.returncode, result.stdout[-1000:], result.stderr[-1000:])
        assert not tcp(PORTAL_PORT)
        return result.returncode
    finally:
        remove_job(name)


def prepare_source():
    set_env('express', SETTINGS['expressSecret'])
    provider('bucket')
    receipt('source-indexes', {'initial':maintenance('express','inspect',2), 'ensure':maintenance('express','ensure',0),
                               'final':maintenance('express','inspect',0)})
    docker('create', '--pull=never', '--name', NAMESPACE + '-express', *config_args('express'), image('express'))
    receipt('source-startup', boot('express', 'source-startup', gated=False))


def boot(variant, stage, gated=True):
    name = NAMESPACE + '-' + variant
    assert not did(name)['State']['Running']
    assert not tcp(PORTAL_PORT)
    pre_fence = assert_fenced() if gated else None
    begin = time.monotonic()
    docker('start', name)
    observations = []
    def observe():
        elapsed = round(time.monotonic() - begin, 3)
        listening = tcp(PORTAL_PORT)
        # While loopback has no listener, there is no need to proxy each unsuccessful sample.
        status = request('/readyz')[0] if listening else None
        if not observations or (listening,status) != (observations[-1]['tcp'],observations[-1]['readiness']):
            observations.append({'seconds':elapsed, 'tcp':listening, 'readiness':status})
        if not did(name)['State']['Running']:
            raise RuntimeError(log(name, stage+'.log')[-4500:])
        return status == 200
    wait(observe, 420)
    assert observations[0]['tcp'] is False and observations[-1]['readiness'] == 200, observations
    if gated:
        assert pre_fence == assert_fenced() == 503
    expect('/healthz',200)
    wait(lambda: did(name)['State']['Health']['Status'] == 'healthy', 65, 1)
    output = log(name, stage + '.log')
    assert f'WSU {variant.capitalize()} host ready' in output, output[-400:]
    status = did(name)
    evidence = {'observations': observations, 'health': 200, 'dockerHealth': 'healthy', 'publicFence': pre_fence,
                'image': status['Image'], 'owner': status['State']['Pid']}
    if gated:
        assert status['Image'] == image(variant)
        evidence['candidate'] = launch_identity(status)
    return evidence


def stop(variant, filename):
    name = NAMESPACE + '-' + variant
    assert did(name)['State']['Running']
    docker('stop', '-t', '65', name, seconds=72)
    state = did(name)['State']
    output = log(name, filename)
    assert state['ExitCode'] == 0 and not state['OOMKilled'] and not state['Running'], (state,output[-1800:])
    assert not tcp(PORTAL_PORT)
    return state['ExitCode']
