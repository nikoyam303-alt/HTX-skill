#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

for skill_name in htx-huobao-fast htx-brand; do
  source_dir="$REPO_ROOT/skills/$skill_name"
  if [[ ! -f "$source_dir/SKILL.md" ]]; then
    echo "Missing $source_dir/SKILL.md" >&2
    exit 1
  fi

  (
    cd "$source_dir"
    find . -type f -not -name '.DS_Store' -print0 \
      | LC_ALL=C sort -z \
      | xargs -0 zip -X -q "$BUILD_DIR/$skill_name.skill"
  )

  (
    cd "$REPO_ROOT/skills"
    find "$skill_name" -type f -not -name '.DS_Store' -print0 \
      | LC_ALL=C sort -z \
      | xargs -0 zip -X -q "$BUILD_DIR/$skill_name.zip"
  )
done

mkdir -p "$REPO_ROOT/downloads"
for package in "$BUILD_DIR"/*; do
  mv "$package" "$REPO_ROOT/downloads/$(basename "$package")"
done

python3 "$SCRIPT_DIR/verify-packages.py"
