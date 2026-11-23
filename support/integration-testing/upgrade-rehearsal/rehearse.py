#!/usr/bin/env python3
"""Run the ordered WSU v6 upgrade with the public proxy fenced."""
import argparse
import fcntl
import hashlib
import http.client
import json
import os
import secrets
import sys
import uuid

sys.dont_write_bytecode = True

from checkpoint import (MEMBERS, CheckpointError, checkpoint, inactive_source,
                        require_drained_source, require_stopped_source, verify_checkpoint)
from gate import SCREENSHOTS, GateClosed, forget, inputs, read, require_gate, seal, sha_file
from lab import (ATTEMPT, CHECKPOINT, FENCE, HELD_PATH, LOGINS, NAMESPACE, ORIGIN,
                 PREFIX, RUN, SETTINGS, VOLUMES, PROXY, S3, SOLR, STORAGE, CORE,
                 assert_fenced, boot, candidate, config_args, container, did, docker, expect,
                 image, launch_identity, log, maintenance, preload, prepare_source, provider, receipt, request, services, set_env,
                 stop, timed, utc, wait)
from probes import assert_wsu_route, browser_http, download, expect_user, login, record_read, seed, solr_docs, upload, verify_uploaded


def drain_admitted_upload(record):
    assert not any(p.is_file() for p in (RUN/'state/staging').rglob('*'))
    data = bytes(range(256)) * 4096
    sock, rest, etag = upload(record,'fm049-drained.bin', data, hold=True)
    try:
        stage = wait(lambda: [str(p.relative_to(RUN/'state')) for p in (RUN/'state/staging').rglob('*') if p.is_file() and p.stat().st_size > 0], 15)
        FENCE.touch(exist_ok=False)
        assert_fenced()
        assert did(NAMESPACE + '-express')['State']['Running']
        sock.sendall(rest)
        response = http.client.HTTPResponse(sock)
        response.begin()
        return verify_uploaded(record,(response.status,response.headers,response.read()),data,etag), stage
    finally:
        sock.close()


def recover_attachments(previous):
    attachments = {}
    for obj in provider('objects'):
        prefix, oid, file_id = obj['key'].split('/')
        assert prefix == 'attachments' and oid and file_id
        attachments[oid, file_id] = {'oid': oid, 'fileId': file_id, 'bytes': obj['bytes'], 'sha256': obj['sha256']}
    for attachment in previous:
        key = (attachment['oid'], attachment['fileId'])
        assert all(attachments[key][field] == attachment[field] for field in ('bytes', 'sha256'))
        attachments[key] = attachment
    return list(attachments.values())


def drain():
    already_fenced = FENCE.exists()
    forget('drain', fence=already_fenced)
    checked = inputs('drain', pending=('source-state.json',))
    source_bytes = HELD_PATH.read_bytes()
    source = json.loads(source_bytes)
    express = did(NAMESPACE + '-express')
    assert express['State']['Running'] and express['Image'] == image('express')
    source_launch = launch_identity(express)
    expect('/readyz', 200, operator=already_fenced)
    transfer, stage = None, []
    if already_fenced:
        assert_fenced()
        staged = container(NAMESPACE + '-fastify')
        if staged:
            assert staged['State']['Status'] in {'created', 'exited'}, 'stop the candidate before re-draining Express'
            docker('rm', staged['Id'])
    else:
        transfer, stage = drain_admitted_upload(source['records'][1])
        source['attachments'].append(transfer)
    exit_code = stop('express', 'express-drained.log')
    require_stopped_source(source_launch)
    if already_fenced:
        source['attachments'] = recover_attachments(source['attachments'])
    assert HELD_PATH.read_bytes() == source_bytes
    receipt('source-state', source)
    checked['source-state.json'] = sha_file(HELD_PATH)
    stage_after = [str(p.relative_to(RUN/'state')) for p in (RUN/'state/staging').rglob('*') if p.is_file()]
    assert stage_after == []
    assert_fenced()
    require_stopped_source(source_launch)
    seal('drain', checked, source=source_launch, upload=transfer, stagedBeforeFence=stage, stagedAfterStop=stage_after,
         alreadyFenced=already_fenced, newPublicTraffic=503, exitCode=exit_code)


