#!/usr/bin/env python3
"""Offline independent verifier: downloaded reports alone never prove CI gating."""
import argparse
from collections import Counter
import re
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

MARKER = 'CI_MOCHA_FAILURE_REHEARSAL_2026'
JOB = 'test-mocha-failure-rehearsal'
GATE = 'validation-complete-mocha-failure-rehearsal'
CONTROL = JOB + '-control'
PRODUCER = 'build-mocha-failure-rehearsal'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(file):
    return json.loads(file.read_text())


def verify_reports(directory, control=False):
    identity = read_json(directory / 'identity.json')
    result = read_json(directory / 'suite-status.json')
    require(result.get('validation', {}).get('valid', True) is True, 'Suite status validation failed')
    require(identity['branch'] == 'chore/circleci-performance' and identity['tag'] == '', 'Wrong event')
    require(result['command'] in ['timeout 1800s npm run test:mocha:ci', 'npm run test:mocha:ci'], 'Wrong suite command')
    require((result['suite_exit'] == 0 if control else 0 < result['suite_exit'] < 124)
            and result['tee_exit'] == 0, 'Wrong suite status, or timeout/log failure')
    require((directory / 'suite.log').stat().st_size > 0, 'Missing suite/teardown log')
    if not control:
        require(hashlib.sha256((directory / 'injected-fixture.txt').read_bytes()).hexdigest() == identity['fixture_sha256'], 'Fixture hash mismatch')
    else:
        require(not (directory / 'injected-fixture.txt').exists(), 'Control contains an injected fixture')
    for stage in ['raw', 'prepared']:
        manifest = read_json(directory / f'{stage}.json')
        require(manifest.get('validation', {}).get('valid', True) is True, f'{stage}: evidence validation failed')
        for name in ['lcov.info', 'backend-mocha.xml']:
            data = (directory / f'{stage}-{name}').read_bytes()
            require(len(data) > 0 and len(data) == manifest[name]['bytes'], f'{stage}: empty/truncated {name}')
            require(hashlib.sha256(data).hexdigest() == manifest[name]['sha256'], f'{stage}: hash mismatch {name}')
        tree = ET.parse(directory / f'{stage}-backend-mocha.xml')
        failures = [case for case in tree.iter('testcase') if MARKER in case.get('name', '')
                    and any(f'{MARKER}: intentional integration assertion' in ''.join(failure.itertext())
                            or f'{MARKER}: intentional integration assertion' in failure.get('message', '')
                            for failure in case.findall('failure'))]
        require(len(failures) == (0 if control else 1), f'{stage}: deliberate assertion must execute and fail (bootstrap failure is insufficient)')
        require(len(list(tree.iter('failure'))) == (0 if control else 1) and not list(tree.iter('error')), f'{stage}: unrelated suite errors/failures need investigation')
        require(len(list(tree.iter('testcase'))) > 1, f'{stage}: full suite evidence missing')
        records = (directory / f'{stage}-lcov.info').read_text().split('end_of_record')
        require(any(any(line.startswith('SF:') and 'packages/' in line for line in record.splitlines())
                    and any(line.startswith('DA:') for line in record.splitlines())
                    for record in records[:-1]), f'{stage}: no application LCOV records')
    require((directory / 'raw-backend-mocha.xml').read_bytes() == (directory / 'prepared-backend-mocha.xml').read_bytes(), 'JUnit changed during coverage preparation')
    return identity, result


