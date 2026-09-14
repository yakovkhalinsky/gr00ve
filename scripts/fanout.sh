#!/usr/bin/env bash
#
# Fan a make target out to every project in the monorepo.
#
#   scripts/fanout.sh <target> [<target>...]
#
# A "project" is any directory under apps/ or packages/ containing a Makefile.
# Projects are only required to implement the targets they care about; a missing
# target is reported as SKIP and tolerated unless STRICT=1 is set.
#
# Environment:
#   PKG="apps/a packages/b"  restrict the fan-out to these project paths
#   STRICT=1                 treat a project lacking the target as a failure
#   NO_COLOR=1               disable ANSI colour
#
# Exits non-zero if any project's target fails, or if STRICT=1 and anything
# was skipped.

set -uo pipefail

if [[ -n "${NO_COLOR:-}" || ! -t 1 ]]; then
  RED=; GREEN=; BLUE=; YELLOW=; BOLD=; OFF=
else
  RED=$'\033[1;31m'; GREEN=$'\033[1;32m'; BLUE=$'\033[1;34m'
  YELLOW=$'\033[1;33m'; BOLD=$'\033[1m'; OFF=$'\033[0m'
fi

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT" || exit 1

# Directories that are never projects and should not be descended into.
PRUNE_DIRS=(node_modules .git .venv venv vendor target dist build .next __pycache__)

discover() {
  local expr=() d
  for d in "${PRUNE_DIRS[@]}"; do expr+=(-name "$d" -o); done
  expr+=(-false) # keeps the -o chain well-formed
  find apps packages -mindepth 2 \( "${expr[@]}" \) -prune -o -name Makefile -print 2>/dev/null \
    | sed 's|/Makefile$||' | sort
}

if [[ "${1:-}" == "--list" ]]; then
  discover
  exit 0
fi

if [[ $# -eq 0 ]]; then
  echo "usage: scripts/fanout.sh <target> [<target>...]" >&2
  echo "       scripts/fanout.sh --list" >&2
  exit 2
fi
targets=("$@")

if [[ -n "${PKG:-}" ]]; then
  read -r -a projects <<<"$PKG"
else
  mapfile -t projects < <(discover)
fi

if [[ ${#projects[@]} -eq 0 ]]; then
  echo "no projects found under apps/ or packages/" >&2
  exit 0
fi

fail=0
skip=0

for t in "${targets[@]}"; do
  for p in "${projects[@]}"; do
    if [[ ! -f "$p/Makefile" ]]; then
      printf '%sMISS%s %s :: no Makefile at %s/Makefile\n' "$RED" "$OFF" "$p" "$p"
      fail=1
      continue
    fi

    # `make -n` resolves the target without running it, which is how we tell
    # "project doesn't implement this" apart from "project failed".
    if make -C "$p" --no-print-directory -n "$t" >/dev/null 2>&1; then
      printf '\n%s==>%s %s%s%s :: %s\n' "$BLUE" "$OFF" "$BOLD" "$p" "$OFF" "$t"
      make -C "$p" --no-print-directory "$t" || fail=1
    else
      printf '\n%sSKIP%s %s :: no target "%s"\n' "$YELLOW" "$OFF" "$p" "$t"
      skip=$((skip + 1))
    fi
  done
done

echo
if ((fail)); then
  printf '%sFAILED%s\n' "$RED" "$OFF"
  exit 1
fi
if [[ "${STRICT:-0}" == "1" && $skip -gt 0 ]]; then
  printf '%sFAILED%s: %d skipped target(s) under STRICT=1\n' "$RED" "$OFF" "$skip"
  exit 1
fi
printf '%sOK%s\n' "$GREEN" "$OFF"
