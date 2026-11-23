"""Success receipts for the fenced upgrade. A receipt seals its inputs and prerequisites."""
import hashlib
import json
import re
import uuid

from lab import ATTEMPT, FENCE, RUN, receipt

SCREENSHOTS = ('candidate-login.png', 'candidate-home.png', 'candidate-record.png')
# Each entry lists prerequisite receipts followed by other files used by the step.
STEPS = {
    'drain': ((), ('source-state.json', 'express.cjs', 'express.env', 'components/express.iid', 'proxy.conf')),
    'checkpoint-ready': (('drain',), ('checkpoint/SHA256SUMS',)),
    'candidate-deploy': (('checkpoint-ready',), ('fastify.cjs', 'components/fastify.iid', 'components/fastify-base.json')),
    'session-cutover': (('candidate-deploy',), ('fastify.env',)),
    'candidate-startup': (('session-cutover',), ()),
    'smoke-api-auth-upload': (('candidate-startup',), ('fastify-session.json',)),
    'candidate-restart-readiness': (('session-cutover',), ()),
    'candidate-restart-result': (('smoke-api-auth-upload', 'candidate-restart-readiness'), ()),
    'browser-start': (('candidate-restart-result',), ()),
    'smoke-browser': (('browser-start',), ()),
    'public-gate': (('smoke-browser',), ()),
}


class GateClosed(RuntimeError):
    pass


def read(name):
    return json.loads((RUN / (name + '.json')).read_text())


def sha_file(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def forget(*names, fence=True):
    if fence:
        FENCE.touch(exist_ok=True)
    for name in set(names) | {'public-gate'}:
        (RUN / (name + '.json')).unlink(missing_ok=True)


def inputs(name, *, pending=()):
    prerequisites, files = STEPS[name]
    paths = [*(step + '.json' for step in prerequisites), *files]
    if name == 'smoke-browser':
        capture = read('browser-start')['capture']
        if re.fullmatch(r'browser-[a-f0-9]{32}', capture) is None:
            raise GateClosed('invalid browser capture directory')
        paths.extend(f'{capture}/{file}' for file in ('observation.json', *SCREENSHOTS))
    try:
        return {path: sha_file(RUN / path) for path in paths if path not in pending}
    except FileNotFoundError as error:
        raise GateClosed(f'missing input for {name}: {error.filename}') from error


def require_gate(name, binding=None):
    try:
        result = read(name)
    except FileNotFoundError as error:
        raise GateClosed(f'missing {name} receipt') from error
    if result.get('attemptId') != ATTEMPT or (binding is not None and result.get('candidate') != binding):
        raise GateClosed(f'stale {name} receipt (attempt, container, image or start time differs)')
    if result.get('inputs') != inputs(name):
        raise GateClosed(f'stale {name} receipt (input checksums differ)')
    for prerequisite in STEPS[name][0]:
        require_gate(prerequisite)
    return result


def seal(name, checked, **data):
    if checked != inputs(name):
        raise GateClosed(f'{name} inputs changed during verification')
    for prerequisite in STEPS[name][0]:
        require_gate(prerequisite)
    # Even identical inputs need new downstream checks after a successful rerun.
    receipt(name, {'attemptId': ATTEMPT, 'receiptId': uuid.uuid4().hex, 'inputs': checked, **data})
