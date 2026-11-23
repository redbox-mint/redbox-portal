"""Verify and restore the artifacts and durable stores used by FM-050."""
import io
import json
import re
import shutil
import subprocess
import tarfile

from checkpoint import ARCHIVE, MEMBERS, CheckpointError, verify_source_archive
from gate import sha_file
from lab import (ATTEMPT, CHECKPOINT, DATABASES, DATA_NAMESPACE, HERE, MONGO, NAMESPACE, RUN, SETTINGS,
                 SOLR, VOLUMES, docker, provider, receipt, remove_job, services, wait)

R5_INDEX = 'redbox-fm044@sha256:28898f254d52fcbcfc71ed1bebb0c39726ee089e992b643f7303ed1ca581080a'
R5_ARM64 = 'sha256:6ea446bc51e6aaab6bad0676934146c6b4fb77932b1448f7120130c1547d3d5b'
EXPRESS_INDEX = 'sha256:238f9ce44924caf1a2eb794a4e060e150acb507f4ec0fa9b55c96684c7d8598a'
EXPRESS_IMAGE = 'redbox-fm049-express:wsu'
RECOVERED_IMAGE = f'redbox-{NAMESPACE}-express:recovered'
CORRECTED_WSU = f'redbox-{NAMESPACE}-fastify:wsu'
MODE = SETTINGS['mode']


def checkpoint_integrity():
    path = CHECKPOINT / 'SHA256SUMS'
    if not path.is_file() or path.is_symlink() or sha_file(path) != SETTINGS['checkpointSha256']:
        raise CheckpointError('checkpoint manifest differs from the selected handoff')
    entries = {}
    for line in path.read_text().splitlines():
        match = re.fullmatch(r'([a-f0-9]{64})  ([a-zA-Z0-9.-]+)', line)
        if not match or match[2] in entries:
            raise CheckpointError('invalid checkpoint manifest entry')
        entries[match[2]] = match[1]
    if entries.keys() not in (MEMBERS, MEMBERS - {'checkpoint-info.json'}):
        raise CheckpointError('checkpoint manifest does not cover the required recovery inputs')
    for name, checksum in entries.items():
        file = CHECKPOINT / name
        if not file.is_file() or file.is_symlink() or sha_file(file) != checksum:
            raise CheckpointError(f'checkpoint member missing or changed: {name}')
    return {'manifestSha256': sha_file(path), 'members': len(entries)}


def inspect_image(ref):
    return json.loads(docker('image', 'inspect', '--platform', 'linux/arm64', ref).stdout)[0]


def runtime_image(ref):
    return docker('image', 'inspect', ref, '--format', '{{.Id}}').stdout.decode().strip()


def require_same_image(actual, archived):
    assert actual['Architecture'] == archived['Architecture'] == 'arm64'
    assert actual['Os'] == archived['Os'] == 'linux'
    assert actual['RootFS'] == archived['RootFS']
    assert actual['Config'] == archived['Config']


def retag_archive(source, output):
    """Relabel the Docker/OCI wrappers so load cannot replace the retained tag."""
    with tarfile.open(source) as archive, tarfile.open(output, 'w') as target:
        for member in archive:
            stream = archive.extractfile(member) if member.isfile() else None
            if member.name in ('index.json', 'manifest.json'):
                data = json.load(stream)
                if member.name == 'index.json':
                    manifest, = data['manifests']
                    manifest['annotations']['io.containerd.image.name'] = 'docker.io/library/' + RECOVERED_IMAGE
                    manifest['annotations']['org.opencontainers.image.ref.name'] = 'recovered'
                else:
                    manifest, = data
                    manifest['RepoTags'] = [RECOVERED_IMAGE]
                payload = json.dumps(data).encode()
                member.size = len(payload)
                stream = io.BytesIO(payload)
            else:
                assert member.isdir() or re.fullmatch(r'blobs/sha256/[a-f0-9]{64}|oci-layout', member.name)
            target.addfile(member, stream)


