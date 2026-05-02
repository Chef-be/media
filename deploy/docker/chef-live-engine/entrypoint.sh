#!/bin/sh
set -eu

CONFIG_PATH="${CHEF_LIVE_ENGINE_CONFIG_PATH:-/var/lib/chef-live/mediamtx.yml}"
DEFAULT_CONFIG_PATH="/defaults/mediamtx.yml"

mkdir -p "$(dirname "$CONFIG_PATH")"

if [ ! -f "$CONFIG_PATH" ]; then
  cp "$DEFAULT_CONFIG_PATH" "$CONFIG_PATH"
fi

exec mediamtx "$CONFIG_PATH"
