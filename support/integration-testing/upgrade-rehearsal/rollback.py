#!/usr/bin/env python3
"""Rehearse a fenced v6 Express rollback against live data or a restored checkpoint."""
import argparse
from datetime import datetime, timedelta
import fcntl
import hashlib
import json
import os
import re
import secrets
import socket
import sys
import urllib.parse
import uuid

sys.dont_write_bytecode = True

from checkpoint import CheckpointError, require_stopped_source
from gate import SCREENSHOTS, STEPS, GateClosed, forget, inputs, read, require_gate, seal, sha_file
from lab import (ATTEMPT, AUTH, CHECKPOINT, DATABASES, FENCE, LOGINS, NAMESPACE, ORIGIN, PORTAL_PORT, PREFIX, PROXY, RUN, S3_PORT, VOLUMES,
                 assert_fenced, boot, config_args, container, did, docker, expect, image, launch_identity, maintenance,
                 preload, provider, receipt, services, stop, tcp, timed, utc, wait, URL)
from probes import assert_wsu_route, download, expect_user, login, record_read, solr_docs, upload
from rehearse import cleanup, require_denial
from rollback_inputs import (CORRECTED_WSU, MODE, RECOVERED_IMAGE, checkpoint_integrity, copy_volumes,
                             restore_targets, stage_images)

EXPRESS = NAMESPACE + '-express'
FASTIFY = NAMESPACE + '-fastify'
COOKIE = 'wsu.rollback.fm050.sid'
SOURCE = 'checkpoint/source-state'
OLD_R5 = 'handoff-fastify-session'
OLD_R5_UPLOAD = 'handoff-smoke-api-auth-upload'
DELTA = 'r5-writes' if MODE == 'live' else 'paired-r5-writes'
R5_SESSIONS = 'r5-sessions' if MODE == 'live' else 'paired-r5-sessions'
MUTATION = 'express-writes'
RECURRING_OUTBOUND = {
    'Figshare-Dispatch': timedelta(seconds=30),
    'SiemForwardingService-RetryFailedDeliveries': timedelta(minutes=1),
}
STEPS.update({
    'rollback-images': ((), ('settings.json', 'checkpoint/SHA256SUMS', 'components/express.iid', 'express.cjs')
                        + (('components/fastify.iid', 'components/wsu.tgz', 'components/xmlbuilder.tgz',
                            'fastify.cjs', 'handoff-fastify.env', 'wsu-image-build.log') if MODE == 'live'
                           else ('independent-image-load.log', 'working-image-load.log', 'recovery-image.tar'))),
    'rollback-targets': (('rollback-images',), ('services.json', 'proxy.conf', 'baseline.json')
                         + (('restore-clean-targets.json',) if MODE == 'restore' else ())),
    'r5-writes': (('rollback-targets',), ('r5-sessions.json', 'fastify.env', 'after-r5.json',
                                         OLD_R5 + '.json', OLD_R5_UPLOAD + '.json')),
    'rollback-start': (('r5-writes' if MODE == 'live' else 'rollback-targets',), ('express.env',)),
    'rollback-smoke': (('rollback-start',), ('rollback-sessions.json', DELTA + '.json', R5_SESSIONS + '.json',
                                            OLD_R5 + '.json', OLD_R5_UPLOAD + '.json')),
    'rollback-restart': (('rollback-smoke',), ('after-express-start.json',)),
    'express-writes': (('rollback-restart',), ('after-express-writes.json',)),
    'rollback-current': (('express-writes' if MODE == 'live' else 'rollback-restart',),
                         ('after-crossback.json',) if MODE == 'live' else ()),
    'browser-start': (('rollback-current',), ()),
})


def binding(variant='express'):
    status = did(NAMESPACE + '-' + variant)
    if not status['State']['Running'] or status['Image'] != image(variant):
        raise GateClosed(f'{variant} is stopped or uses a different image')
    return launch_identity(status)


