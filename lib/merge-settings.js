#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const HOOK_COMMAND = `bash -c 'file=$(echo "$CLAUDE_TOOL_INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get(\\"file_path\\",d.get(\\"path\\",\\"\\")))\" 2>/dev/null); [[ "$file" =~ /App/.+\\\\.js$|/lib/.+\\\\.dart$ ]] || exit 0; root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; bash "$root/scripts/ui_test_coverage.sh" || true'`;

const NEW_HOOK = {
  matcher: 'Write|Edit',
  hooks: [{ type: 'command', command: HOOK_COMMAND }]
};

function mergeSettings(targetDir) {
  const settingsPath = path.join(targetDir, '.claude', 'settings.json');
  const claudeDir = path.join(targetDir, '.claude');

  let settings = { permissions: { allow: [] }, hooks: { PostToolUse: [] } };

  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      throw new Error(`Could not parse existing .claude/settings.json: ${e.message}`);
    }
  }

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];

  const alreadyHasHook = settings.hooks.PostToolUse.some(
    h => h.matcher === 'Write|Edit' &&
         Array.isArray(h.hooks) &&
         h.hooks.some(hh => hh.command && hh.command.includes('ui_test_coverage'))
  );

  if (!alreadyHasHook) {
    settings.hooks.PostToolUse.push(NEW_HOOK);
  }

  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  return !alreadyHasHook;
}

module.exports = { mergeSettings };