# Paired mode deliberately adds requirements rather than retrofitting the
# historical three-job evidence, which lacks a producer receipt and control.
def emitted_cases(directory):
    root = ET.parse(directory / 'raw-backend-mocha.xml').getroot()
    require(root.tag == 'testsuites', 'Missing JUnit testsuites totals')
    def integer(element, key, default=None):
        value = element.get(key, default)
        require(isinstance(value, str) and re.fullmatch(r'[0-9]+', value), f'Missing/invalid JUnit {key}')
        return int(value)
    total = integer(root, 'tests')
    skipped = integer(root, 'skipped', '0')  # Reporter omits this attribute for zero.
    failures = integer(root, 'failures')
    suites = root.findall('testsuite')
    require(suites and len(suites) == len(list(root.iter('testsuite'))), 'Unsupported nested JUnit suites')
    require(sum(integer(suite, 'tests') for suite in suites) == total, 'JUnit suite/total mismatch')
    cases = []
    suite_skips = 0
    suite_failures = 0
    require(integer(root, 'errors', '0') == 0, 'Unexpected JUnit error total')
    for suite in suites:
        require(suite.get('name'), 'Missing suite identity')
        emitted = suite.findall('testcase')
        emitted_skips = 0
        emitted_failures = 0
        for case in emitted:
            require(case.get('name') and case.get('classname'), 'Missing emitted testcase identity')
            outcomes = [tag for tag in ['failure', 'skipped', 'error'] for _ in case.findall(tag)]
            require(len(outcomes) <= 1, 'Contradictory emitted testcase outcomes')
            outcome = outcomes[0] if outcomes else 'pass'
            require(outcome != 'error', 'Unexpected emitted error')
            emitted_skips += outcome == 'skipped'
            emitted_failures += outcome == 'failure'
            cases.append(((suite.get('name'), suite.get('file', ''), case.get('classname'), case.get('name'), case.get('file', '')), outcome, case))
        # The default reporter omits pending testcase elements AND the suite
        # skipped attribute. Infer only their count in that case; an explicit
        # skipped attribute must reconcile with the emitted cases in THIS suite.
        omitted = integer(suite, 'tests') - len(emitted)
        require(omitted >= 0, 'JUnit suite has more emitted cases than declared tests')
        inferred_skips = omitted + emitted_skips
        declared_skips = integer(suite, 'skipped') if suite.get('skipped') is not None else inferred_skips
        require(declared_skips == inferred_skips, 'JUnit suite emitted/skipped counts mismatch')
        declared_failures = integer(suite, 'failures', '0')
        require(declared_failures == emitted_failures, 'JUnit suite failure count mismatch')
        require(integer(suite, 'errors', '0') == 0, 'Unexpected JUnit suite errors')
        suite_skips += declared_skips
        suite_failures += declared_failures
    require(len(cases) == len(list(root.iter('testcase'))), 'Unaccounted emitted testcase')
    require(skipped == suite_skips, 'JUnit suite/skipped total mismatch')
    require(failures == suite_failures, 'JUnit suite/failure total mismatch')
    return cases, skipped