def require_inactive(name, expected):
    status = did(name)
    if (launch_identity(status) != expected or status['State']['Status'] != 'exited'
            or status['State']['OOMKilled'] or status['State']['ExitCode'] != 0):
        raise GateClosed(f'{name} launch no longer matches the stopped writer')


def providers_binding():
    result = {}
    for name in (*VOLUMES, PROXY):
        status = did(name)
        if not status['State']['Running']:
            raise GateClosed(f'{name} is stopped')
        result[name] = launch_identity(status)
    return result


def require_targets():
    proof = require_gate('rollback-targets')
    if proof['providers'] != providers_binding():
        raise GateClosed('a provider or the fence proxy was replaced or restarted')
    return proof


def check_workspace():
    assert all(not path.is_file() for path in (RUN / 'state/staging').rglob('*')), 'attachment staging is not empty'
    result = {}
    for root in ('staging', 'figshare', 'publications'):
        directory = RUN / 'state' / root
        result[root] = {str(path.relative_to(directory)): sha_file(path) for path in sorted(directory.rglob('*')) if path.is_file()}
    return result


def compare_docs(first, second):
    return first['numFound'] == second['numFound'] and sorted(first['docs'], key=lambda doc: doc['id']) == sorted(second['docs'], key=lambda doc: doc['id'])


def objects_summary(objects):
    return {obj['key']: {k: obj[k] for k in ('bytes', 'sha256')} for obj in objects}


def outbound_jobs(jobs):
    integration = re.compile(r'doi|raid|figshare|mail|siem|publish|remote|export|transfer|notification', re.IGNORECASE)
    return {(collection, job['_id']): job for collection, entries in jobs.items() for job in entries
            if integration.search(job.get('name') or '')}


def reconcile_outbound(expected, current):
    if expected.keys() != current.keys():
        raise GateClosed('outbound job inventory changed')
    for key, job in current.items():
        name = job['name']
        before = expected[key]
        if any(row.get('disabled') or row.get('lockedAt') is not None for row in (before, job)):
            raise GateClosed(f'outbound job is disabled or claimed: {name}')
        for field in ('name', 'type', 'repeatInterval', 'failedAt', 'failCount'):
            if job.get(field) != before.get(field):
                raise GateClosed(f'outbound job state changed: {name} ({field})')
        next_run = job.get('nextRunAt')
        if next_run == before.get('nextRunAt'):
            continue
        # A completed, known recurring job may advance at its configured cadence.
        period = RECURRING_OUTBOUND.get(name)
        last_run = job.get('lastRunAt')
        last_finished = job.get('lastFinishedAt')
        if (job['type'] == 'single' and period and next_run and last_run and last_finished
                and last_run > (before.get('lastRunAt') or '') and last_finished >= last_run
                and datetime.fromisoformat(next_run) - datetime.fromisoformat(last_run) == period):
            continue
        raise GateClosed(f'outbound job schedule changed: {name}')


def migration_ledger(inventory):
    return next((row for row in inventory['core']['collections'] if row['name'] == 'migration'), None)


def object_entry(attachment):
    return (f"attachments/{attachment['oid']}/{attachment['fileId']}",
            {key: attachment[key] for key in ('bytes', 'sha256')})


def snapshot(name, records):
    inventory = provider('inventory')
    result = {'mongo': inventory, 'migration': migration_ledger(inventory),
              'solr': wait(lambda: solr_docs(records), 60, .5),
              's3': objects_summary(provider('objects')), 'local': check_workspace(), 'jobs': provider('jobs')}
    receipt(name, result)
    return result


def images():
    forget('rollback-images')
    proof = stage_images()
    seal('rollback-images', inputs('rollback-images'), **proof)


