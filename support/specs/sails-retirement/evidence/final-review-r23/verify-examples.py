"""Syntax survey and incoming-doc regression replay; no portal/provider startup."""
import importlib.util
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import sys

sys.dont_write_bytecode = True

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('inventory', HERE / 'inventory.py')
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)
NODE = '/home/andrew/.nvm/versions/node/v26.11.1/bin/node'
ENV = {**os.environ, 'PATH': str(pathlib.Path(NODE).parent) + ':' + os.environ['PATH']}


def syntax():
    results = []
    with tempfile.TemporaryDirectory(prefix='r23-doc-syntax-') as scratch:
        for row in json.loads((inv.OUT / 'documentation-extracted.json').read_text()):
            for item in row['items']:
                if item['kind'] not in ('code', 'html-code'):
                    continue
                code = item['text']
                language = item['language'].lower()
                command = None
                if language in ('sh', 'bash', 'shell'):
                    command = ['bash', '-n']
                elif language in ('js', 'javascript') and 'module.exports' in code and not re_fragment(code):
                    command = [NODE, '--check']
                if command:
                    target = pathlib.Path(scratch) / ('sample.sh' if command[0] == 'bash' else 'sample.cjs')
                    target.write_text(code)
                    done = subprocess.run([*command, str(target)], capture_output=True, text=True, env=ENV)
                    results.append({'repo': row['repo'], 'page': row['page'], 'line': item['line'],
                                    'language': language, 'exitCode': done.returncode, 'stderr': done.stderr,
                                    'qualification': 'syntax only; placeholders require substitution' if done.returncode == 0 else 'review the recorded diagnostic'})
    (inv.OUT / 'syntax-final.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps({'syntaxChecks': len(results), 'pass': sum(x['exitCode'] == 0 for x in results),
                      'fail': [f"{x['repo']}:{x['page']}:{x['line']}" for x in results if x['exitCode']]}))


def re_fragment(code):
    return '{...}' in code or '[...]' in code


def incoming():
    with tempfile.TemporaryDirectory(prefix='r23-incoming-docs-') as scratch:
        root = pathlib.Path(scratch)
        for page in inv.pages(inv.PORTAL):
            file = root / page
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(subprocess.check_output(['git', 'show', f'f22474ec4:{page}'], cwd=inv.PORTAL))
        for page in ['app.express.cjs', 'support/development/docker-compose.yml']:
            file = root / page
            file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(inv.PORTAL / page, file)
        (root / 'node_modules').symlink_to(inv.PORTAL / 'node_modules', target_is_directory=True)
        test = root / 'test/tooling/retirement-docs.test.cjs'
        test.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(inv.PORTAL / 'test/tooling/retirement-docs.test.cjs', test)
        done = subprocess.run([NODE, '--test', str(test)], cwd=root, env=ENV, capture_output=True, text=True)
        (inv.OUT / 'all-docs-incoming.log').write_text(done.stdout + done.stderr)
        print(json.dumps({'incomingRegressionExit': done.returncode}))


if __name__ == '__main__':
    syntax()
    incoming()
