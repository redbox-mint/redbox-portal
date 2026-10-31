#!/usr/bin/env python3
"""Offline independent verifier: downloaded reports alone never prove CI gating."""
import argparse
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

MARKER = 'CI_MOCHA_FAILURE_REHEARSAL_2026'
JOB = 'test-mocha-failure-rehearsal'
GATE = 'validation-complete-mocha-failure-rehearsal'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(file):
    return json.loads(file.read_text())


def verify_reports(directory):
    identity = read_json(directory / 'identity.json')
    result = read_json(directory / 'suite-status.json')
    require(identity['branch'] == 'chore/circleci-performance' and identity['tag'] == '', 'Wrong event')
    require(result['command'] == 'timeout 1800s npm run test:mocha:ci', 'Wrong suite command')
    require(0 < result['suite_exit'] < 124 and result['tee_exit'] == 0, 'Missing ordinary test failure, or timeout/log failure')
    require((directory / 'suite.log').stat().st_size > 0, 'Missing suite/teardown log')
    require(hashlib.sha256((directory / 'injected-fixture.txt').read_bytes()).hexdigest() == identity['fixture_sha256'], 'Fixture hash mismatch')
    for stage in ['raw', 'prepared']:
        manifest = read_json(directory / f'{stage}.json')
        for name in ['lcov.info', 'backend-mocha.xml']:
            data = (directory / f'{stage}-{name}').read_bytes()
            require(len(data) > 0 and len(data) == manifest[name]['bytes'], f'{stage}: empty/truncated {name}')
            require(hashlib.sha256(data).hexdigest() == manifest[name]['sha256'], f'{stage}: hash mismatch {name}')
        tree = ET.parse(directory / f'{stage}-backend-mocha.xml')
        failures = [case for case in tree.iter('testcase') if MARKER in case.get('name', '')
                    and any(f'{MARKER}: intentional integration assertion' in ''.join(failure.itertext())
                            or f'{MARKER}: intentional integration assertion' in failure.get('message', '')
                            for failure in case.findall('failure'))]
        require(len(failures) == 1, f'{stage}: deliberate assertion must execute and fail (bootstrap failure is insufficient)')
        require(len(list(tree.iter('failure'))) == 1 and not list(tree.iter('error')), f'{stage}: unrelated suite errors/failures need investigation')
        require(len(list(tree.iter('testcase'))) > 1, f'{stage}: full suite evidence missing')
        records = (directory / f'{stage}-lcov.info').read_text().split('end_of_record')
        require(any(any(line.startswith('SF:') and 'packages/' in line for line in record.splitlines())
                    and any(line.startswith('DA:') for line in record.splitlines())
                    for record in records[:-1]), f'{stage}: no application LCOV records')
    require((directory / 'raw-backend-mocha.xml').read_bytes() == (directory / 'prepared-backend-mocha.xml').read_bytes(), 'JUnit changed during coverage preparation')
    return identity, result


def verify_circle(directory, identity, result):
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
    require(set(by_name) == {'build-mocha-failure-rehearsal', JOB, GATE}, 'Unexpected jobs, missing gate, or publication path')
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('artifact_directory', type=Path)
    parser.add_argument('--circle-evidence', type=Path)
    args = parser.parse_args()
    identity, result = verify_reports(args.artifact_directory)
    if args.circle_evidence:
        verify_circle(args.circle_evidence, identity, result)
        print('Reports and supplied CircleCI evidence verified. Independently inspect API provenance, processed config, logs, and publication absence across the entire pipeline per the runbook.')
    else:
        print('Report checks passed ONLY. Live CircleCI failure, ingestion, gate blocking, upload and publication isolation remain UNVERIFIED.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, ET.ParseError) as error:
        raise SystemExit(f'Rehearsal verification FAILED: {error}')