def targets():
    forget('rollback-targets')
    require_gate('rollback-images')
    checkpoint_integrity()
    if MODE == 'restore':
        restore_targets()
    else:
        services(copy_volumes)
    assert_fenced()
    source, checkpoint_solr = read(SOURCE), read('checkpoint/solr-documents')
    proof = snapshot('baseline', source['records'][:2])
    assert compare_docs(proof['solr'], checkpoint_solr)
    expected = objects_summary(read('checkpoint/s3-objects'))
    if MODE == 'live':
        expected.update([object_entry(read(OLD_R5_UPLOAD)['upload'])])
    assert proof['s3'] == expected
    archived = migration_ledger(read('checkpoint/mongo-inventory'))
    assert archived == proof['migration']
    seal('rollback-targets', inputs('rollback-targets'), providers=providers_binding(), publicStatus=503,
         checkpointRestored=MODE == 'restore')


def create_write(title, filename, content):
    fields = {'title': title, 'description': 'Synthetic FM-050 rollback verification', 'dataLocations': []}
    _, body = expect(PREFIX + '/api/records/metadata/dataRecord?apiVersion=2', 201, method='POST', headers=AUTH, body=fields)
    record = {'oid': json.loads(body)['oid'], 'title': title, 'type': 'dataRecord'}
    attachment = upload(record, filename, content)
    record['etag'], record['metadataSha256'] = record_fingerprint(record)
    return record, attachment


def record_fingerprint(record):
    etag, payload = record_read(record)
    checksum = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    return etag, checksum


def baseline_unchanged(prior, later, record, attachment):
    assert later['migration'] == prior['migration']
    assert later['local'] == prior['local']
    assert later['s3'] == prior['s3'] | dict([object_entry(attachment)])
    old_docs = {doc['id']: doc for doc in prior['solr']['docs']}
    retained = {doc['id']: doc for doc in later['solr']['docs'] if doc['id'] in old_docs}
    new_docs = {doc['id']: doc for doc in later['solr']['docs'] if doc['id'] not in old_docs}
    oid = record['oid']
    assert retained == old_docs
    assert set(new_docs) == {oid, oid + '/authorization.stored#', oid + '/authorization_stored#'}, new_docs
    assert new_docs[oid]['redboxOid'] == oid and new_docs[oid]['title'] == record['title']
    assert later['solr']['numFound'] == prior['solr']['numFound'] + len(new_docs)


def stage(variant, secret):
    source = CHECKPOINT / 'express.env' if variant == 'express' else RUN / 'handoff-fastify.env'
    env = dict(line.split('=', 1) for line in source.read_text().splitlines())
    if variant == 'express':
        assert secret != env['REDBOX_SESSION_SECRET']
    env.update(REDBOX_PUBLIC_URL=ORIGIN, REDBOX_PORT=str(PORTAL_PORT), REDBOX_SESSION_SECRET=secret,
               HOOK_S3_ENDPOINT=f'http://127.0.0.1:{S3_PORT}')
    target = RUN / (variant + '.env')
    target.write_text(''.join(f'{key}={value}\n' for key, value in env.items()))
    assert maintenance(variant, 'inspect', 0) == 0
    docker('create', '--pull=never', '--name', NAMESPACE + '-' + variant, *config_args(variant), image(variant))


def r5_writes():
    assert MODE == 'live'
    forget('r5-writes')
    require_targets()
    assert_fenced()
    assert container(EXPRESS) is None
    env = dict(line.split('=', 1) for line in (RUN / 'handoff-fastify.env').read_text().splitlines())
    stage('fastify', env['REDBOX_SESSION_SECRET'])
    boot('fastify', 'r5-start')
    current = binding('fastify')
    for user, cookie in read(OLD_R5).items():
        expect_user(user, cookie)
    fresh = {user: login(user, 'fastify') for user in LOGINS}
    record, attachment = create_write('FM-050 r5 post-cutover dataset', 'fm050-r5.bin', b'r5 post-cutover attachment\n' * 256)
    source = read(SOURCE)
    download(read(OLD_R5_UPLOAD)['upload'])
    wait(lambda: solr_docs([*source['records'][:2], record]), 60, .5)
    exit_code = stop('fastify', 'r5-drained.log')
    require_inactive(FASTIFY, current)
    after = snapshot('after-r5', [*source['records'][:2], record])
    baseline_unchanged(read('baseline'), after, record, attachment)
    receipt('r5-sessions', fresh)
    assert_fenced()
    seal('r5-writes', inputs('r5-writes'), writer=current, stopExit=exit_code, priorSessionsAuthenticated=len(fresh),
         record=record, attachment=attachment)


