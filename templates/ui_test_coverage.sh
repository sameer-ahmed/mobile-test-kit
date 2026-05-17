#!/usr/bin/env bash
# ui_test_coverage.sh
#
# Framework-agnostic UI test coverage checker.
# Auto-detects React Native or Flutter and scans the right files.
#
# React Native: scans App/**/*.js for testID= / accessibilityLabel=
#               checks android/app/src/androidTest/**/*.kt + ios/SmokeTestUITests/**/*.swift
#
# Flutter:      scans lib/**/*.dart for ValueKey(...) / Key(...) / Semantics(label:...)
#               checks integration_test/**/*.dart (unified Android+iOS test file)
#
# For every uncovered ID a clearly-marked TODO stub is appended to the
# relevant test file(s) — idempotent, same ID is never appended twice.
#
# Usage:
#   bash scripts/ui_test_coverage.sh          # from repo root
#   bundle exec fastlane android checkTestCoverage
#   bundle exec fastlane ios checkTestCoverage
#
# Exit codes:
#   0  — all instrumented IDs covered (or already stubbed)
#   1  — one or more gaps detected (stubs appended, action required)

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $*"; }

# ── Framework detection ────────────────────────────────────────────────────────

detect_framework() {
  # React Native: has App/ directory with JS files containing testID=
  if [ -d "$REPO_ROOT/App" ] && \
     grep -rql --include="*.js" 'testID=\|accessibilityLabel=' "$REPO_ROOT/App" 2>/dev/null; then
    echo "react-native"
  # Flutter: has lib/ directory with Dart files
  elif [ -d "$REPO_ROOT/lib" ] && \
       find "$REPO_ROOT/lib" -name "*.dart" | head -1 | grep -q .; then
    echo "flutter"
  else
    echo "unknown"
  fi
}

FRAMEWORK=$(detect_framework)

# ── Framework-specific configuration ──────────────────────────────────────────

