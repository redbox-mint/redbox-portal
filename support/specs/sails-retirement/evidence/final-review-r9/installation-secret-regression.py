"""Run from the repository root with Docker Compose installed; starts no resources."""
import json
import os
import pathlib
import secrets
import subprocess

output = pathlib.Path('.tmp/sails-retirement/final-review-r9')
output.mkdir(parents=True, exist_ok=True)
environment = dict(os.environ)
environment.pop('REDBOX_SESSION_SECRET', None)
command = ['docker', 'compose', '-f', 'support/development/docker-compose.yml',
           '--profile', 'build', 'config', '--quiet']
missing = subprocess.run(command, env=environment, capture_output=True, text=True)
assert missing.returncode != 0 and 'REDBOX_SESSION_SECRET' in missing.stderr
(output / 'install-guide-secret-red.log').write_text(missing.stdout + missing.stderr)

environment['REDBOX_SESSION_SECRET'] = secrets.token_hex(32)
documented = subprocess.run(command, env=environment, capture_output=True, text=True)
assert documented.returncode == 0, documented.stderr
(output / 'install-guide-secret-green.log').write_text(documented.stdout + documented.stderr)
guides = ['support/wiki/Installation-Guide.md', 'support/development/README.md',
          'support/wiki/Compiling-and-running-the-development-environment.md']
for guide in guides:
    assert 'export REDBOX_SESSION_SECRET=' in pathlib.Path(guide).read_text(), guide
(output / 'install-guide-secret-results.json').write_text(json.dumps({
    'missingSecretExit': missing.returncode,
    'documentedSecretExit': documented.returncode,
    'documentedGuides': len(guides),
}, indent=2) + '\n')
print('Documented secret: negative and positive Compose controls passed')