def rollback_start():
    forget('rollback-start')
    require_targets()
    checkpoint_integrity()
    assert_fenced()
    if MODE == 'live':
        require_inactive(FASTIFY, require_gate('r5-writes')['writer'])
    else:
        assert container(FASTIFY) is None
    stage('express', secrets.token_hex(32))
    checked = inputs('rollback-start')
    result = boot('express', 'rollback-express-start')
    seal('rollback-start', checked, **result)


def reject_old_sessions():
    counts = {}
    for label, sessions in [('checkpointExpress', read(SOURCE)['users']), ('fm049R5', read(OLD_R5)), ('fm050R5', read(R5_SESSIONS))]:
        assert set(sessions) == set(LOGINS)
        for cookie in sessions.values():
            expect(PREFIX + '/user/info', 403, headers={'Cookie': cookie})
            renamed = COOKIE + '=' + cookie.split('=', 1)[1]
            expect(PREFIX + '/user/info', 403, headers={'Cookie': renamed})
        counts[label] = len(sessions)
    return counts


def download_path(attachment):
    return PREFIX + '/api/records/datastreams/' + attachment['oid'] + '/' + urllib.parse.quote(attachment['fileId'], safe='')


def verify_state(users, extra=None):
    source, r5_delta = read(SOURCE), read(DELTA)
    records = list(source['records'])
    attachments = list(source['attachments'])
    after = read('baseline')
    result = {}
    for user, cookie in users.items():
        expect_user(user, cookie)
    if MODE == 'live':
        records.append(r5_delta['record'])
        attachments.extend([read(OLD_R5_UPLOAD)['upload'], r5_delta['attachment']])
        after = read('after-r5')
        if extra:
            records.append(extra['record'])
            attachments.append(extra['attachment'])
            after = read('after-express-writes')
    else:
        missing = PREFIX + '/api/records/metadata/' + r5_delta['record']['oid'] + '?apiVersion=2'
        expect(missing, 404, headers=AUTH)
        result['postCutoverRecordStatus'] = 404
        result['postCutoverAttachmentStatuses'] = []
        for attachment in (read(OLD_R5_UPLOAD)['upload'], r5_delta['attachment']):
            expect(download_path(attachment), 404, headers=AUTH)
            result['postCutoverAttachmentStatuses'].append(404)
    for record in records:
        fingerprint = record_fingerprint(record)
        if 'etag' in record:
            assert fingerprint == (record['etag'], record['metadataSha256']), record
        _, body = expect(PREFIX + '/record/wfSteps/' + record['type'], 200, headers={'Cookie': users['admin']})
        assert json.loads(body)
    for attachment in attachments:
        download(attachment)
    docs = wait(lambda: solr_docs(source['records'][:2]), 20)
    assert compare_docs(docs, after['solr']), (docs, after['solr'])
    assert objects_summary(provider('objects')) == after['s3']
    assert_wsu_route(source['records'][0], users['admin'])
    return dict(result, recordCount=len(records), attachmentCount=len(attachments), solrDocuments=docs['numFound'])


def smoke():
    forget('rollback-smoke')
    assert_fenced()
    current = binding()
    require_gate('rollback-start', current)
    checked = inputs('rollback-smoke', pending=('rollback-sessions.json',))
    counts = reject_old_sessions()
    users = {user: login(user, 'express', cookie_name=COOKIE) for user in LOGINS}
    report = verify_state(users)
    receipt('rollback-sessions', users)
    checked['rollback-sessions.json'] = sha_file(RUN / 'rollback-sessions.json')
    seal('rollback-smoke', checked, candidate=current, staleCookies=counts, renamedCookies=counts,
         freshLogins=len(users), **report)