def independent_load():
    name = NAMESPACE + '-image-proof'
    script = '''
export DOCKER_HOST=unix:///tmp/proof.sock
dockerd --host="$DOCKER_HOST" --data-root=/store --exec-root=/tmp/exec --pidfile=/tmp/proof.pid \
  --bridge=none --iptables=false --ip6tables=false --ip-forward=false --ip-masq=false \
  --storage-driver=overlayfs --feature containerd-snapshotter=true >/tmp/dockerd.log 2>&1 &
for trial in {1..25}; do
  if docker info >/dev/null 2>&1; then break; fi
  sleep 1
done
test "$(docker info --format '{{.DockerRootDir}}')" = /store || { cat /tmp/dockerd.log >&2; exit 1; }
test -z "$(docker image ls -aq)"
echo 'Independent Docker store /store: zero images before load' >&2
docker image load -i /archive.tar >&2
docker image inspect --platform linux/arm64 "$1"
'''
    with tarfile.open(CHECKPOINT / ARCHIVE) as archive:
        tags = json.load(archive.extractfile('manifest.json'))[0]['RepoTags']
    tag, = tags
    try:
        result = docker('run', '--pull=never', '--rm', '--name', name, '--privileged', '--network=none',
                        '--mount', 'type=bind,src=/usr,dst=/usr,readonly',
                        '--mount', 'type=volume,dst=/store',
                        '--mount', f'type=bind,src={CHECKPOINT / ARCHIVE},dst=/archive.tar,readonly',
                        '--entrypoint', '/bin/bash', MONGO, '-ec', script, 'bash', tag,
                        seconds=300, validate=False)
        (RUN / 'independent-image-load.log').write_bytes(result.stderr)
        result.check_returncode()
        return json.loads(result.stdout)[0]
    finally:
        remove_job(name)


def stage_images():
    proof = checkpoint_integrity()
    archived = json.loads((CHECKPOINT / 'express.json').read_text())[0]
    archive = verify_source_archive(CHECKPOINT / ARCHIVE, archived)
    if MODE == 'restore':
        assert docker('image', 'inspect', RECOVERED_IMAGE, validate=False).returncode != 0
        independent = independent_load()
        require_same_image(independent, archived)
        # The second import supplies the application container's image on the working engine.
        retag_archive(CHECKPOINT / ARCHIVE, RUN / 'recovery-image.tar')
        loaded = docker('image', 'load', '-i', RUN / 'recovery-image.tar', seconds=240)
        (RUN / 'working-image-load.log').write_bytes(loaded.stdout + loaded.stderr)
        assert f'Loaded image: {RECOVERED_IMAGE}' in loaded.stdout.decode()
        express = inspect_image(RECOVERED_IMAGE)
        express_id = runtime_image(RECOVERED_IMAGE)
        proof.update(independentImage=independent['Id'], independentEmptyStore=True,
                     recoveryArchiveSha256=sha_file(RUN / 'recovery-image.tar'))
    else:
        express = inspect_image(EXPRESS_IMAGE)
        express_id = runtime_image(EXPRESS_IMAGE)
        base = inspect_image(R5_INDEX)
        assert express_id == EXPRESS_INDEX and base['Id'] == R5_ARM64
        assert runtime_image('redbox-fm044:r5-980c2f3a1e') == R5_INDEX.split('@', 1)[1]
        pack = RUN / 'components/wsu.tgz'
        assert sha_file(pack) == SETTINGS['wsuPackSha256']
        shutil.copyfile(CHECKPOINT / 'xmlbuilder.tgz', RUN / 'components/xmlbuilder.tgz')
        assert docker('image', 'inspect', CORRECTED_WSU, validate=False).returncode != 0
        build = docker('build', '--pull=false', '--network=none', '--platform=linux/arm64',
                       '-f', HERE / 'wsu-deployment.Dockerfile', '-t', CORRECTED_WSU, RUN / 'components',
                       seconds=180, validate=False)
        (RUN / 'wsu-image-build.log').write_bytes(build.stdout + build.stderr)
        build.check_returncode()
        corrected = inspect_image(CORRECTED_WSU)
        corrected_id = runtime_image(CORRECTED_WSU)
        assert corrected['RootFS']['Layers'][:-1] == base['RootFS']['Layers']
        assert corrected['Config']['Cmd'] == archived['Config']['Cmd']
        assert corrected['Config']['User'] == base['Config']['User']
        assert corrected['Config']['Healthcheck'] == base['Config']['Healthcheck']
        (RUN / 'components/fastify.iid').write_text(corrected_id + '\n')
        proof.update(r5Index=R5_INDEX, r5Platform=base['Id'], r5WsuManifest=corrected['Id'], r5WsuImage=corrected_id,
                     wsuPackSha256=sha_file(pack), recipeSha256=sha_file(HERE / 'wsu-deployment.Dockerfile'))
    require_same_image(express, archived)
    (RUN / 'components/express.iid').write_text(express_id + '\n')
    return dict(proof, archive=archive, archivedImage=archived['Id'], expressManifest=express['Id'], expressImage=express_id)