def verify_paired(failure_directory, control_directory, producer_directory, identity):
    control, _ = verify_reports(control_directory, control=True)
    producer = read_json(producer_directory / 'identity.json')
    identities = [producer, identity, control]
    names = [PRODUCER, JOB, CONTROL]
    mandatory_files = ['.circleci/config.yml', 'Dockerfile', '.dockerignore', '.nvmrc', 'package.json',
                       'package-lock.json', '.npmrc', 'tsconfig.json', 'test/bootstrap.test.ts', 'test/integration/.mocharc.js',
                       'support/build/integration-prebuilt-assets.cjs', 'support/integration-testing/docker-compose.mocha.yml',
                       'support/integration-testing/run-mocha-redbox.sh', 'support/unit-testing/codecov/prepare-report.cjs',
                       'support/build/ci-mocha-failure-rehearsal.fixture.txt',
                       'support/build/ci-mocha-failure-rehearsal.cjs', 'support/build/ci-mocha-failure-rehearsal.sh']
    for item, name in zip(identities, names):
        require(item['schema_version'] == 2 and item['job_name'] == name, 'Wrong paired identity role/version')
        for field in ['revision', 'source_tree']:
            require(re.fullmatch(r'[a-f0-9]{40}', item[field]), f'Invalid {field}')
        require(re.fullmatch(r'sha256:[a-f0-9]{64}', item['image_id']), 'Invalid image ID')
        require(re.fullmatch(r'[a-f0-9]{64}', item['image_archive_sha256']), 'Invalid archive SHA-256')
        require(item['branch'] == 'chore/circleci-performance' and item['tag'] == '', 'Wrong paired event')
        require(isinstance(item['job_id'], str) and item['job_id']
                and isinstance(item['workflow_id'], str) and item['workflow_id']
                and re.fullmatch(r'[1-9][0-9]*', item['job_number']), 'Missing paired job/workflow identity')
        require(all(key in item['files'] for key in mandatory_files), 'Missing relevant input hash')
        require(all(isinstance(value, str) and re.fullmatch(r'[a-f0-9]{64}', value) for value in item['files'].values()), 'Invalid input SHA-256')
    for field in ['job_id', 'job_number', 'job_name']:
        require(len({item[field] for item in identities}) == 3, f'Duplicate paired {field}')
    for field in ['revision', 'source_tree', 'workflow_id', 'branch', 'tag', 'image_id', 'image_archive_sha256', 'fixture_sha256', 'files']:
        require(all(item[field] == producer[field] for item in identities), f'Paired identity mismatch: {field}')
    trusted_fixture = Path(__file__).with_name('ci-mocha-failure-rehearsal.fixture.txt').read_bytes()
    trusted_hash = hashlib.sha256(trusted_fixture).hexdigest()
    require(identity['fixture_sha256'] == trusted_hash
            and identity['files']['support/build/ci-mocha-failure-rehearsal.fixture.txt'] == trusted_hash,
            'Unauthenticated deliberate fixture; use the reviewed verifier/template revision')
    for item, directory in [(identity, failure_directory), (control, control_directory)]:
        status = read_json(directory / 'suite-status.json')
        for name in ['suite-status', 'raw', 'prepared', 'teardown-status']:
            require(read_json(directory / f'{name}.json').get('validation', {}).get('valid') is True,
                    f'{name}: missing/failed paired evidence validation')
        require(type(status['suite_exit']) is int and type(status['tee_exit']) is int, 'Invalid paired status types')
        require(status['command'] == 'npm run test:mocha:ci', 'Missing bounded suite command')
        require(status.get('project_name') == 'integration-testing'
                and status.get('compose_sha256') == item['files']['support/integration-testing/docker-compose.mocha.yml'],
                'Wrong authorized suite Compose definition/project')
        supervision = status.get('supervision', {})
        require(supervision.get('timeout_ms') == 1800000 and supervision.get('kill_after_ms') == 5000
                and supervision.get('exit') == 0 and supervision.get('signal') is None
                and not supervision.get('error') and supervision.get('timed_out') is False
                and supervision.get('descendants_survived') is False and supervision.get('group_remaining') is False,
                'Unsuccessful/missing suite supervision')
        receipt = (directory / 'producer.json').read_bytes()
        require(receipt == (producer_directory / 'identity.json').read_bytes()
                and hashlib.sha256(receipt).hexdigest() == item['producer_identity_sha256'], 'Producer receipt mismatch')
        teardown = read_json(directory / 'teardown-status.json')
        require(type(teardown['exit']) is int and teardown['exit'] == 0 and teardown['signal'] is None and not teardown.get('error') and teardown.get('timed_out') is False
                and teardown.get('descendants_survived') is False and teardown.get('group_remaining') is False, 'Unsuccessful/missing teardown')
        require(teardown['command'] == ['docker', 'compose', '--project-name', 'integration-testing',
                '--project-directory', './support/integration-testing', '--profile', 'portal', '-f',
                '.tmp/' + directory.name + '-authorization/compose.yml', 'down', '-v', '--remove-orphans', '--timeout', '180'], 'Wrong teardown command')
        require(teardown['compose_sha256'] == item['files']['support/integration-testing/docker-compose.mocha.yml'],
                'Cleanup definition differs from measured input')
        require((directory / 'teardown.log').is_file(), 'Missing teardown log')
    for tool in ['node', 'npm', 'compose']:
        require(isinstance(identity[tool], str) and identity[tool] and identity[tool] == control[tool], f'Consumer tool mismatch: {tool}')
    failing, failure_skips = emitted_cases(failure_directory)
    green, green_skips = emitted_cases(control_directory)
    expected_title = 'deliberate image-backed integration failure ' + MARKER
    deliberate = [entry for entry in failing if entry[0][0] == 'CI Mocha compilation-removal failure rehearsal'
                  and entry[0][2] == expected_title
                  and entry[0][3] == 'CI Mocha compilation-removal failure rehearsal ' + expected_title
                  and entry[1] == 'failure']
    require(len(deliberate) == 1, 'Wrong deliberate emitted identity')
    require(not any(MARKER in str(key) for key, _, _ in green), 'Control contains deliberate test')
    ordinary = [(key, outcome) for key, outcome, case in failing if case is not deliberate[0][2]]
    require(Counter(ordinary) == Counter((key, outcome) for key, outcome, _ in green), 'Emitted JUnit identity/outcome multiset mismatch')
    require(failure_skips == green_skips, 'Skipped totals differ')
    print(f'Paired producer/image/input identities and exact emitted JUnit multiset verified; skipped totals equal ({green_skips}). Skipped identities remain UNVERIFIED.')
    return producer, control