def restart():
    forget('rollback-restart')
    assert_fenced()
    previous = binding()
    require_gate('rollback-smoke', previous)
    checked = inputs('rollback-restart', pending=('after-express-start.json',))
    exit_code = stop('express', 'rollback-restart-stop.log')
    require_stopped_source(previous)
    ready = boot('express', 'rollback-restart')
    current = binding()
    assert current['containerId'] == previous['containerId'] and current['startedAt'] != previous['startedAt']
    result = verify_state(read('rollback-sessions'))
    source = read(SOURCE)
    snapshot('after-express-start', source['records'][:2])
    checked['after-express-start.json'] = sha_file(RUN / 'after-express-start.json')
    assert reject_old_sessions()
    seal('rollback-restart', checked, candidate=current, previous=previous, exitCode=exit_code,
         readiness=ready, **result)


def forward_check():
    assert MODE == 'live'
    forget('express-writes', 'rollback-current')
    assert_fenced()
    source = read(SOURCE)
    prior = binding()
    require_gate('rollback-restart', prior)
    require_inactive(FASTIFY, require_gate('r5-writes')['writer'])
    record, attachment = create_write('FM-050 Express rollback dataset', 'fm050-express.bin', b'Express rollback attachment\n' * 171)
    delta = {'record': record, 'attachment': attachment}
    expected_records = [*source['records'][:2], read(DELTA)['record'], record]
    wait(lambda: solr_docs(expected_records), 60, .5)
    exit_code = stop('express', 'express-crossback-stop.log')
    require_stopped_source(prior)
    after = snapshot('after-express-writes', expected_records)
    baseline_unchanged(read('after-r5'), after, record, attachment)
    seal('express-writes', inputs('express-writes'), writer=prior, stopExit=exit_code, **delta)
    ready = boot('fastify', 'fastify-crossback')
    r5 = binding('fastify')
    renewed = {user: login(user, 'fastify') for user in LOGINS}
    report = verify_state(renewed, delta)
    r5_exit = stop('fastify', 'fastify-crossback-stop.log')
    require_inactive(FASTIFY, r5)
    post_crossback = snapshot('after-crossback', expected_records)
    assert compare_docs(after['solr'], post_crossback['solr'])
    assert all(after[key] == post_crossback[key] for key in ('s3', 'migration', 'local'))
    express_ready = boot('express', 'express-final')
    current = binding()
    verify_state(read('rollback-sessions'), delta)
    assert reject_old_sessions()
    seal('rollback-current', inputs('rollback-current'), candidate=current, stoppedR5=r5, r5Exit=r5_exit,
         r5Readiness=ready, readiness=express_ready, crossback=report)


def restore_current():
    assert MODE == 'restore'
    forget('rollback-current')
    assert_fenced()
    current = binding()
    restart_proof = require_gate('rollback-restart', current)
    assert container(FASTIFY) is None
    seal('rollback-current', inputs('rollback-current'), candidate=current, readiness=restart_proof['readiness'])


def browser_start():
    forget('browser-start', 'smoke-browser')
    current = binding()
    require_gate('rollback-current', current)
    assert_fenced()
    record = next(record for record in read(SOURCE)['records'] if record['type'] == 'dataRecord')
    capture = 'browser-' + uuid.uuid4().hex
    (RUN / capture).mkdir()
    seal('browser-start', inputs('browser-start'), candidate=current, record=record, capture=capture, startedUtc=utc())
    print(json.dumps({'origin': ORIGIN, 'record': record, 'capture': str(RUN / capture)}))


def browser_finish():
    forget('smoke-browser')
    assert_fenced()
    current = binding()
    start = require_gate('browser-start', current)
    checked = inputs('smoke-browser')
    capture = start['capture']
    observation = read(f'{capture}/observation')
    assert observation == {
        'origin': ORIGIN, 'recordUrl': ORIGIN + PREFIX + '/record/edit/' + start['record']['oid'],
        'loginStatus': 200, 'recordStatus': 200, 'title': start['record']['title'],
        'welcome': 'Welcome Local Admin', 'tab': 'Dataset Information', 'pageErrors': [], 'localErrors': [],
    }, observation
    for name in SCREENSHOTS:
        with (RUN / capture / name).open('rb') as stream:
            assert stream.read(8) == b'\x89PNG\r\n\x1a\n'
    assert binding() == current
    seal('smoke-browser', checked, candidate=current, capture=capture, observation=observation, finishedUtc=utc())