def copy_volumes():
    for service, destination in VOLUMES.items():
        role = service.removeprefix(NAMESPACE + '-')
        source = f'{DATA_NAMESPACE}-{role}-data'
        docker('volume', 'inspect', source)
        running = docker('ps', '-q', '--filter', 'volume=' + source).stdout
        assert not running.strip(), f'{source} is still in use by a running container'
        name = f'{NAMESPACE}-copy-{role}'
        try:
            docker('run', '--pull=never', '--rm', '--name', name, '--network=none', '--user', '0',
                   '--mount', f'type=volume,src={source},dst=/source,readonly',
                   '--mount', f'type=volume,src={destination},dst=/target',
                   '--entrypoint', '/bin/bash', MONGO, '-ec',
                   'test -z "$(ls -A /target)" && cp -a /source/. /target/', seconds=120)
        finally:
            remove_job(name)


def seed_solr():
    name = NAMESPACE + '-restore-solr'
    try:
        docker('run', '--pull=never', '--rm', '--name', name, '--network=none', '--user', '0',
               '--mount', f'type=volume,src={VOLUMES[SOLR]},dst=/target',
               '--mount', f'type=bind,src={CHECKPOINT / "solr.tar"},dst=/solr.tar,readonly',
               '--entrypoint', '/bin/bash', MONGO, '-ec',
               'test -z "$(ls -A /target)" && tar --extract --file=/solr.tar --directory=/target && chown -R 8983:8983 /target',
               seconds=90)
    finally:
        remove_job(name)


def restore_targets():
    services(seed_solr)
    initial = provider('inventory')
    assert all(not db['collections'] for db in initial.values()), 'MongoDB restore targets are not empty'
    for store, (container, db) in DATABASES.items():
        with (CHECKPOINT / f'{store}.archive.gz').open('rb') as archive:
            result = subprocess.run(['timeout', '--kill-after=5s', '100s', 'docker', 'exec', '-i', container,
                                     'mongorestore', '--archive', '--gzip', '--nsInclude', db + '.*', '--stopOnError'],
                                    stdin=archive, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        (RUN / f'restore-{store}.log').write_bytes(result.stdout)
        result.check_returncode()
    assert provider('inventory') == json.loads((CHECKPOINT / 'mongo-inventory.json').read_text())
    with tarfile.open(CHECKPOINT / 'local-state.tar.gz') as archive:
        assert all(member.name == 'state' or member.name.startswith('state/') for member in archive)
        archive.extractall(RUN, filter='data')

    def bucket_ready():
        try:
            provider('bucket')
            return True
        except RuntimeError:
            return False
    wait(bucket_ready, 45, 1)
    provider('restore-objects', input_file='checkpoint/s3-objects.json')
    assert provider('objects') == json.loads((CHECKPOINT / 's3-objects.json').read_text())
    receipt('restore-clean-targets', {'attemptId': ATTEMPT, 'mongoBeforeRestore': initial,
                                      'mongoArchives': list(DATABASES), 's3TargetWasEmpty': True})
