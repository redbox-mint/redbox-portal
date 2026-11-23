"""Capture and validate the quiescent source installation."""
import hashlib
import json
import re
import shutil
import tarfile

from lab import (ATTEMPT, CHECKPOINT, CORE, DATABASES, FENCE, HELD_PATH, NAMESPACE, PORTAL_PORT,
                 RUN, SOLR, assert_fenced, container, did, docker, image, launch_identity, provider, receipt, tcp, wait)
from gate import GateClosed, forget, inputs, require_gate, seal, sha_file
from probes import solr_docs

ARCHIVE = 'preceding-wsu-image.tar'
MEMBERS = {
    'agenda-dump.log', 'agenda.archive.gz', 'api1.tgz', 'checkpoint-info.json', 'core-dump.log',
    'core.archive.gz', 'express-base.json', 'express.cjs', 'express.env', 'express.json',
    'local-state.tar.gz', 'mongo-inventory.json', 'mongo-tools-version.txt', ARCHIVE, 's3-objects.json',
    'sessions-dump.log', 'sessions.archive.gz', 'settings.json', 'solr-documents.json', 'solr.tar',
    'source-image-verification.json', 'source-state.json', 'storage-dump.log', 'storage.archive.gz', 'xmlbuilder.tgz',
}


class CheckpointError(RuntimeError):
    pass


def require_stopped_source(expected):
    status = container(NAMESPACE + '-express')
    if (status is None or launch_identity(status) != expected or status['State']['Status'] != 'exited'
            or status['State']['OOMKilled'] or status['State']['ExitCode'] != 0):
        raise GateClosed('drained Express launch no longer matches the stopped source; redo the drain and checkpoint')


def require_drained_source():
    require_stopped_source(require_gate('drain').get('source'))


def inactive_source():
    assert FENCE.is_file()
    assert_fenced()
    require_drained_source()
    assert not tcp(PORTAL_PORT)
    assert container(NAMESPACE + '-fastify') is None


def verify_checkpoint():
    manifest = CHECKPOINT / 'SHA256SUMS'
    if not manifest.is_file() or manifest.is_symlink():
        raise CheckpointError('missing completed checkpoint manifest')
    checksums = {}
    for row in manifest.read_text().splitlines():
        match = re.fullmatch(r'([a-f0-9]{64})  ([a-zA-Z0-9.-]+)', row)
        if match is None or match[2] in checksums:
            raise CheckpointError('invalid or duplicate checkpoint manifest entry')
        checksums[match[2]] = match[1]
    if checksums.keys() != MEMBERS:
        raise CheckpointError('checkpoint manifest does not name the complete required set')
    for name, expected in checksums.items():
        path = CHECKPOINT / name
        if not path.is_file() or path.is_symlink():
            raise CheckpointError(f'missing checkpoint file: {name}')
        if sha_file(path) != expected:
            raise CheckpointError(f'checkpoint checksum mismatch: {name}')
    info = json.loads((CHECKPOINT / 'checkpoint-info.json').read_text())
    if info != {'attemptId': ATTEMPT, 'sourceImage': image('express')}:
        raise CheckpointError('checkpoint belongs to another cutover attempt or source image')
    return sha_file(manifest)


def verify_source_archive(path=None, installed=None):
    if path is None:
        path = CHECKPOINT / ARCHIVE
    if installed is None:
        installed = json.loads((RUN / 'components/express.json').read_text())[0]
    with tarfile.open(path) as archive:
        manifest = json.load(archive.extractfile('manifest.json'))
        assert len(manifest) == 1
        record = manifest[0]
        config = json.load(archive.extractfile(record['Config']))
        assert (config['os'], config['architecture']) == ('linux', 'arm64')
        assert config['rootfs']['diff_ids'] == installed['RootFS']['Layers']
        assert config['config']['Cmd'] == installed['Config']['Cmd']
        assert len(record['Layers']) == len(installed['RootFS']['Layers'])
        for blob in [record['Config'], *record['Layers']]:
            assert re.fullmatch(r'blobs/sha256/[a-f0-9]{64}', blob), blob
            with archive.extractfile(blob) as contents:
                assert hashlib.file_digest(contents, 'sha256').hexdigest() == blob.rsplit('/', 1)[1], blob
    return {'platform': 'linux/arm64', 'layers': len(record['Layers']), 'bytes': path.stat().st_size,
            'sha256': sha_file(path), 'sourceManifest': installed['Id'], 'completePayload': True}