def deploy():
    forget('candidate-deploy')
    inactive_source()
    checked = inputs('candidate-deploy')
    checkpoint_proof = require_gate('checkpoint-ready')
    manifest = verify_checkpoint()
    assert manifest == checkpoint_proof['inputs']['checkpoint/SHA256SUMS']
    base = read('components/fastify-base')[0]['Id']
    assert base == 'sha256:6ea446bc51e6aaab6bad0676934146c6b4fb77932b1448f7120130c1547d3d5b'
    require_drained_source()
    seal('candidate-deploy', checked, base=base, installedImage=image('fastify'), checkpointManifest=manifest)


def invalidate():
    forget('session-cutover', 'candidate-indexes')
    inactive_source()
    deployment = require_gate('candidate-deploy')
    assert deployment['installedImage'] == image('fastify')
    assert deployment['checkpointManifest'] == verify_checkpoint()
    secret = secrets.token_hex(32)
    assert secret != SETTINGS['expressSecret']
    set_env('fastify', secret)
    checked = inputs('session-cutover')
    receipt('candidate-indexes', {'inspect':maintenance('fastify','inspect',0)})
    created = docker('create', '--pull=never', '--name', NAMESPACE + '-fastify', *config_args('fastify'), image('fastify'))
    seal('session-cutover', checked, candidate={'containerId': created.stdout.decode().strip(), 'image': image('fastify')},
         rootRotated=True, previousRootRetainedForVerification=False, sourceCookie='wsu.express.fm049.sid',
         targetCookie='wsu.fastify.fm049.sid', storeChanged=False)


def readiness():
    forget('candidate-startup')
    checked = inputs('candidate-startup')
    selected = require_gate('session-cutover')['candidate']
    staged = did(NAMESPACE + '-fastify')
    assert selected == {'containerId': staged['Id'], 'image': staged['Image']}
    result = boot('fastify', 'candidate-startup')
    seal('candidate-startup', checked, **result)


def smoke():
    forget('smoke-api-auth-upload')
    assert_fenced()
    binding = candidate()
    require_gate('candidate-startup', binding)
    checked = inputs('smoke-api-auth-upload', pending=('fastify-session.json',))
    source = json.loads(HELD_PATH.read_text())
    old = source['users']
    for cookies in old.values():
        expect(PREFIX + '/user/info',403,headers={'Cookie':cookies})
        expect(PREFIX + '/user/info',403,headers={'Cookie':cookies.replace('wsu.express.fm049.sid=', 'wsu.fastify.fm049.sid=',1)})
    renewed = {name:login(name,'fastify') for name in LOGINS}
    result = {'oldCookieDenied':len(old),'renamedOldCookieDenied':len(old),'newLoginCount':len(renewed),
              'records':[],'retainedAttachments':[],'publicFence':503}
    for record in source['records']:
        record_read(record)
        _, workflows = expect(PREFIX + '/record/wfSteps/' + record['type'],200,headers={'Cookie':renewed['admin']})
        assert len(json.loads(workflows)) > 0
        result['records'].append({'type':record['type'],'oid':record['oid'],'metadata':200,'workflow':200})
    for attachment in source['attachments']:
        download(attachment)
        result['retainedAttachments'].append(attachment)
    result['solr'] = wait(lambda: solr_docs(source['records'][:2]), 10)
    result['wsuLatestPdfRoute'] = assert_wsu_route(source['records'][0], renewed['admin'])
    result['recordPage'] = browser_http(source['records'][1], renewed['admin'])
    result['upload'] = upload(source['records'][1], 'fm049-fastify-smoke.bin', b'Fastify cutover smoke checked\n' * 304)
    assert_fenced()
    assert candidate() == binding
    receipt('fastify-session', renewed)
    checked['fastify-session.json'] = sha_file(RUN / 'fastify-session.json')
    seal('smoke-api-auth-upload', checked, candidate=binding, **result)


def same_container(first, second):
    return all(first[key] == second[key] for key in ('containerId', 'image'))


def api_smoke(binding):
    smoke = require_gate('smoke-api-auth-upload')
    if not same_container(smoke['candidate'], binding):
        raise GateClosed('API smoke belongs to another attempt or candidate')
    assert smoke['oldCookieDenied'] == smoke['renamedOldCookieDenied'] == smoke['newLoginCount'] == 2
    assert len(smoke['records']) == 5 and smoke['upload']['http'] == 200
    assert smoke['retainedAttachments'] == read('source-state')['attachments']
    return smoke


