#!/usr/bin/env bash
set -e
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
exec node --env-file-if-exists=.env server.mjs
