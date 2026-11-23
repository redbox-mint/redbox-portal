#!/usr/bin/env python3
"""Create one isolated WSU rehearsal configuration and resource namespace."""
import argparse
import ipaddress
import json
import os
import re
import secrets
import subprocess
import uuid
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path, help='existing empty directory for this run')
    parser.add_argument('namespace', help='unique Docker resource prefix starting with fm049-')
    parser.add_argument('base_port', type=int, help='first of six consecutive local ports')
    args = parser.parse_args()
    run, prefix, base = args.directory.resolve(), args.namespace, args.base_port
    if not re.fullmatch(r'fm049-[a-z][a-z0-9-]{0,19}', prefix):
        parser.error('invalid namespace')
    if not 1024 <= base <= 65530 or set(range(base, base+6)) & {1500, 49740, 49741, 49742, 49743, 49749}:
        parser.error('base port conflicts with reserved ports or falls outside the allowed range')
    if not run.is_dir() or any(run.iterdir()):
        parser.error('select an existing empty run directory')
    run.chmod(0o700)
    os.umask(0o077)
    tailscale = json.loads(subprocess.check_output(['timeout', '10s', 'tailscale', 'status', '--json']))
    dns = tailscale['Self']['DNSName'].rstrip('.')
    assert re.fullmatch(r'[a-z0-9.-]+\.ts\.net', dns), dns
    ip = next(str(ipaddress.ip_address(value)) for value in tailscale['Self']['TailscaleIPs'] if ':' not in value)
    core, storage, solr, s3, portal, proxy = range(base, base+6)
    db = 'sr_wsu_' + prefix.replace('-', '_')
    origin = f'http://{dns}:{proxy}'
    settings = {
        'attemptId': uuid.uuid4().hex, 'namespace': prefix, 'basePort': base, 'origin': origin,
        'operator': secrets.token_hex(32), 'bearer': secrets.token_hex(32),
        'researcherPassword': secrets.token_urlsafe(32), 'expressSecret': secrets.token_hex(32),
    }
    for directory in ('gate', 'checkpoint', 'components', 'state/staging', 'state/figshare', 'state/publications'):
        (run / directory).mkdir(parents=True)
    (run / 'settings.json').write_text(json.dumps(settings, indent=2) + '\n')
    (run / 'origin.txt').write_text(origin + '\n')

    common = {
        'server': {'hostname': '127.0.0.1', 'port': portal, 'publicUrl': origin,
                   'rootContext': '', 'trustProxy': ['127.0.0.1'], 'stopDeadlineMs': 45000},
        'datastores': {
            'mongodb': {'url': f'mongodb://127.0.0.1:{core}/{db}'},
            'redboxStorage': {'url': f'mongodb://127.0.0.1:{storage}/{db}_storage'},
        },
        'agendaQueue': {'options': {'db': f'mongodb://127.0.0.1:{core}/{db}_agenda', 'processEvery': '1 second'}},
        'redboxSession': {'mongoUrl': f'mongodb://127.0.0.1:{core}/{db}_sessions', 'cookie': {'secure': False}},
        'brandingConfigurationDefaults': {'auth': {'active': ['local']}},
        'recordSchema': {'enabled': True},
        'vocab': {'bootstrapRvaImports': False, 'bootstrapFigshareImports': False},
        'companion': {'enabled': False}, 'csp': {'extras': []}, 'i18n': {'debug': False},
        'solr': {'clientSleepTimeMillis': 0,
                 'cores': {'default': {'options': {'host': '127.0.0.1', 'port': solr, 'core': 'redbox'}}}},
        'custom': {'wsu': {'publicationsPath': '/fm049-state/publications'}},
        'storage': {'disks': {
            'staging': {'driver': 'fs', 'config': {'root': '/fm049-state/staging'}},
            'figshare-staging': {'driver': 'fs', 'config': {'root': '/fm049-state/figshare'}},
        }},
    }
    for variant in ('express', 'fastify'):
        common['redboxSession']['name'] = f'wsu.{variant}.fm049.sid'
        (run / f'{variant}.cjs').write_text('module.exports = ' + json.dumps(common, indent=2) + ';\n')

    (run / 'proxy.conf').write_text('''
worker_processes 1;
events { worker_connections 256; }
http {
    map_hash_bucket_size 128;
    access_log /dev/stdout;
    error_log /dev/stderr warn;
    map $http_upgrade $connection_upgrade { default upgrade; '' close; }
    map $cookie_fm049_operator $operator { default 0; OPERATOR 1; }
    server {
        listen IP:PROXY_PORT;
        server_name DNS;
        client_max_body_size 110m;
        location = /_fm049/access/OPERATOR {
            access_log off;
            add_header Set-Cookie "fm049_operator=OPERATOR; Path=/; HttpOnly; SameSite=Strict";
            return 204;
        }
        location / {
            set $fence 0;
            if (-f /fm049-gate/maintenance) { set $fence 1; }
            if ($operator = 1) { set $fence 0; }
            if ($fence = 1) { return 503; }
            proxy_http_version 1.1;
            proxy_request_buffering off;
            proxy_set_header Host $http_host;
            proxy_set_header X-Forwarded-Host $http_host;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-For $remote_addr;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_pass http://127.0.0.1:PORTAL_PORT;
        }
    }
}
'''.replace('OPERATOR', settings['operator']).replace('IP:PROXY_PORT', f'{ip}:{proxy}')
        .replace('DNS', dns).replace('PORTAL_PORT', str(portal)))
    print(f'{prefix} at {origin}')


if __name__ == '__main__':
    main()
