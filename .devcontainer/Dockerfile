FROM mcr.microsoft.com/devcontainers/base:jammy

ENV NVM_DIR=/usr/local/share/nvm

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    git \
    gnupg2 \
    jq \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    pinentry-tty \
    unzip \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p "$NVM_DIR" \
  && curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash \
  && printf '%s\n' \
    'export NVM_DIR=/usr/local/share/nvm' \
    '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"' \
    > /etc/profile.d/nvm.sh \
  && chown -R vscode:vscode "$NVM_DIR"

RUN set -eux; \
  json="$(curl -s https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json)"; \
  chrome_url="$(echo "$json" | jq -r '.channels.Stable.downloads.chrome[] | select(.platform=="linux64") | .url')"; \
  driver_url="$(echo "$json" | jq -r '.channels.Stable.downloads.chromedriver[] | select(.platform=="linux64") | .url')"; \
  mkdir -p /opt/chrome /opt/chromedriver; \
  curl -sSL "$chrome_url" -o /tmp/chrome.zip; \
  unzip -q /tmp/chrome.zip -d /opt/chrome; \
  curl -sSL "$driver_url" -o /tmp/chromedriver.zip; \
  unzip -q /tmp/chromedriver.zip -d /opt/chromedriver; \
  rm -f /tmp/chrome.zip /tmp/chromedriver.zip; \
  ln -s /opt/chrome/chrome-linux64/chrome /usr/local/bin/google-chrome; \
  ln -s /opt/chromedriver/chromedriver-linux64/chromedriver /usr/local/bin/chromedriver
