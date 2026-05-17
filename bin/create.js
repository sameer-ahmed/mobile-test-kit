#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const prompts = require('prompts');
const kleur = require('kleur');

const { detectFramework } = require('../lib/detect');
const { mergeSettings } = require('../lib/merge-settings');
const { copyScript, copyRoboScript, copyTestSkeletons, readFastlaneHelpers } = require('../lib/copy-files');

const targetDir = process.cwd();

function header() {
  console.log('');
  console.log(kleur.bold().cyan('  ┌─────────────────────────────────────────┐'));
  console.log(kleur.bold().cyan('  │  mobile-test-kit  v' + require('../package.json').version + '                  │'));
  console.log(kleur.bold().cyan('  │  Firebase Test Lab · Device Routing     │'));
  console.log(kleur.bold().cyan('  │  Coverage Drift Detection               │'));
  console.log(kleur.bold().cyan('  └─────────────────────────────────────────┘'));
  console.log('');
}

function ok(msg) { console.log(kleur.green('  ✓ ') + msg); }
function warn(msg) { console.log(kleur.yellow('  ⚠ ') + msg); }
function info(msg) { console.log(kleur.cyan('  → ') + msg); }
function section(msg) {
  console.log('');
  console.log(kleur.bold().white('  ' + msg));
  console.log(kleur.dim('  ' + '─'.repeat(msg.length)));
}

function installGitHook(targetDir) {
  const hookDir = path.join(targetDir, '.git', 'hooks');
  if (!fs.existsSync(hookDir)) return false;
  const hookPath = path.join(hookDir, 'post-checkout');
  const preCommitPath = path.join(hookDir, 'pre-commit');

  const hookScript = `#!/bin/bash
# mobile-test-kit: run coverage check before commit
# PRECOMMIT=1 tells the script: warn on pre-existing stubs but only block on NEW gaps.
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
PRECOMMIT=1 bash "$ROOT/scripts/ui_test_coverage.sh"
`;

  // Add to pre-commit hook (append if exists, create if not)
  if (fs.existsSync(preCommitPath)) {
    const existing = fs.readFileSync(preCommitPath, 'utf8');
    if (!existing.includes('ui_test_coverage')) {
      fs.appendFileSync(preCommitPath, '\n' + hookScript);
      return 'appended';
    }
    return 'exists';
  } else {
    fs.writeFileSync(preCommitPath, `#!/bin/bash\n${hookScript}`);
    fs.chmodSync(preCommitPath, 0o755);
    return 'created';
  }
}

