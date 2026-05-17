#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const prompts = require('prompts');
const kleur = require('kleur');

const { detectFramework } = require('../lib/detect');
const { mergeSettings } = require('../lib/merge-settings');
const { copyScript, copyRoboScript, copyTestSkeletons } = require('../lib/copy-files');
const { setupGCP } = require('../lib/setup-gcp');
const { patchAndroid } = require('../lib/patch-android');
const { patchIOS } = require('../lib/patch-ios');
const { patchFastlane } = require('../lib/patch-fastlane');

const targetDir = process.cwd();
const PKG = require('../package.json');

// ── Output helpers ─────────────────────────────────────────────────────────────
function ok(msg)      { console.log(kleur.green('  ✓ ') + msg); }
function warn(msg)    { console.log(kleur.yellow('  ⚠ ') + msg); }
function info(msg)    { console.log(kleur.cyan('  → ') + msg); }
function section(msg) {
  console.log('');
  console.log(kleur.bold().white('  ' + msg));
  console.log(kleur.dim('  ' + '─'.repeat(msg.length)));
}

function header() {
  console.log('');
  console.log(kleur.bold().cyan('  ┌─────────────────────────────────────────┐'));
  console.log(kleur.bold().cyan('  │  mobile-test-kit  v' + PKG.version + '                 │'));
  console.log(kleur.bold().cyan('  │  Firebase Test Lab · Device Routing     │'));
  console.log(kleur.bold().cyan('  │  Coverage Drift Detection               │'));
  console.log(kleur.bold().cyan('  └─────────────────────────────────────────┘'));
  console.log('');
}

// ── Git pre-commit hook installer ─────────────────────────────────────────────
function installGitHook(targetDir) {
  const hookDir = path.join(targetDir, '.git', 'hooks');
  if (!fs.existsSync(hookDir)) return false;
  const preCommitPath = path.join(hookDir, 'pre-commit');
  const hookScript = `#!/bin/bash\n# mobile-test-kit: run coverage check before commit\nPRECOMMIT=1 bash "$(git rev-parse --show-toplevel)/scripts/ui_test_coverage.sh"\n`;
  if (fs.existsSync(preCommitPath)) {
    const existing = fs.readFileSync(preCommitPath, 'utf8');
    if (!existing.includes('ui_test_coverage')) {
      fs.appendFileSync(preCommitPath, '\n' + hookScript);
      return 'appended';
    }
    return 'exists';
  }
  fs.writeFileSync(preCommitPath, `#!/bin/bash\n${hookScript}`);
  fs.chmodSync(preCommitPath, 0o755);
  return 'created';
}

