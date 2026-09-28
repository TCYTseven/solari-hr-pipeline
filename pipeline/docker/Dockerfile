# Local fallback sandbox for screening submissions when no Solari key is set.
# Mirrors Solari's "base" template: Node + Python + git + build tools, headless.
# Built by pipeline/executors/docker.ts as solari-screener-sandbox:latest.
#
# node:22-bookworm (buildpack-deps) already ships git, curl, gcc/make and
# Python 3.11; apt adds pip, venv and the Python headers.
FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_ROOT_USER_ACTION=ignore \
    PYTHONUNBUFFERED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=1

# Optional extra CA (only present when SCREENER_DOCKER_CA_CERT is set, e.g.
# behind a TLS-intercepting proxy). Installed before anything talks HTTPS.
COPY ca/ /usr/local/share/ca-certificates/screener/
RUN update-ca-certificates >/dev/null 2>&1 || true
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt \
    PIP_CERT=/etc/ssl/certs/ca-certificates.crt \
    REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

# HTTPS mirrors: some networks block plain-HTTP apt traffic. If the Debian
# mirrors are unreachable altogether, keep going with the base image's tools.
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true
RUN (apt-get update \
     && apt-get install -y --no-install-recommends \
          python3 python3-pip python3-venv python3-dev git build-essential curl ca-certificates procps \
     && rm -rf /var/lib/apt/lists/*) \
 || echo "WARNING: Debian mirrors unreachable; using the base image's packages"
RUN ln -sf /usr/bin/python3 /usr/local/bin/python

# pip fallback when apt could not install python3-pip: bootstrap it from PyPI.
RUN python3 -m pip --version >/dev/null 2>&1 || ( \
      url=$(curl -fsSL https://pypi.org/pypi/pip/json | python3 -c "import json,sys; print(next(u['url'] for u in json.load(sys.stdin)['urls'] if u['filename'].endswith('.whl')))") \
      && whl=/tmp/$(basename "$url") && curl -fsSL -o "$whl" "$url" \
      && python3 "$whl/pip" install --no-cache-dir "$whl" && rm -f "$whl" \
      && ln -sf /usr/local/bin/pip3 /usr/local/bin/pip )

RUN pip install --no-cache-dir uv || echo "uv install failed; continuing without it"

COPY relay.cjs /opt/screener/relay.cjs
WORKDIR /work
CMD ["sleep", "infinity"]
