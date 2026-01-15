#!/usr/bin/env bash
set -uo pipefail

export NVM_DIR="${NVM_DIR:-/usr/local/share/nvm}"

# Determine which nvm script to source
NVM_SCRIPT=""
if [ -s /etc/profile.d/nvm.sh ]; then
  NVM_SCRIPT="/etc/profile.d/nvm.sh"
elif [ -s "${NVM_DIR}/nvm.sh" ]; then
  NVM_SCRIPT="${NVM_DIR}/nvm.sh"
else
  echo "nvm not found at /etc/profile.d/nvm.sh or ${NVM_DIR}/nvm.sh" >&2
  exit 1
fi

# shellcheck disable=SC1090
# nvm.sh can return non-zero even on success, so we don't use set -e
. "${NVM_SCRIPT}" || true

# Install and configure Node 24
nvm install 24 || { echo "Failed to install Node 24"; exit 1; }
nvm alias default 24 || true
nvm use 24 || true

# Ensure nvm is sourced in new shell sessions by adding to .bashrc
if ! grep -q "NVM_DIR" ~/.bashrc 2>/dev/null; then
  cat >> ~/.bashrc << 'EOF'

# Load nvm
export NVM_DIR="/usr/local/share/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
EOF
fi