class InjectedSessionFailure(RuntimeError):
    pass


def restart(*, inject_session_failure=False):
    forget('candidate-restart-result', 'candidate-restart-readiness', 'restart-control-readiness')
    assert_fenced()
    previous = candidate()
    smoke = api_smoke(previous)
    launch_inputs = inputs('candidate-restart-readiness')
    checked = inputs('candidate-restart-result', pending=('candidate-restart-readiness.json',))
    stage = 'restart-control' if inject_session_failure else 'candidate-restart'
    exit_code = stop('fastify', stage + '-stop.log')
    result = boot('fastify', stage + '-readiness')
    current = candidate()
    assert same_container(previous, current) and previous['startedAt'] != current['startedAt']
    assert result['candidate'] == current
    if inject_session_failure:
        receipt('restart-control-readiness', result)
    else:
        seal('candidate-restart-readiness', launch_inputs, **result)
        checked['candidate-restart-readiness.json'] = sha_file(RUN / 'candidate-restart-readiness.json')
    sessions = read('fastify-session')
    assert set(sessions) == set(LOGINS)
    for user, cookie in sessions.items():
        if inject_session_failure:
            name, _ = cookie.split('=', 1)
            status, _, _ = request(PREFIX + '/user/info', headers={'Cookie':name+'=invalid-session-control'})
            assert status == 403, status
            raise InjectedSessionFailure('post-restart session returned HTTP 403 instead of authenticating')
        expect_user(user, cookie)
    download(smoke['upload'])
    assert_fenced()
    assert candidate() == current
    seal('candidate-restart-result', checked, candidate=current, previousStart=previous['startedAt'],
         stopExit=exit_code, authenticatedSessions=sorted(sessions), uploadSha256=smoke['upload']['sha256'])


def browser_start():
    forget('browser-start', 'smoke-browser')
    assert_fenced()
    binding = candidate()
    require_gate('candidate-restart-result', binding)
    checked = inputs('browser-start')
    record = next(value for value in read('source-state')['records'] if value['type'] == 'dataRecord')
    capture = 'browser-' + uuid.uuid4().hex
    (RUN / capture).mkdir()
    seal('browser-start', checked, candidate=binding, record=record, capture=capture, startedUtc=utc())
    print(json.dumps({'origin': ORIGIN, 'record': record, 'capture': str(RUN / capture)}))


def browser_finish():
    forget('smoke-browser')
    assert_fenced()
    binding = candidate()
    start = require_gate('browser-start', binding)
    require_gate('candidate-restart-result', binding)
    capture = start['capture']
    checked = inputs('smoke-browser')
    observation_file = f'{capture}/observation.json'
    observation_bytes = (RUN / observation_file).read_bytes()
    assert hashlib.sha256(observation_bytes).hexdigest() == checked[observation_file]
    observation = json.loads(observation_bytes)
    expected_url = ORIGIN + PREFIX + '/record/edit/' + start['record']['oid']
    if not observation['loginStatus'] == observation['recordStatus'] == 200:
        raise GateClosed('browser login and record navigation must both return 200')
    assert observation['origin'] == ORIGIN and observation['recordUrl'] == expected_url
    assert observation['welcome'] == 'Welcome Local Admin' and observation['existingRecordVisible'] is True
    assert observation['tab'] == 'Dataset Information'
    assert not observation['pageErrors'] and not observation['localErrors']
    for name in SCREENSHOTS:
        path = RUN / capture / name
        with path.open('rb') as buffer:
            assert buffer.read(8) == b'\x89PNG\r\n\x1a\n'
    assert candidate() == binding
    seal('smoke-browser', checked, candidate=binding, startedUtc=start['startedUtc'], finishedUtc=utc(),
         capture=capture, observation=observation)