case "$FRAMEWORK" in

  react-native)
    APP_DIR="$REPO_ROOT/App"
    TEST_FILES_ANDROID=$(find "$REPO_ROOT/android" -name "*.kt" -path "*/androidTest/*" 2>/dev/null | head -1)
    TEST_FILES_IOS=$(find "$REPO_ROOT/ios" -name "*.swift" -path "*/SmokeTestUITests/*" 2>/dev/null | head -1)
    FRAMEWORK_LABEL="React Native"

    static_ids() {
      grep -rn --include="*.js" 'testID=\|accessibilityLabel=' "$APP_DIR" \
        | grep -Ev '^[^:]+:[0-9]+:[[:space:]]*//' \
        | grep -oE '(testID|accessibilityLabel)="[^"]+"' \
        | grep -oE '"[^"]+"' \
        | tr -d '"' \
        | sort -u
    }

    dynamic_prefixes() {
      grep -rn --include="*.js" 'testID=\|accessibilityLabel=' "$APP_DIR" \
        | grep -Ev '^[^:]+:[0-9]+:[[:space:]]*//' \
        | grep -oE '`[a-z][a-z0-9-]+-\$\{' \
        | grep -oE '`[a-z][a-z0-9-]+-' \
        | tr -d '`' \
        | sort -u
    }

    source_file_for() {
      grep -rl --include="*.js" "testID=\"${1}\"\|accessibilityLabel=\"${1}\"" "$APP_DIR" \
        | sed "s|$REPO_ROOT/||" | head -1
    }

    test_refs() {
      local files=""
      [ -n "${TEST_FILES_ANDROID:-}" ] && files="$files $TEST_FILES_ANDROID"
      [ -n "${TEST_FILES_IOS:-}"     ] && files="$files $TEST_FILES_IOS"
      [ -z "$files" ] && return
      grep -ohE '"[a-z][a-z0-9-]+"' $files \
        | tr -d '"' \
        | sort -u
    }

    stub_android() {
      local id="$1" src="$2"
      [ -z "${TEST_FILES_ANDROID:-}" ] && return
      stub_exists "$TEST_FILES_ANDROID" "$id" && return
      local stub
      stub=$(printf \
        '    // ── UI_COVERAGE_STUB:%s ──────────────────────────────────────────────\n    // SOURCE: %s\n    // TODO: add a test step for '\''%s'\''.\n    // Example:\n    //   waitDesc("%s", 10_000).click()\n    //   device.waitForIdle(1_500)\n    // ────────────────────────────────────────────────────────────────────────' \
        "$id" "$src" "$id" "$id")
      insert_stub "$TEST_FILES_ANDROID" "$stub"
    }

    stub_ios() {
      local id="$1" src="$2"
      [ -z "${TEST_FILES_IOS:-}" ] && return
      stub_exists "$TEST_FILES_IOS" "$id" && return
      local stub
      stub=$(printf \
        '    // ── UI_COVERAGE_STUB:%s ──────────────────────────────────────────────\n    // SOURCE: %s\n    // TODO: add a test step for '\''%s'\''.\n    // Example:\n    //   tap("%s")\n    //   XCTAssertTrue(el("%s").waitForExistence(timeout: 5))\n    // ────────────────────────────────────────────────────────────────────────' \
        "$id" "$src" "$id" "$id" "$id")
      insert_stub "$TEST_FILES_IOS" "$stub"
    }

    append_stubs() { stub_android "$1" "$2"; stub_ios "$1" "$2"; }

    any_stub_exists() {
      local id="$1"
      { [ -n "${TEST_FILES_ANDROID:-}" ] && stub_exists "$TEST_FILES_ANDROID" "$id"; } || \
      { [ -n "${TEST_FILES_IOS:-}"     ] && stub_exists "$TEST_FILES_IOS"     "$id"; }
    }
    ;;

  flutter)
    APP_DIR="$REPO_ROOT/lib"
    # Flutter uses a single integration_test file for both Android and iOS
    TEST_FILE_FLUTTER=$(find "$REPO_ROOT/integration_test" -name "*.dart" 2>/dev/null | head -1)
    # Fallback: check test/ directory
    if [ -z "${TEST_FILE_FLUTTER:-}" ]; then
      TEST_FILE_FLUTTER=$(find "$REPO_ROOT/test" -name "*integration*" -o -name "*e2e*" 2>/dev/null | head -1)
    fi
    FRAMEWORK_LABEL="Flutter"

    static_ids() {
      # Matches: ValueKey('id'), Key('id'), ValueKey("id"), Key("id")
      # Also:    semanticsLabel: 'id'  (inside Semantics widget)
      grep -rn --include="*.dart" \
        "ValueKey(\|Key(\|semanticsLabel[[:space:]]*:" "$APP_DIR" \
        | grep -Ev '^[^:]+:[0-9]+:[[:space:]]*//' \
        | grep -oE "(ValueKey|Key)\('[^']+'\)|(ValueKey|Key)\(\"[^\"]+\"\)|semanticsLabel[[:space:]]*:[[:space:]]*'[^']+'|semanticsLabel[[:space:]]*:[[:space:]]*\"[^\"]+" \
        | grep -oE "'[^']+'\)|\"[^\"]+\"|'[^']+'" \
        | tr -d "'\")" \
        | grep -v '^$' \
        | sort -u
    }

    dynamic_prefixes() {
      # Flutter dynamic keys: ValueKey('item-$index') → prefix "item-"
      grep -rn --include="*.dart" "ValueKey(\|Key(" "$APP_DIR" \
        | grep -Ev '^[^:]+:[0-9]+:[[:space:]]*//' \
        | grep -oE "(ValueKey|Key)\('[a-z][a-z0-9-]+-\\\$" \
        | grep -oE "'[a-z][a-z0-9-]+-" \
        | tr -d "'" \
        | sort -u
    }

    source_file_for() {
      grep -rl --include="*.dart" \
        "ValueKey('${1}')\|Key('${1}')\|ValueKey(\"${1}\")\|Key(\"${1}\")\|semanticsLabel.*['\"]${1}['\"]" \
        "$APP_DIR" 2>/dev/null \
        | sed "s|$REPO_ROOT/||" | head -1
    }

    test_refs() {
      [ -z "${TEST_FILE_FLUTTER:-}" ] && return
      # Flutter tests reference keys with find.byValueKey('id') or find.byKey(ValueKey('id'))
      grep -ohE "'[a-z][a-z0-9-]+'" "$TEST_FILE_FLUTTER" \
        | tr -d "'" \
        | sort -u
    }

    stub_flutter() {
      local id="$1" src="$2"
      [ -z "${TEST_FILE_FLUTTER:-}" ] && return
      stub_exists "$TEST_FILE_FLUTTER" "$id" && return
      local stub
      stub=$(printf \
        '    // ── UI_COVERAGE_STUB:%s ──────────────────────────────────────────────\n    // SOURCE: %s\n    // TODO: add a test step for '\''%s'\''.\n    // Example:\n    //   await tester.tap(find.byValueKey('\''%s'\''));\n    //   await tester.pumpAndSettle();\n    // ────────────────────────────────────────────────────────────────────────' \
        "$id" "$src" "$id" "$id")
      insert_stub "$TEST_FILE_FLUTTER" "$stub"
    }

    append_stubs()    { stub_flutter "$1" "$2"; }
    any_stub_exists() { [ -n "${TEST_FILE_FLUTTER:-}" ] && stub_exists "$TEST_FILE_FLUTTER" "$1"; }
    ;;

  *)
    echo -e "${RED}Could not detect framework.${NC}"
    echo "Expected either:"
    echo "  React Native — App/ directory with testID= in .js files"
    echo "  Flutter      — lib/ directory with .dart files"
    exit 1
    ;;
esac

# ── Shared helpers ─────────────────────────────────────────────────────────────

stub_exists() {
  local file="$1" id="$2"
  grep -q "UI_COVERAGE_STUB:${id}" "$file" 2>/dev/null
}

