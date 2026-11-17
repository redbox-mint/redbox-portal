#!/usr/bin/env bash
set -euo pipefail
reporting_demo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${1:-}" ]]; then
  reporting_demo_url="$1"
else
  reporting_demo_dns="$(tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')"
  reporting_demo_url="https://${reporting_demo_dns}:8443"
fi
reporting_demo_port="$(node -e '
  const url = new URL(process.argv[1]);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("Provide the HTTPS Tailscale origin, including a dedicated port");
  const port = url.port || "443";
  if (port === "443" || port === "0")
    throw new Error("Use a dedicated HTTPS port such as 8443 to preserve the shared T3 endpoint");
  console.log(port);
' "$reporting_demo_url")"
node "$reporting_demo_dir/prepare.js" "$reporting_demo_url"
docker compose --env-file "$reporting_demo_dir/.dev/demo.env" -f "$reporting_demo_dir/docker-compose.yml" up -d
sudo tailscale serve --bg --https="$reporting_demo_port" http://127.0.0.1:18080

# This Linux host rejects Docker-to-host connections by default. Permit only
# this isolated bridge to reach this host's demo TLS port for OIDC/JWKS fetching.
if command -v iptables >/dev/null; then
  reporting_demo_bridge="br-$(docker network inspect redbox-reporting-demo_default --format '{{.Id}}' | cut -c1-12)"
  reporting_demo_subnet="$(docker network inspect redbox-reporting-demo_default --format '{{(index .IPAM.Config 0).Subnet}}')"
  reporting_demo_ip="$(tailscale ip -4)"
  reporting_demo_rule=(-i "$reporting_demo_bridge" -s "$reporting_demo_subnet" -d "$reporting_demo_ip" -p tcp --dport "$reporting_demo_port" -m comment --comment redbox-reporting-demo -j ACCEPT)
  if ! sudo iptables -C INPUT "${reporting_demo_rule[@]}" 2>/dev/null; then
    sudo iptables -I INPUT 2 "${reporting_demo_rule[@]}"
  fi
fi
echo "Demo starting at ${reporting_demo_url}/default/mcp"
echo "Wait for reporting_demo_ready in the portal logs, then run node ${reporting_demo_dir}/verify.js"