def open_gate():
    forget('public-gate')
    assert_fenced()
    binding = candidate()
    restart_result = require_gate('candidate-restart-result', binding)
    assert restart_result['stopExit'] == 0 and restart_result['authenticatedSessions'] == sorted(LOGINS)
    smoke = api_smoke(binding)
    assert restart_result['uploadSha256'] == smoke['upload']['sha256']
    readiness = require_gate('candidate-restart-readiness', binding)
    assert readiness['health'] == 200 and readiness['observations'][-1]['readiness'] == 200
    browser = require_gate('smoke-browser', binding)
    assert browser['observation']['existingRecordVisible'] is True
    checked = inputs('public-gate')
    assert verify_checkpoint() == require_gate('checkpoint-ready')['inputs']['checkpoint/SHA256SUMS']
    expect('/readyz', 200)
    expect('/healthz', 200)
    assert candidate() == binding
    require_gate('smoke-browser', binding)
    require_drained_source()
    FENCE.unlink()
    try:
        expect('/readyz', 200, operator=False)
        expect(PREFIX + '/user/login', 200, operator=False)
        assert candidate() == binding
        require_drained_source()
        seal('public-gate', checked, candidate=binding, before=503, after=200, openedUtc=utc())
    except BaseException:
        FENCE.touch()
        raise


def checkpoint_control():
    inactive_source()
    assert not (RUN / 'candidate-deploy.json').exists()
    controls = RUN / ('checkpoint-controls-' + uuid.uuid4().hex)
    controls.mkdir()
    results = {'missing': {}, 'damaged': {}}
    for name in sorted(MEMBERS):
        original = CHECKPOINT / name
        saved = controls / (name + '.original')
        original.rename(saved)
        try:
            for condition, expected in [('missing', 'missing checkpoint file'), ('damaged', 'checkpoint checksum mismatch')]:
                if condition == 'damaged':
                    original.write_bytes(b'Damaged checkpoint file for the deployment gate control.\n')
                try:
                    deploy()
                except CheckpointError as error:
                    assert str(error) == f'{expected}: {name}', error
                    results[condition][name] = str(error)
                else:
                    raise AssertionError(f'deployment accepted {condition} checkpoint file {name}')
                assert not (RUN / 'candidate-deploy.json').exists()
                assert_fenced()
        finally:
            if original.exists():
                original.rename(controls / (name + '.damaged'))
            saved.rename(original)
    verify_checkpoint()
    receipt('checkpoint-control', {'attemptId': ATTEMPT, **results, 'publicStatus': 503})


def require_denial(action, fragment):
    try:
        action()
    except GateClosed as error:
        assert fragment in str(error), error
        assert_fenced()
        assert not (RUN / 'public-gate.json').exists()
        return str(error)
    raise AssertionError(f'{action.__name__} accepted a negative control')


def restart_control():
    assert not (RUN / 'candidate-restart-result.json').exists()
    before = candidate()
    try:
        restart(inject_session_failure=True)
    except InjectedSessionFailure as error:
        rejection = str(error)
    else:
        raise AssertionError('restart accepted a deliberately invalid session')
    current = candidate()
    assert current != before
    result_path = RUN / 'candidate-restart-result.json'
    assert not result_path.exists(), 'failed restart smoke wrote a success receipt'

    results = {'session': rejection, 'missing': require_denial(open_gate, 'missing candidate-restart-result')}
    smoke = api_smoke(current)
    for label, attempt, binding in (
        ('prior-attempt', uuid.uuid4().hex, current),
        ('prior-start', ATTEMPT, before),
        ('other-image', ATTEMPT, {**current, 'image': image('express')}),
        ('other-container', ATTEMPT, {**current, 'containerId': did(NAMESPACE + '-express')['Id']}),
    ):
        receipt('candidate-restart-result', {
            'attemptId': attempt, 'candidate': binding, 'stopExit': 0,
            'authenticatedSessions': sorted(LOGINS), 'uploadSha256': smoke['upload']['sha256'],
            'inputs': {'smoke-api-auth-upload.json': sha_file(RUN / 'smoke-api-auth-upload.json')},
        })
        try:
            results[label] = require_denial(open_gate, 'stale candidate-restart-result')
        finally:
            result_path.rename(RUN / f'negative-restart-{label}.json')
    receipt('restart-control', {'attemptId': ATTEMPT, 'candidate': current, **results, 'publicStatus': 503})


