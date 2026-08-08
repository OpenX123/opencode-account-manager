#!/usr/bin/env bash
set -euo pipefail

/opt/certbot-ip/bin/certbot renew --quiet
install -m 0644 /etc/letsencrypt/live/154.64.254.52/fullchain.pem /opt/1panel/apps/openresty/openresty/conf/ssl/ocam-ip/fullchain.pem
install -m 0600 /etc/letsencrypt/live/154.64.254.52/privkey.pem /opt/1panel/apps/openresty/openresty/conf/ssl/ocam-ip/privkey.pem
docker exec 1Panel-openresty-esRe openresty -t
docker exec 1Panel-openresty-esRe openresty -s reload