# Insert stub INSIDE the class/group body — before the last top-level closing brace.
insert_stub() {
  local file="$1" stub="$2"
  python3 - "$file" "$stub" <<'PYEOF'
import sys
path, stub = sys.argv[1], sys.argv[2]
with open(path) as f:
    lines = f.readlines()
insert_at = None
for i in range(len(lines) - 1, -1, -1):
    if lines[i].rstrip() == '}':
        insert_at = i
        break
if insert_at is None:
    lines.append(stub + '\n')
else:
    lines.insert(insert_at, stub + '\n')
with open(path, 'w') as f:
    f.writelines(lines)
PYEOF
}

# ── Main ──────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  UI Test Coverage Report  —  $(date '+%Y-%m-%d %H:%M')${NC}"
echo -e "${BOLD}  Framework: ${FRAMEWORK_LABEL}${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

STATIC=$(static_ids 2>/dev/null | grep -v '^$' || true)
PREFIXES=$(dynamic_prefixes 2>/dev/null | grep -v '^$' || true)
REFS=$(test_refs 2>/dev/null || true)

covered=0; uncovered=0; stubbed=0
uncovered_list=()

# ── 1. Static IDs ─────────────────────────────────────────────────────────────
echo -e "${BOLD}Static widget keys / testIDs${NC}"
while IFS= read -r id; do
  [ -z "$id" ] && continue
  src=$(source_file_for "$id")
  if any_stub_exists "$id"; then
    warn "$id  [stub present — needs implementation]  ($src)"
    stubbed=$((stubbed+1))
  elif echo "$REFS" | grep -qx "$id"; then
    ok "$id"
    covered=$((covered+1))
  else
    fail "$id  — not covered, appending stubs  ($src)"
    append_stubs "$id" "$src"
    uncovered=$((uncovered+1))
    uncovered_list+=("$id")
  fi
done <<< "$STATIC"

# ── 2. Dynamic prefix patterns ────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Dynamic key patterns${NC}"
while IFS= read -r prefix; do
  [ -z "$prefix" ] && continue
  if any_stub_exists "${prefix}*"; then
    warn "${prefix}*  [stub present — needs implementation]"
    stubbed=$((stubbed+1))
  elif echo "$REFS" | grep -q "^${prefix}"; then
    ok "${prefix}*  (at least one instance covered)"
    covered=$((covered+1))
  else
    fail "${prefix}*  — no instance found, appending stubs"
    append_stubs "${prefix}*" "dynamic pattern"
    uncovered=$((uncovered+1))
    uncovered_list+=("${prefix}*")
  fi
done <<< "$PREFIXES"

# ── 3. Orphan check ───────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Orphan keys (tests reference ID not found in source)${NC}"
orphan=0
while IFS= read -r ref; do
  [ ${#ref} -lt 4 ] && continue
  in_static=$(echo "$STATIC"   | grep -cxF "$ref" || true)
  in_dynamic=$(echo "$PREFIXES" | awk -v r="$ref" 'length($0)>0 && index(r,$0)==1{found=1} END{print found+0}')
  if [ "$in_static" -eq 0 ] && [ "$in_dynamic" -eq 0 ]; then
    warn "$ref"
    orphan=$((orphan+1))
  fi
done <<< "$REFS"
[ "$orphan" -eq 0 ] && echo "  (none)"

# ── Summary ───────────────────────────────────────────────────────────────────
total=$((covered + uncovered + stubbed))
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo    "  Covered          : $covered / $total"
[ "$stubbed"   -gt 0 ] && echo "  Stub (pending)   : $stubbed / $total"
[ "$uncovered" -gt 0 ] && echo "  Newly stubbed    : $uncovered / $total  ← stubs appended to test files"
[ "$orphan"    -gt 0 ] && echo "  Orphan refs      : $orphan  (keys in tests with no source match)"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

if [ "$uncovered" -gt 0 ]; then
  ids_joined=$(printf '%s, ' "${uncovered_list[@]}" | sed 's/, $//')
  echo "Stubs appended to test file(s) in your project."
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║  💡 Ask Claude to implement these stubs now:         ║${NC}"
  echo -e "${BOLD}║                                                      ║${NC}"
  echo -e "${BOLD}║  implement UI test stubs for: ${ids_joined}${NC}"
  echo -e "${BOLD}║                                                      ║${NC}"
  echo -e "${BOLD}║  Or defer — stubs are saved and won't duplicate.     ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
  exit 1
fi

if [ "$stubbed" -gt 0 ]; then
  echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║  💡 Pending stubs need implementation. Ask Claude:   ║${NC}"
  echo -e "${BOLD}║                                                      ║${NC}"
  echo -e "${BOLD}║  implement all UI_COVERAGE_STUB items in test files  ║${NC}"
  echo -e "${BOLD}║                                                      ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
  exit 1
fi

echo -e "${GREEN}All instrumented keys are covered.${NC} ✓"
exit 0
