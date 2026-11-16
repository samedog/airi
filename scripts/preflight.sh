#!/usr/bin/env bash
# Local validation for this fork.
#
# GitHub Actions does not run on samedog/airi, so this script is the CI
# substitute. Run it before opening a PR and again after rebasing onto upstream.
#
# Usage:
#   scripts/preflight.sh                 # install, typecheck, tests, bundle
#   scripts/preflight.sh --skip-install  # dependencies already installed
#   scripts/preflight.sh --skip-build    # skip the desktop bundle

set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"

SKIP_INSTALL=0
SKIP_BUILD=0

usage() {
    cat <<'EOF'
Usage: scripts/preflight.sh [--skip-install] [--skip-build]

Runs the local checks the fork relies on while its GitHub Actions stay idle:
install, full typecheck, targeted Beat Sync and VRM tests, and build:unpack.
EOF
}

for arg in "$@"; do
    case "$arg" in
        --skip-install) SKIP_INSTALL=1 ;;
        --skip-build) SKIP_BUILD=1 ;;
        -h|--help) usage; exit 0 ;;
        *)
            echo "preflight: unknown option: $arg" >&2
            usage >&2
            exit 2
            ;;
    esac
done

step() {
    printf '\n== %s ==\n' "$1"
}

if [ "$SKIP_INSTALL" -eq 0 ]; then
    step "pnpm install"
    pnpm install
fi

step "typecheck (full workspace)"
pnpm typecheck

step "Beat Sync and VRM animation tests"
pnpm --filter @proj-airi/stage-shared exec vitest run src/beat-sync src/vrm-animations.test.ts

step "character card and ACT prompt tests"
pnpm --filter @proj-airi/stage-ui exec vitest run src/stores/modules/airi-card.test.ts src/constants/prompts/vrm-act.test.ts --project node

step "VRM animation tests"
pnpm --filter @proj-airi/stage-ui-three exec vitest run src/composables/vrm/animation.test.ts

if [ "$SKIP_BUILD" -eq 0 ]; then
    step "desktop bundle (build:unpack)"
    pnpm --filter @proj-airi/stage-tamagotchi build:unpack
fi

printf '\npreflight passed\n'