def browser_control():
    assert_fenced()
    binding = candidate()
    proof = require_gate('smoke-browser', binding)
    sessions = RUN / 'fastify-session.json'
    session_bytes = sessions.read_bytes()
    try:
        sessions.write_bytes(session_bytes + b'\n')
        prerequisite = require_denial(open_gate, 'stale smoke-api-auth-upload receipt (input checksums differ)')
    finally:
        sessions.write_bytes(session_bytes)
    observation = RUN / proof['capture'] / 'observation.json'
    original = observation.read_bytes()
    valid = json.loads(original)
    try:
        receipt(f"{proof['capture']}/observation", {**valid, 'loginStatus': 503})
        changed = require_denial(open_gate, 'stale smoke-browser receipt (input checksums differ)')
        recheck = require_denial(browser_finish, 'browser login and record navigation must both return 200')
        assert not (RUN / 'smoke-browser.json').exists()
    finally:
        observation.write_bytes(original)
    missing = require_denial(open_gate, 'missing smoke-browser receipt')
    receipt('browser-control', {'attemptId': ATTEMPT, 'candidate': binding, 'previousReceiptId': proof['receiptId'],
                                'changedPrerequisite': prerequisite, 'changedObservation': changed, 'failedRecheck': recheck,
                                'restoredObservation': missing, 'publicStatus': 503})


def source_restart_control():
    """Write through the old host after checkpointing, before starting the staged candidate."""
    assert_fenced()
    require_drained_source()
    require_gate('session-cutover')
    assert not did(NAMESPACE + '-fastify')['State']['Running']
    before = require_gate('drain')['source']
    boot('express', 'source-restart-control-startup', gated=False)
    try:
        assert_fenced()
        after = launch_identity(did(NAMESPACE + '-express'))
        assert same_container(before, after) and before['startedAt'] != after['startedAt']
        dataset = next(record for record in read('source-state')['records'] if record['type'] == 'dataRecord')
        attachment = upload(dataset, 'fm049-post-checkpoint.bin', b'Written by Express after checkpointing.\n')
    finally:
        stop('express', 'source-restart-control-stop.log')
    require_stopped_source(after)
    assert not any(obj['key'].endswith('/' + attachment['fileId']) for obj in read('checkpoint/s3-objects'))
    assert_fenced()
    receipt('source-restart-control', {'attemptId': ATTEMPT, 'before': before, 'after': after,
                                       'upload': attachment, 'inCheckpoint': False, 'stopExit': 0, 'publicStatus': 503})


def cleanup():
    FENCE.touch(exist_ok=True)
    errors = []
    for variant in ('express','fastify'):
        name = NAMESPACE + '-' + variant
        status = container(name)
        if status and status['State']['Running']:
            try:
                stop(variant,variant+'-cleanup.log')
            except Exception as error:
                errors.append(str(error))
    assert not errors, errors
    for name in [PROXY,S3,SOLR,STORAGE,CORE,NAMESPACE + '-express',NAMESPACE + '-fastify']:
        status = container(name)
        if status:
            log(name,name+'.log')
            if status['State']['Running']:
                docker('stop','-t','35',name,seconds=44)
            docker('rm','-v',name)
    volumes = []
    for volume in VOLUMES.values():
        status = docker('volume', 'inspect', volume, validate=False)
        if status.returncode:
            assert b'no such volume' in status.stderr.lower(), status.stderr
            continue
        assert json.loads(status.stdout)[0]['Labels']['fm049.attempt'] == ATTEMPT, volume
        docker('volume', 'rm', volume)
        volumes.append(volume)
    receipt('cleanup', {'attemptId': ATTEMPT, 'removedVolumes': volumes,
                        'containersAfter': docker('ps', '-a', '--format', '{{.Names}}').stdout.decode().splitlines()})


COMMANDS = {
    'preload': preload, 'services': services, 'source-start': prepare_source, 'seed': seed, 'quiesce-and-drain': drain,
    'checkpoint': checkpoint, 'checkpoint-control': checkpoint_control, 'deploy': deploy,
    'invalidate': invalidate, 'readiness': readiness,
    'smoke-api-auth-upload': smoke, 'restart-control': restart_control, 'candidate-restart': restart,
    'browser-start': browser_start, 'browser-finish': browser_finish, 'browser-control': browser_control,
    'source-restart-control': source_restart_control, 'restore-traffic': open_gate, 'cleanup': cleanup,
}


if __name__ == '__main__':
    if not __debug__:
        raise SystemExit('Run the rehearsal with Python assertions enabled.')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('steps', nargs='+', choices=COMMANDS)
    args = parser.parse_args()
    os.umask(0o077)
    with (RUN / 'driver.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for step in args.steps:
            timed(step, COMMANDS[step])
