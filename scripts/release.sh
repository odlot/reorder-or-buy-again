#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'USAGE'
Usage: ./scripts/release.sh <version> [--push] [--skip-ci]

Arguments:
  <version>   SemVer version (for example: 0.1.0 or v0.1.0)

Options:
  --push      Push main and the created tag to origin.
  --skip-ci   Skip running local CI (npm run ci:local).
USAGE
}

fail() {
  echo "Release check failed: $1" >&2
  exit 1
}

version=""
push_release=false
skip_ci=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push)
      push_release=true
      shift
      ;;
    --skip-ci)
      skip_ci=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -z "$version" ]]; then
        version="$1"
        shift
      else
        fail "Unexpected argument: $1"
      fi
      ;;
  esac
done

if [[ -z "$version" ]]; then
  usage
  fail "Missing required <version> argument."
fi

version="${version#v}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  fail "Version must follow SemVer MAJOR.MINOR.PATCH."
fi

tag="v${version}"
release_date="$(date +%Y-%m-%d)"

if [[ -n "$(git status --porcelain)" ]]; then
  fail "Working tree must be clean before releasing."
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "main" ]]; then
  fail "Release must run from main (current: $current_branch)."
fi

if git rev-parse "$tag" >/dev/null 2>&1; then
  fail "Tag ${tag} already exists locally."
fi

if [[ -n "$(git ls-remote --tags origin "refs/tags/${tag}")" ]]; then
  fail "Tag ${tag} already exists on origin."
fi

git fetch origin main >/dev/null
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  fail "Local main is not aligned with origin/main. Pull latest changes first."
fi

unreleased_heading_count="$(grep -c '^#### Unreleased$' README.md || true)"
if [[ "$unreleased_heading_count" != "1" ]]; then
  fail "README.md must contain exactly one '#### Unreleased' heading."
fi

release_channel_count="$(grep -c '^- Current release channel:' README.md || true)"
if [[ "$release_channel_count" != "1" ]]; then
  fail "README.md must contain exactly one current release channel line."
fi

unreleased_change_count="$((
  $(awk '
    $0 == "#### Unreleased" { in_unreleased = 1; next }
    in_unreleased && ($0 ~ /^#### / || $0 ~ /^## /) { in_unreleased = 0 }
    in_unreleased && $0 ~ /^- / {
      if ($0 != "- _No changes yet._") {
        count += 1
      }
    }
    END { print count + 0 }
  ' README.md)
))"

if (( unreleased_change_count == 0 )); then
  fail "README.md Unreleased section has no releasable entries."
fi

if [[ "$skip_ci" == "false" ]]; then
  echo "Running local CI validation..."
  npm run ci:local
fi

tmp_readme_stage1="$(mktemp)"
tmp_readme_stage2="$(mktemp)"
trap 'rm -f "$tmp_readme_stage1" "$tmp_readme_stage2"' EXIT

awk -v release_tag="$tag" -v date_value="$release_date" '
  BEGIN {
    inserted = 0
  }
  {
    if (!inserted && $0 == "#### Unreleased") {
      print "#### Unreleased"
      print ""
      print "- _No changes yet._"
      print ""
      print "#### " release_tag " - " date_value
      inserted = 1
      next
    }

    print $0
  }
  END {
    if (!inserted) {
      exit 2
    }
  }
' README.md > "$tmp_readme_stage1"

awk -v release_tag="$tag" '
  {
    if ($0 ~ /^- Current release channel:/) {
      print "- Current release channel: " release_tag "."
      next
    }

    print $0
  }
' "$tmp_readme_stage1" > "$tmp_readme_stage2"

if cmp -s README.md "$tmp_readme_stage2"; then
  fail "README.md release metadata was unchanged; aborting."
fi

mv "$tmp_readme_stage2" README.md

git add README.md
git commit -m "chore(release): ${tag}"
git tag -a "$tag" -m "Release ${tag}"

echo "Created release commit and tag: ${tag}"

echo "Next steps:"
echo "1. Review: git show --stat"
echo "2. Push branch or main with the release commit"
echo "3. Push tag: git push origin ${tag}"

if [[ "$push_release" == "true" ]]; then
  git push origin main
  git push origin "$tag"
  echo "Pushed main and ${tag} to origin."
fi