async function run() {
  header();

  const framework = detectFramework(targetDir);

  if (framework === 'unknown') {
    console.log(kleur.red('  ✗ Could not detect framework.'));
    console.log('');
    console.log('    Expected either:');
    console.log('      React Native  — package.json with react-native + App/ directory');
    console.log('      Flutter       — pubspec.yaml + lib/ directory');
    console.log('');
    process.exit(1);
  }

  console.log(kleur.bold('  Detected framework: ') + kleur.cyan(framework === 'react-native' ? 'React Native' : 'Flutter'));
  console.log(kleur.dim('  Target: ') + targetDir);
  console.log('');

  const answers = await prompts([
    {
      type: 'text',
      name: 'ftlProject',
      message: 'Firebase Test Lab project ID?',
      initial: '',
      validate: v => v.trim().length > 0 ? true : 'Required'
    },
    {
      type: 'text',
      name: 'ftlBucket',
      message: 'GCS results bucket (gs://...)?',
      initial: 'gs://' + path.basename(targetDir) + '-test-lab-results',
      validate: v => v.startsWith('gs://') ? true : 'Must start with gs://'
    },
    {
      type: framework === 'react-native' ? 'text' : null,
      name: 'androidPackage',
      message: 'Android package name? (e.g. com.mycompany.myapp)',
      initial: 'com.mycompany.' + path.basename(targetDir).toLowerCase().replace(/[^a-z0-9]/g, ''),
      validate: v => /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(v.trim()) ? true : 'Must be a valid package name, e.g. com.acme.myapp'
    },
    {
      type: framework === 'flutter' ? 'text' : null,
      name: 'flutterPackage',
      message: 'Flutter package name? (from pubspec.yaml → name:)',
      initial: path.basename(targetDir).toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      validate: v => /^[a-z][a-z0-9_]*$/.test(v.trim()) ? true : 'Must be a valid Dart package name (lowercase, underscores)'
    },
    {
      type: 'select',
      name: 'hookType',
      message: 'How should coverage checks be triggered automatically?',
      choices: [
        {
          title: 'Claude Code hook  (PostToolUse — fires on every file edit)',
          description: 'Best if your team uses Claude Code',
          value: 'claude'
        },
        {
          title: 'Git pre-commit hook  (fires before every commit)',
          description: 'Works with any editor — Cursor, Copilot, Windsurf, VS Code',
          value: 'git'
        },
        {
          title: 'Both',
          description: 'Claude Code for real-time + git pre-commit as safety net',
          value: 'both'
        },
        {
          title: 'Manual only  (I\'ll run bash scripts/ui_test_coverage.sh myself)',
          value: 'none'
        }
      ],
      initial: 0
    },
    {
      type: 'confirm',
      name: 'createSkeletons',
      message: 'Create starter test files? (empty class + helpers — stubs auto-fill as you add testIDs)',
      initial: true
    }
  ], { onCancel: () => process.exit(0) });

  const { ftlProject, ftlBucket, androidPackage, flutterPackage, hookType, createSkeletons } = answers;

  section('Installing files');

  // 1. Coverage script
  const scriptDest = copyScript(targetDir);
  ok(`scripts/ui_test_coverage.sh`);

  // 2. Robo script template (RN only)
  if (framework === 'react-native') {
    const roboDest = copyRoboScript(targetDir);
    if (roboDest) {
      ok(`testlab/robo_script_android.json  (template — update resource IDs to match your login flow)`);
    } else {
      info(`testlab/robo_script_android.json already exists, skipped`);
    }
  }

  // 3. Starter test skeletons
  if (createSkeletons) {
    const installed = copyTestSkeletons(targetDir, framework, androidPackage, flutterPackage);
    for (const f of installed) {
      if (f.skipped) {
        info(`${f.rel}  already exists, skipped`);
      } else {
        ok(`${f.rel}  (empty class + helpers — stubs will fill in as you add testIDs)`);
      }
    }
  }

  // 4. Hooks
  if (hookType === 'claude' || hookType === 'both') {
    const added = mergeSettings(targetDir);
    if (added) {
      ok(`.claude/settings.json  →  PostToolUse hook added`);
    } else {
      info(`.claude/settings.json  →  hook already present, skipped`);
    }
  }

  if (hookType === 'git' || hookType === 'both') {
    const result = installGitHook(targetDir);
    if (result === 'created') ok(`.git/hooks/pre-commit  →  coverage check added`);
    else if (result === 'appended') ok(`.git/hooks/pre-commit  →  appended to existing hook`);
    else if (result === 'exists') info(`.git/hooks/pre-commit  →  hook already present, skipped`);
    else warn(`No .git directory found — git hook skipped. Run git init first if needed.`);
  }

  // 5. Fastlane
  section('Fastlane lanes');
  const rb = readFastlaneHelpers(ftlProject, ftlBucket);
  const snippetPath = path.join(targetDir, 'fastlane', 'FastFile-TestKit.rb');
  const fastlaneDir = path.join(targetDir, 'fastlane');
  if (!fs.existsSync(fastlaneDir)) fs.mkdirSync(fastlaneDir, { recursive: true });
  fs.writeFileSync(snippetPath, rb);
  ok(`fastlane/FastFile-TestKit.rb`);
  warn(`Merge lanes from FastFile-TestKit.rb into your existing Fastfile`);

  section('Next steps');
  console.log('');
  console.log('  ' + kleur.bold('1.') + ' Enable Blaze billing on your Firebase project');
  console.log('     ' + kleur.dim('console.firebase.google.com → ⚙️ → Upgrade → Blaze'));
  console.log('');
  console.log('  ' + kleur.bold('2.') + ' Enable required APIs (run once):');
  console.log('     ' + kleur.dim(`gcloud config set project ${ftlProject}`));
  console.log('     ' + kleur.dim('gcloud services enable testing.googleapis.com toolresults.googleapis.com storage.googleapis.com firebase.googleapis.com'));
  console.log('');
  console.log('  ' + kleur.bold('3.') + ' Create the GCS results bucket:');
  console.log('     ' + kleur.dim(`gsutil mb -l us-central1 ${ftlBucket}`));
  console.log('     ' + kleur.dim(`PROJECT_NUMBER=$(gcloud projects describe ${ftlProject} --format="value(projectNumber)")`));
  console.log('     ' + kleur.dim(`gsutil iam ch serviceAccount:service-\${PROJECT_NUMBER}@gcp-sa-firebase.iam.gserviceaccount.com:objectAdmin ${ftlBucket}`));
  console.log('');

  if (framework === 'react-native') {
    console.log('  ' + kleur.bold('4.') + ' Add testID= to your interactive elements:');
    console.log('     ' + kleur.dim('<TouchableOpacity testID="my-button">'));
    console.log('     Each new testID will auto-generate a stub in your test files.');
  } else {
    console.log('  ' + kleur.bold('4.') + ' Add ValueKey() to your widgets:');
    console.log('     ' + kleur.dim("ElevatedButton(key: ValueKey('my-button'), ...)"));
    console.log('     Each new key will auto-generate a stub in your integration test.');
  }
  console.log('');
  console.log('  ' + kleur.bold('5.') + ' Run your first Test Lab job:');
  console.log('     ' + kleur.dim('bundle exec fastlane android testLabProd'));
  console.log('     ' + kleur.dim('bundle exec fastlane ios testLabProd'));
  console.log('');
  console.log('  Full setup guide: ' + kleur.cyan('https://github.com/sameer-ahmed/mobile-test-kit#readme'));
  console.log('');
  console.log(kleur.bold().green('  Done!') + kleur.green(' Your test kit is ready. Add testIDs and the rest follows.'));
  console.log('');
}

run().catch(err => {
  console.error(kleur.red('\n  Error: ') + err.message);
  process.exit(1);
});
