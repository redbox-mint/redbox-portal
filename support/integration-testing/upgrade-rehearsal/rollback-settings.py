#!/usr/bin/env python3
"""Import the disposable FM-049 handoff into a clean FM-050 attempt directory."""
import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import urllib.parse
from pathlib import Path

sys.dont_write_bytecode = True

from settings import setup


def read_env(path):
    return dict(line.split('=', 1) for line in path.read_text().splitlines())


def configure(args):
    run, source = args.directory.resolve(), args.handoff.resolve()
    checkpoint = source / 'checkpoint'
    checksum_file = checkpoint / 'SHA256SUMS'
    checksum = hashlib.sha256(checksum_file.read_bytes()).hexdigest()
    assert checksum == args.checkpoint_sha256, 'handoff manifest differs from the recorded checksum'

    settings = setup(run, args.namespace, args.base_port)
    original = json.loads((checkpoint / 'settings.json').read_text())
    express_env = read_env(checkpoint / 'express.env')
    bucket = express_env['HOOK_S3_BUCKET']
    data_namespace = 'fm049' if bucket == 'fm049-wsu-disposable' else bucket
    assert re.fullmatch(r'fm049(?:-[a-z][a-z0-9-]{0,19})?', data_namespace)
    old_port = int(express_env['REDBOX_PORT'])
    s3_url = urllib.parse.urlsplit(express_env['HOOK_S3_ENDPOINT'])
    assert s3_url.scheme == 'http' and s3_url.hostname == '127.0.0.1'
    old_base = s3_url.port - 3
    assert express_env['REDBOX_PUBLIC_URL'] == original['origin']
    assert express_env['REDBOX_SESSION_SECRET'] == original['expressSecret']

    shutil.copytree(checkpoint, run / 'checkpoint', dirs_exist_ok=True)
    settings.update(mode=args.mode, checkpointSha256=checksum, dataNamespace=data_namespace, s3Bucket=bucket,
                    bearer=original['bearer'], researcherPassword=original['researcherPassword'])
    for name in ('fastify-session.json', 'smoke-api-auth-upload.json'):
        shutil.copyfile(source / name, run / ('handoff-' + name))
    if args.mode == 'live':
        pack = run / 'components/wsu.tgz'
        shutil.copyfile(args.wsu_pack, pack)
        with pack.open('rb') as contents:
            pack_checksum = hashlib.file_digest(contents, 'sha256').hexdigest()
        assert pack_checksum == args.wsu_pack_sha256, 'WSU package differs from its qualification receipt'
        settings['wsuPackSha256'] = pack_checksum
        for name in ('fastify.cjs', 'fastify.env'):
            shutil.copyfile(source / name, run / ('handoff-' + name))
        assert read_env(run / 'handoff-fastify.env')['HOOK_S3_BUCKET'] == bucket
        shutil.copytree(source / 'state', run / 'state', dirs_exist_ok=True)
    else:
        live = args.live_run.resolve()
        live_settings = json.loads((live / 'settings.json').read_text())
        delta = json.loads((live / 'r5-writes.json').read_text())
        assert live_settings['mode'] == 'live' and delta['attemptId'] == live_settings['attemptId']
        assert live_settings['checkpointSha256'] == checksum
        assert delta['inputs']['r5-sessions.json'] == hashlib.sha256((live / 'r5-sessions.json').read_bytes()).hexdigest()
        for name in ('r5-writes.json', 'r5-sessions.json'):
            shutil.copyfile(live / name, run / ('paired-' + name))
    (run / 'settings.json').write_text(json.dumps(settings, indent=2) + '\n')

    for variant, saved in [('express', checkpoint / 'express.cjs'), ('fastify', run / 'handoff-fastify.cjs')]:
        if not saved.exists():
            continue
        text = saved.read_text()
        assert text.startswith('module.exports = ') and text.rstrip().endswith(';')
        config = json.loads(text.removeprefix('module.exports = ').rstrip().removesuffix(';'))
        assert config['server']['publicUrl'] == original['origin'] and config['server']['port'] == old_port
        config['server'].update(port=args.base_port + 4, publicUrl=settings['origin'])
        table = (('mongodb', 'url', 0, ''), ('redboxStorage', 'url', 1, '_storage'))
        database = 'sr_wsu_' + data_namespace.replace('-', '_')

        def relocate(url, offset, suffix):
            assert url == f'mongodb://127.0.0.1:{old_base + offset}/{database}{suffix}'
            return f'mongodb://127.0.0.1:{args.base_port + offset}/{database}{suffix}'

        for store, key, offset, suffix in table:
            config['datastores'][store][key] = relocate(config['datastores'][store][key], offset, suffix)
        agenda = config['agendaQueue']['options']
        agenda['db'] = relocate(agenda['db'], 0, '_agenda')
        session = config['redboxSession']
        session['mongoUrl'] = relocate(session['mongoUrl'], 0, '_sessions')
        if variant == 'express':
            session['name'] = 'wsu.rollback.fm050.sid'
        solr = config['solr']['cores']['default']['options']
        assert solr['port'] == old_base + 2
        solr['port'] = args.base_port + 2
        (run / f'{variant}.cjs').write_text('module.exports = ' + json.dumps(config, indent=2) + ';\n')
    (run / 'gate/maintenance').touch()


if __name__ == '__main__':
    if not __debug__:
        raise SystemExit('Run without Python optimization.')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('namespace')
    parser.add_argument('base_port', type=int)
    parser.add_argument('mode', choices=('live', 'restore'))
    parser.add_argument('handoff', type=Path)
    parser.add_argument('--checkpoint-sha256', required=True)
    parser.add_argument('--live-run', type=Path)
    parser.add_argument('--wsu-pack', type=Path)
    parser.add_argument('--wsu-pack-sha256')
    args = parser.parse_args()
    assert args.namespace.startswith('fm050-')
    if (args.mode == 'restore') != (args.live_run is not None):
        parser.error('supply --live-run only in restore mode')
    if args.mode == 'live' and not (args.wsu_pack and args.wsu_pack_sha256):
        parser.error('live mode requires the qualified API2 --wsu-pack and --wsu-pack-sha256')
    if args.mode == 'restore' and (args.wsu_pack or args.wsu_pack_sha256):
        parser.error('supply an API2 package only in live mode')
    os.umask(0o077)
    configure(args)