def reopen():
    forget('public-gate')
    assert_fenced()
    current = binding()
    readiness = require_gate('rollback-current', current)
    ready = readiness['readiness']
    if ready['candidate'] != current or ready['observations'][-1]['readiness'] != 200 or ready['health'] != 200:
        raise GateClosed('current Express launch did not pass readiness and health')
    require_gate('smoke-browser', current)
    checked = inputs('public-gate')
    require_targets()
    if MODE == 'live':
        require_inactive(FASTIFY, readiness['stoppedR5'])
    else:
        assert container(FASTIFY) is None
    assert checkpoint_integrity()['manifestSha256'] == require_gate('rollback-images')['manifestSha256']
    expect('/healthz', 200)
    expect('/readyz', 200)
    assert did(EXPRESS)['State']['Health']['Status'] == 'healthy'
    verify_state(read('rollback-sessions'), read(MUTATION) if MODE == 'live' else None)
    reject_old_sessions()
    baseline = read('baseline')
    assert check_workspace() == baseline['local']
    assert_fenced()
    assert binding() == current
    require_gate('smoke-browser', current)
    ledger = migration_ledger(provider('migration'))
    if ledger is None or ledger['checksum'] != baseline['migration']['checksum']:
        raise GateClosed('live migration ledger differs from the sealed baseline')
    outbound = outbound_jobs(provider('jobs'))
    reconcile_outbound(outbound_jobs(baseline['jobs']), outbound)
    FENCE.unlink()
    try:
        expect('/readyz', 200, operator=False)
        expect(PREFIX + '/user/login', 200, operator=False)
        assert binding() == current
        require_targets()
        seal('public-gate', checked, candidate=current, before=503, after=200,
             migrationLedgerSha256=ledger['checksum'], outboundJobs=list(outbound.values()), openedUtc=utc())
    except BaseException:
        FENCE.touch()
        raise


def controls():
    assert_fenced()
    results = {}
    path = RUN / 'rollback-current.json'
    good = path.read_bytes()
    try:
        for label, field, value in (('attempt', 'attemptId', 'previous-attempt'), ('launch', 'candidate',
                                     {**binding(), 'startedAt': 'previous-launch'})):
            test = json.loads(good)
            test[field] = value
            path.write_text(json.dumps(test))
            results[label] = require_denial(reopen, 'stale rollback-current receipt')
        test = json.loads(good)
        test['readiness']['observations'][-1]['readiness'] = 503
        path.write_text(json.dumps(test))
        results['unready'] = require_denial(reopen, 'current Express launch did not pass readiness')
    finally:
        path.write_bytes(good)

    for label, file, marker in (('screenshot', RUN / read('smoke-browser')['capture'] / SCREENSHOTS[-1], 'smoke-browser'),
                                ('deployment', RUN / 'express.cjs', 'rollback-images'),
                                ('session', RUN / 'rollback-sessions.json', 'rollback-smoke')):
        good = file.read_bytes()
        try:
            file.write_bytes(good + b'\n')
            results[label] = require_denial(reopen, f'stale {marker} receipt (input checksums differ)')
        finally:
            file.write_bytes(good)

    member = CHECKPOINT / 'storage.archive.gz'
    contents = member.read_bytes()
    try:
        member.write_bytes(contents + b'changed')
        try:
            reopen()
        except CheckpointError as error:
            assert 'checkpoint member missing or changed: storage.archive.gz' in str(error)
            assert_fenced()
            results['checkpoint'] = str(error)
        else:
            raise AssertionError('changed checkpoint was accepted')
    finally:
        member.write_bytes(contents)

    proof = RUN / 'smoke-browser.json'
    good = proof.read_bytes()
    try:
        proof.unlink()
        results['missingBrowser'] = require_denial(reopen, 'missing smoke-browser receipt')
    finally:
        proof.write_bytes(good)
    results.update(provider_controls())
    receipt('rollback-controls', {'attemptId': ATTEMPT, 'denials': results, 'publicStatus': assert_fenced()})


