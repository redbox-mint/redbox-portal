#!/usr/bin/env bash
set -euo pipefail
reporting_demo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
reporting_demo_url="$(sed -n 's/^REDBOX_DEMO_URL=//p' "$reporting_demo_dir/.dev/demo.env")"
reporting_demo_port="$(node -e '
  const url = new URL(process.argv[1]);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("Provide the HTTPS Tailscale origin, including a dedicated port");
  const port = url.port || "443";
  if (port === "443" || port === "0")
    throw new Error("Use a dedicated HTTPS port such as 8443 to preserve the shared T3 endpoint");
  console.log(port);
' "$reporting_demo_url")"
if command -v iptables >/dev/null && docker network inspect redbox-reporting-demo_default >/dev/null 2>&1; then
  reporting_demo_bridge="br-$(docker network inspect redbox-reporting-demo_default --format '{{.Id}}' | cut -c1-12)"
  reporting_demo_subnet="$(docker network inspect redbox-reporting-demo_default --format '{{(index .IPAM.Config 0).Subnet}}')"
  reporting_demo_ip="$(tailscale ip -4)"
  reporting_demo_rule=(-i "$reporting_demo_bridge" -s "$reporting_demo_subnet" -d "$reporting_demo_ip" -p tcp --dport "$reporting_demo_port" -m comment --comment redbox-reporting-demo -j ACCEPT)
  if sudo iptables -C INPUT "${reporting_demo_rule[@]}" 2>/dev/null; then sudo iptables -D INPUT "${reporting_demo_rule[@]}"; fi
fi
sudo tailscale serve --https="$reporting_demo_port" off
docker compose --env-file "$reporting_demo_dir/.dev/demo.env" -f "$reporting_demo_dir/docker-compose.yml" down
# Named volumes retain the demo data and Keycloak realm for the next run.