// ── Gitignore helper ──────────────────────────────────────────────────────────
function ensureGitignored(targetDir, entry) {
  const p = path.join(targetDir, '.gitignore');
  const content = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  if (!content.includes(entry)) {
    fs.appendFileSync(p, '\n' + entry + '\n');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  header();

  const framework = detectFramework(targetDir);

  if (framework === 'unknown') {
    console.log(kleur.red('  ✗ Could not detect framework.'));
    console.log('    Expected: React Native (package.json + App/) or Flutter (pubspec.yaml + lib/)');
    process.exit(1);
  }

  console.log(kleur.bold('  Detected: ') + kleur.cyan(framework === 'react-native' ? 'React Native' : 'Flutter'));
  console.log(kleur.dim('  Target:   ') + targetDir);
  console.log('');

  const answers = await prompts([
    {
      type: 'text',
      name: 'ftlProject',
      message: 'Firebase project ID?',
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
      message: 'Android package name? (e.g. com.acme.myapp)',
      initial: 'com.mycompany.' + path.basename(targetDir).toLowerCase().replace(/[^a-z0-9]/g, ''),
      validate: v => /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(v.trim()) ? true : 'e.g. com.acme.myapp'
    },
    {
      type: framework === 'flutter' ? 'text' : null,
      name: 'flutterPackage',
      message: 'Flutter package name? (from pubspec.yaml → name:)',
      initial: path.basename(targetDir).toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      validate: v => /^[a-z][a-z0-9_]*$/.test(v.trim()) ? true : 'Lowercase + underscores only'
    },
    {
      type: 'text',
      name: 'testPhone',
      message: 'Test phone number for login automation? (leave blank to set later)',
      initial: ''
    },
    {
      type: 'text',
      name: 'testOtp',
      message: 'Test OTP? (leave blank to set later)',
      initial: ''
    },
    {
      type: 'select',
      name: 'hookType',
      message: 'Coverage check trigger?',
      choices: [
        { title: 'Claude Code + git pre-commit  (recommended)', value: 'both' },
        { title: 'Claude Code only', value: 'claude' },
        { title: 'Git pre-commit only  (any editor)', value: 'git' },
        { title: 'Manual', value: 'none' }
      ],
      initial: 0
    },
    {
      type: 'confirm',
      name: 'runGCP',
      message: 'Run GCP setup now? (enables APIs, creates bucket, sets IAM — requires gcloud auth)',
      initial: true
    },
    {
      type: 'confirm',
      name: 'createSkeletons',
      message: 'Create starter test files?',
      initial: true
    }
  ], { onCancel: () => process.exit(0) });

  const { ftlProject, ftlBucket, androidPackage, flutterPackage,
          testPhone, testOtp, hookType, runGCP, createSkeletons } = answers;

  // ── GCP setup ───────────────────────────────────────────────────────────────
  if (runGCP) {
    section('GCP Setup');
    setupGCP(ftlProject, ftlBucket, ok, warn, info);
  }

  // ── Android build.gradle ────────────────────────────────────────────────────
  if (framework === 'react-native') {
    section('Android');
    patchAndroid(targetDir, ok, info);
  }

  // ── iOS Xcode target ────────────────────────────────────────────────────────
  if (framework === 'react-native' && process.platform === 'darwin') {
    section('iOS');
    patchIOS(targetDir, androidPackage, ok, warn, info);
  }

  // ── Files ───────────────────────────────────────────────────────────────────
  section('Installing files');

  const scriptDest = copyScript(targetDir);
  ok('scripts/ui_test_coverage.sh');

  if (framework === 'react-native') {
    const roboDest = copyRoboScript(targetDir);
    if (roboDest) {
      // Substitute test phone into robo script
      if (testPhone) {
        let robo = fs.readFileSync(roboDest, 'utf8');
        robo = robo.replace('YOUR_TEST_PHONE_NUMBER', testPhone);
        if (testOtp) robo = robo.replace('YOUR_TEST_OTP', testOtp);
        fs.writeFileSync(roboDest, robo);
      }
      ok('testlab/robo_script_android.json  (update resource IDs to match your login form)');
    } else {
      info('testlab/robo_script_android.json already exists, skipped');
    }
  }

  if (createSkeletons) {
    const installed = copyTestSkeletons(targetDir, framework, androidPackage, flutterPackage);
    for (const f of installed) {
      if (f.skipped) info(`${f.rel}  already exists, skipped`);
      else ok(`${f.rel}`);
    }
  }

  // Save test credentials to testlab/.env.test (gitignored)
  if (testPhone || testOtp) {
    const envPath = path.join(targetDir, 'testlab', '.env.test');
    const testlabDir = path.join(targetDir, 'testlab');
    if (!fs.existsSync(testlabDir)) fs.mkdirSync(testlabDir, { recursive: true });
    const lines = [];
    if (testPhone) lines.push(`TEST_PHONE=${testPhone}`);
    if (testOtp)   lines.push(`TEST_OTP=${testOtp}`);
    fs.writeFileSync(envPath, lines.join('\n') + '\n');
    ensureGitignored(targetDir, 'testlab/.env.test');
    ok('testlab/.env.test  (credentials saved, gitignored)');
  }

  // ── Hooks ───────────────────────────────────────────────────────────────────
  if (hookType === 'claude' || hookType === 'both') {
    const added = mergeSettings(targetDir);
    if (added) ok('.claude/settings.json  →  PostToolUse hook');
    else info('.claude/settings.json  →  hook already present, skipped');
  }

  if (hookType === 'git' || hookType === 'both') {
    const result = installGitHook(targetDir);
    if (result === 'created' || result === 'appended') ok('.git/hooks/pre-commit  →  coverage check added');
    else if (result === 'exists') info('.git/hooks/pre-commit  →  already present, skipped');
    else warn('No .git directory — git hook skipped');
  }

  // ── Fastlane ────────────────────────────────────────────────────────────────
  section('Fastlane');
  patchFastlane(targetDir, ftlProject, ftlBucket, testPhone, testOtp, ok, info);

  // ── Done ────────────────────────────────────────────────────────────────────
  console.log('');
  console.log(kleur.bold().green('  ✅ Done!'));
  console.log('');
  console.log(kleur.bold('  One manual step: ') + 'Enable Blaze billing');
  console.log('  ' + kleur.dim('console.firebase.google.com → your project → ⚙️ → Upgrade → Blaze'));
  console.log('');
  console.log('  Then run your first test:');
  console.log('  ' + kleur.dim('bundle exec fastlane android testLabProd'));
  console.log('  ' + kleur.dim('bundle exec fastlane ios testLabProd'));
  console.log('');
  console.log('  Full guide: ' + kleur.cyan('https://github.com/sameer-ahmed/mobile-test-kit#readme'));
  console.log('');
}

run().catch(err => {
  console.error(kleur.red('\n  Error: ') + err.message);
  process.exit(1);
});