def verify_circle(directory, identity, result, paired=None):
    # Unmodified API responses from the actual rehearsal workflow/job, all pages.
    workflow = read_json(directory / 'workflow.json')
    jobs = read_json(directory / 'workflow-jobs.json')
    details = read_json(directory / 'job-details.json')
    artifacts = read_json(directory / 'artifacts.json')
    tests = read_json(directory / 'tests.json')
    for response in [jobs, artifacts, tests]:
        require(not response.get('next_page_token'), 'Fetch and combine every API page before verification')
    require(workflow['id'] == identity['workflow_id'] and workflow['name'] == 'mocha_failure_rehearsal'
            and workflow['status'] == 'failed', 'Wrong workflow or workflow did not fail')
    items = jobs['items']
    require(all(isinstance(job.get('id'), str) and job['id'] for job in items), 'Missing workflow job ID')
    require(len({job['id'] for job in items}) == len(items)
            and len({job['name'] for job in items}) == len(items), 'Duplicate workflow job identity')
    by_name = {job['name']: job for job in items}
    require(set(by_name) == ({PRODUCER, JOB, GATE, CONTROL} if paired else {PRODUCER, JOB, GATE}), 'Unexpected jobs, missing gate, or publication path')
    require(by_name['build-mocha-failure-rehearsal']['status'] == 'success', 'Image producer did not succeed')
    require(by_name[JOB]['status'] == 'failed' and str(by_name[JOB]['job_number']) == identity['job_number'], 'Wrong or non-failing suite job')
    gate = by_name[GATE]
    require(gate['status'] in ['blocked', 'not_run'], 'Validation sentinel was not blocked')
    require(gate.get('requires') == {by_name[JOB]['id']: ['success']}
            and gate.get('dependencies') == [by_name[JOB]['id']],
            'Validation sentinel does not require the failed suite to succeed')
    require(details['vcs_revision'] == identity['revision'] and str(details['build_num']) == identity['job_number']
            and details['status'] == 'failed' and details['workflows']['workflow_id'] == identity['workflow_id']
            and details['workflows']['job_id'] == by_name[JOB]['id'], 'Job/source identity mismatch')
    actions = [action for step in details['steps'] for action in step['actions']]
    suite = [action for action in actions if action.get('name') == 'Run deliberately failing Mocha integration suite']
    require(len(suite) == 1 and suite[0]['status'] == 'failed' and suite[0]['exit_code'] == result['suite_exit'], 'CircleCI did not retain the suite exit status')
    upload = [action for action in actions if action.get('name') == 'Upload Mocha code coverage']
    require(len(upload) == 1 and upload[0]['status'] == 'success', 'Always-run normalization/upload did not complete; inspect its log')
    expected = ['identity.json', 'suite-status.json', 'suite.log', 'raw.json', 'prepared.json',
                'injected-fixture.txt', 'raw-lcov.info', 'prepared-lcov.info',
                'raw-backend-mocha.xml', 'prepared-backend-mocha.xml']
    for name in expected:
        require(any(item['path'].endswith(f'ci-mocha-failure-rehearsal/{name}') for item in artifacts['items']), f'CircleCI artifact missing: {name}')
    require(any(MARKER in item.get('name', '') and item.get('result') == 'failure' for item in tests['items']), 'JUnit failure was not ingested by CircleCI')

    if paired:
        producer, control = paired
        require(len({str(job['job_number']) for job in items}) == len(items), 'Duplicate CircleCI job number')
        for item in [producer, identity, control]:
            job = by_name[item['job_name']]
            require(job['id'] == item['job_id'] and str(job['job_number']) == item['job_number'], 'Paired CircleCI identity mismatch')
        for name in [JOB, CONTROL]:
            require(by_name[name].get('requires') == {producer['job_id']: ['success']}
                    and by_name[name].get('dependencies') == [producer['job_id']], 'Consumer must require same successful producer')
        require(by_name[CONTROL]['status'] == 'success', 'Green control did not succeed')
        for item, prefix, destination in [(producer, 'producer', 'ci-mocha-failure-rehearsal-producer'),
                                          (control, 'control', 'ci-mocha-failure-rehearsal-control')]:
            detail = read_json(directory / f'{prefix}-job-details.json')
            listing = read_json(directory / f'{prefix}-artifacts.json')
            require(not listing.get('next_page_token'), 'Fetch every paired artifact API page')
            require(detail['vcs_revision'] == item['revision'] and str(detail['build_num']) == item['job_number']
                    and detail['status'] == 'success' and detail['workflows']['workflow_id'] == item['workflow_id']
                    and detail['workflows']['job_id'] == item['job_id'], 'Paired job details mismatch')
            names = ['identity.json'] if prefix == 'producer' else [name for name in expected if name != 'injected-fixture.txt'] + ['producer.json', 'teardown.log', 'teardown-status.json']
            for name in names:
                require(any(entry['path'].endswith(f'{destination}/{name}') for entry in listing['items']), f'Missing paired artifact: {prefix}/{name}')
            if prefix == 'producer':
                producer_actions = [action for step in detail['steps'] for action in step['actions']
                                    if action.get('name') == 'Record independently measured rehearsal producer identity']
                require(len(producer_actions) == 1 and producer_actions[0]['status'] == 'success', 'Producer identity action incomplete')
            if prefix == 'control':
                control_actions = [action for step in detail['steps'] for action in step['actions']]
                for name in ['Run ordinary Mocha green control suite', 'Normalize Mocha control coverage without upload',
                             'Tear down rehearsal containers and retain status', 'Retain raw control reports before coverage preparation',
                             'Retain prepared control reports and evidence']:
                    matches = [action for action in control_actions if action.get('name') == name]
                    require(len(matches) == 1 and matches[0]['status'] == 'success', f'Control action incomplete: {name}')
                    if name == 'Run ordinary Mocha green control suite':
                        require(matches[0]['exit_code'] == 0, 'Control suite did not retain zero exit')
                require(not any('codecov' in action.get('name', '').lower() or action.get('name') == 'Upload Mocha code coverage' for action in control_actions), 'Duplicate control upload/install action')
        for name in ['producer.json', 'teardown.log', 'teardown-status.json']:
            require(any(entry['path'].endswith(f'ci-mocha-failure-rehearsal/{name}') for entry in artifacts['items']), f'Missing paired failure artifact: {name}')
        for name in ['Tear down rehearsal containers and retain status', 'Retain raw failure reports before coverage preparation', 'Retain prepared failure reports and evidence']:
            matches = [action for action in actions if action.get('name') == name]
            require(len(matches) == 1 and matches[0]['status'] == 'success', f'Failure action incomplete: {name}')
        control_tests = read_json(directory / 'control-tests.json')
        require(not control_tests.get('next_page_token') and control_tests['items']
                and all(test['result'] == 'success' for test in control_tests['items']), 'Control JUnit ingestion incomplete or unsuccessful')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('artifact_directory', type=Path)
    parser.add_argument('--circle-evidence', type=Path)
    parser.add_argument('--paired', action='store_true', help='Require the new same-producer four-job comparison')
    parser.add_argument('--control-directory', type=Path)
    parser.add_argument('--producer-directory', type=Path)
    args = parser.parse_args()
    if args.paired != bool(args.control_directory and args.producer_directory) or (not args.paired and (args.control_directory or args.producer_directory)):
        parser.error('--paired requires both --control-directory and --producer-directory; paired paths require --paired')
    identity, result = verify_reports(args.artifact_directory)
    paired = verify_paired(args.artifact_directory, args.control_directory, args.producer_directory, identity) if args.paired else None
    if args.circle_evidence:
        verify_circle(args.circle_evidence, identity, result, paired)
        print('Reports and supplied CircleCI evidence verified. Independently inspect API provenance, processed config, logs, and publication absence across the entire pipeline per the runbook.')
    else:
        print('Report checks passed ONLY. Live CircleCI failure, ingestion, gate blocking, upload and publication isolation remain UNVERIFIED.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, TypeError, AttributeError, ET.ParseError) as error:
        raise SystemExit(f'Rehearsal verification FAILED: {error}')
