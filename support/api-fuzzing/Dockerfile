# Pinned Schemathesis with tracecov disabled
# The :stable image has tracecov pre-installed at /app/hooks.py which
# crashes with KeyError: 'coverage_format'. We pin a specific version
# and override the hooks file with a no-op to disable tracecov entirely.
# Our hooks (auth injection, secret redaction) load via the TOML
# "hooks" config instead.
FROM ghcr.io/schemathesis/schemathesis:4.21.0

# Override the built-in tracecov hooks file with a no-op
COPY hooks/disable_tracecov.py /app/hooks.py