def provider_controls():
    require_targets()
    def mongo(store, script):
        service, database = DATABASES[store]
        return docker('exec', service, 'mongosh', '--quiet', database, '--eval', script).stdout.decode().strip()

    marker = 'fm050-control-' + ATTEMPT
    identifier = json.dumps({'name': marker})
    mongo('core', f'assert(db.migration.insertOne({identifier}).acknowledged)')
    try:
        results = {'migrationLedger': require_denial(reopen, 'live migration ledger differs')}
    finally:
        mongo('core', f'assert(db.migration.deleteOne({identifier}).deletedCount === 1)')

    name = 'SiemForwardingService-RetryFailedDeliveries'
    for label, changed, denial in (
        ('disabledJob', '{disabled: true}', 'outbound job is disabled or claimed'),
        ('claimedJob', '{lockedAt: new Date(), lastModifiedBy: "fm050-control"}', 'outbound job is disabled or claimed'),
        ('rescheduledJob', '{nextRunAt: new Date(Date.now() + 3600000)}', 'outbound job schedule changed'),
    ):
        def inject():
            return json.loads(mongo('agenda', f'''
                const values = {changed};
                const projection = Object.fromEntries(Object.keys(values).map(key => [key, 1]));
                const job = db.agendaJobs.findOneAndUpdate({{
                    name: {json.dumps(name)}, lockedAt: null,
                    nextRunAt: {{$gt: new Date(Date.now() + 12000)}}
                }}, {{$set: values}}, {{projection, returnDocument: 'before'}});
                print(EJSON.stringify(job));
            '''))
        previous = wait(inject, 80, 1)
        try:
            results[label] = require_denial(reopen, denial)
        finally:
            payload = json.dumps(json.dumps(previous))
            mongo('agenda', f'''
                const previous = EJSON.parse({payload});
                const {{_id, ...fields}} = previous;
                const keys = Object.keys({changed});
                const unset = Object.fromEntries(keys.filter(key => !Object.hasOwn(fields, key)).map(key => [key, ""]));
                assert(db.agendaJobs.updateOne({{_id}}, {{$set: fields, $unset: unset}}).matchedCount === 1);
            ''')
    return results


def clean():
    cleanup()
    tag = RECOVERED_IMAGE if MODE == 'restore' else CORRECTED_WSU
    if docker('image', 'inspect', tag, validate=False).returncode == 0:
        docker('image', 'rm', tag)
    assert not any(tcp(port) for port in range(PORTAL_PORT - 4, PORTAL_PORT + 1))
    with socket.socket() as check:
        check.settimeout(.25)
        assert check.connect_ex((URL.hostname, URL.port)) != 0
    receipt('rollback-cleanup', {'attemptId': ATTEMPT, 'portsReleased': True, 'clearedImageTag': tag})


COMMANDS = {
    'preload': preload, 'images': images, 'targets': targets, 'r5-writes': r5_writes, 'express-start': rollback_start,
    'smoke': smoke, 'express-restart': restart, 'forward-check': forward_check, 'restore-current': restore_current,
    'browser-start': browser_start, 'browser-finish': browser_finish, 'controls': controls, 'reopen': reopen,
    'cleanup': clean,
}

if __name__ == '__main__':
    if not __debug__ or not NAMESPACE.startswith('fm050-'):
        raise SystemExit('Use a disposable FM-050 configuration with assertions enabled.')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('steps', nargs='+', choices=COMMANDS)
    args = parser.parse_args()
    os.umask(0o077)
    with (RUN / 'driver.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for step in args.steps:
            timed(step, COMMANDS[step])