def checkpoint():
    forget('checkpoint-ready')
    inactive_source()
    checked = inputs('checkpoint-ready', pending=('checkpoint/SHA256SUMS',))
    assert not any(CHECKPOINT.iterdir()), 'preserve the failed checkpoint, then create a new empty directory'
    inventory = provider('inventory')
    session_count = sum(item['count'] for item in inventory['sessions']['collections'])
    assert session_count >= 2
    if not require_gate('drain').get('alreadyFenced'):
        assert session_count == 2
    receipt('checkpoint/mongo-inventory', inventory)
    source = json.loads(HELD_PATH.read_text())
    objects = provider('objects')
    assert len(objects) == len(source['attachments'])
    assert {item['sha256'] for item in objects} == {item['sha256'] for item in source['attachments']}
    receipt('checkpoint/s3-objects', objects)
    solr = solr_docs(source['records'][:2])
    assert solr is not None
    receipt('checkpoint/solr-documents', solr)
    for name, (service, database) in DATABASES.items():
        status = docker('exec', service, 'mongodump', '--db', database, '--archive', '--gzip', seconds=180,
                        output=f'checkpoint/{name}.archive.gz')
        (CHECKPOINT / f'{name}-dump.log').write_bytes(status.stderr)
        assert (CHECKPOINT / f'{name}.archive.gz').stat().st_size > 32
    docker('exec', CORE, 'mongodump', '--version', output='checkpoint/mongo-tools-version.txt')
    with tarfile.open(CHECKPOINT / 'local-state.tar.gz', 'w:gz') as output:
        output.add(RUN / 'state', arcname='state')
    did(SOLR)
    docker('stop', '-t', '35', SOLR, seconds=44)
    try:
        docker('cp', f'{SOLR}:/var/solr/data', '-', seconds=180, output='checkpoint/solr.tar')
    finally:
        docker('start', SOLR)
    assert wait(lambda: solr_docs(source['records'][:2]), 60, 1) == solr
    source_tag = f'redbox-{NAMESPACE}-express:wsu'
    assert docker('image', 'inspect', source_tag, '--format', '{{.Id}}').stdout.decode().strip() == image('express')
    docker('image', 'save', '--platform', 'linux/arm64', '-o', CHECKPOINT / ARCHIVE, source_tag, seconds=600)
    receipt('checkpoint/source-image-verification', verify_source_archive())
    for name in ('source-state.json', 'express.cjs', 'express.env', 'settings.json', 'components/express.json',
                 'components/express-base.json', 'components/api1.tgz', 'components/xmlbuilder.tgz'):
        shutil.copy2(RUN / name, CHECKPOINT)
    receipt('checkpoint/checkpoint-info', {'attemptId': ATTEMPT, 'sourceImage': image('express')})
    assert set(path.name for path in CHECKPOINT.iterdir()) == MEMBERS
    manifest = CHECKPOINT / 'SHA256SUMS.pending'
    manifest.write_text(''.join(f'{sha_file(CHECKPOINT / name)}  {name}\n' for name in sorted(MEMBERS)))
    manifest.replace(CHECKPOINT / 'SHA256SUMS')
    assert_fenced()
    checked['checkpoint/SHA256SUMS'] = verify_checkpoint()
    require_drained_source()
    seal('checkpoint-ready', checked)
