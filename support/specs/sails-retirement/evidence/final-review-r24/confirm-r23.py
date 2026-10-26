"""Rerun the ten R23 regressions on pinned incoming documents without reverting.

The test code, runtime dependencies and support files stay current; only the
documentation is replaced by the pre-fix Git snapshot in a disposable directory.
No provider or portal is started. Compose validation is offline.
"""
import importlib.util
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
ROOT = pathlib.Path(__file__).resolve().parents[5]
OUT = ROOT / '.tmp/sails-retirement/final-review-r24'
spec = importlib.util.spec_from_file_location('r23_inventory', ROOT / 'support/specs/sails-retirement/evidence/final-review-r23/inventory.py')
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)
NODE = os.environ.get('R24_NODE', '/home/andrew/.nvm/versions/node/v26.11.1/bin/node')
ENV = {**os.environ, 'PATH': str(pathlib.Path(NODE).parent) + ':' + os.environ['PATH']}

with tempfile.TemporaryDirectory(prefix='r24-r23-sensitive-') as scratch:
    snapshot = pathlib.Path(scratch)
    for page in inventory.pages(ROOT):
        target = snapshot / page
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(subprocess.check_output(['git', 'show', f'f22474ec4:{page}'], cwd=ROOT))
    for page in ['app.express.cjs', 'support/development/docker-compose.yml', 'test/tooling/retirement-docs.test.cjs']:
        target = snapshot / page
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / page, target)
    (snapshot / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
    done = subprocess.run([NODE, '--test', '--test-reporter=tap', str(snapshot / 'test/tooling/retirement-docs.test.cjs')],
                          cwd=snapshot, env=ENV, capture_output=True, text=True, timeout=300)
    output = done.stdout + done.stderr
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'r23-incoming-regressions.tap').write_text(output)
    assert done.returncode == 1, output
    assert '# pass 0' in output and '# fail 10' in output and '# skipped 0' in output, output
    print(json.dumps({'snapshot': 'f22474ec4 documentation only', 'test': 'current retirement-docs.test.cjs',
                      'exitCode': done.returncode, 'pass': 0, 'fail': 10, 'skip': 0,
                      'expectedFailure': True, 'log': 'r23-incoming-regressions.tap'}))
