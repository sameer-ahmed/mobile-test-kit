#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const prompts = require('prompts');
const kleur = require('kleur');

const { detectFramework } = require('../lib/detect');
const { mergeSettings } = require('../lib/merge-settings');
const { copyScript, copyRoboScript, readFastlaneHelpers } = require('../lib/copy-files');

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
      type: 'confirm',
      name: 'installHook',
      message: 'Install Claude Code coverage hook in .claude/settings.json?',
      initial: true
    },
    {
      type: (_, { installHook }) => installHook ? null : null,
      name: '_skip',
      message: ''
    }
  ], { onCancel: () => process.exit(0) });

  const { ftlProject, ftlBucket, installHook } = answers;

  section('Installing files');

  // 1. Coverage script
  const scriptDest = copyScript(targetDir);
  ok(`scripts/ui_test_coverage.sh  →  ${path.relative(targetDir, scriptDest)}`);

  // 2. Robo script (Android only, RN)
  if (framework === 'react-native') {
    const roboDest = copyRoboScript(targetDir);
    if (roboDest) {
      ok(`testlab/robo_script_android.json  →  ${path.relative(targetDir, roboDest)}`);
      warn('Edit testlab/robo_script_android.json to match your login element IDs');
    } else {
      info('testlab/robo_script_android.json already exists, skipped');
    }
  }

  // 3. Claude hook
  if (installHook) {
    const added = mergeSettings(targetDir);
    if (added) {
      ok('.claude/settings.json  →  PostToolUse hook added');
    } else {
      info('.claude/settings.json  →  hook already present, skipped');
    }
  }

  section('Fastlane snippets');
  const rb = readFastlaneHelpers(ftlProject, ftlBucket);
  const snippetPath = path.join(targetDir, 'fastlane', 'FastFile-TestKit.rb');
  const fastlaneDir = path.join(targetDir, 'fastlane');
  if (!fs.existsSync(fastlaneDir)) fs.mkdirSync(fastlaneDir, { recursive: true });
  fs.writeFileSync(snippetPath, rb);
  ok('fastlane/FastFile-TestKit.rb  →  lanes: testLabProd, localFullTest, checkTestCoverage');
  warn('Copy lanes from FastFile-TestKit.rb into your existing Fastfile');

  section('Next steps');
  console.log('');
  console.log('  ' + kleur.bold('1.') + ' Enable Blaze billing on your Firebase project');
  console.log('     ' + kleur.dim('console.firebase.google.com → ⚙️ → Upgrade → Blaze'));
  console.log('');
  console.log('  ' + kleur.bold('2.') + ' Enable required APIs (run once):');
  console.log('     ' + kleur.dim(`gcloud config set project ${ftlProject}`));
  console.log('     ' + kleur.dim('gcloud services enable testing.googleapis.com toolresults.googleapis.com storage.googleapis.com firebase.googleapis.com'));
  console.log('');
  console.log('  ' + kleur.bold('3.') + ' Create the GCS bucket:');
  const bucket = ftlBucket.replace('gs://', '');
  console.log('     ' + kleur.dim(`gsutil mb -l us-central1 ${ftlBucket}`));
  console.log('     ' + kleur.dim(`PROJECT_NUMBER=$(gcloud projects describe ${ftlProject} --format="value(projectNumber)")`));
  console.log('     ' + kleur.dim(`gsutil iam ch serviceAccount:service-\${PROJECT_NUMBER}@gcp-sa-firebase.iam.gserviceaccount.com:objectAdmin ${ftlBucket}`));
  console.log('');
  if (framework === 'react-native') {
    console.log('  ' + kleur.bold('4.') + ' Add testID= to all interactive elements, then run:');
    console.log('     ' + kleur.dim('bundle exec fastlane android checkTestCoverage'));
    console.log('     ' + kleur.dim('bundle exec fastlane ios checkTestCoverage'));
    console.log('');
    console.log('  ' + kleur.bold('5.') + ' Run your first Test Lab job:');
    console.log('     ' + kleur.dim('bundle exec fastlane android testLabProd'));
    console.log('     ' + kleur.dim('bundle exec fastlane ios testLabProd'));
  } else {
    console.log('  ' + kleur.bold('4.') + ' Add ValueKey() to widgets, then run:');
    console.log('     ' + kleur.dim('bash scripts/ui_test_coverage.sh'));
    console.log('');
    console.log('  ' + kleur.bold('5.') + ' Run your first Test Lab job:');
    console.log('     ' + kleur.dim('bundle exec fastlane android testLabProd'));
    console.log('     ' + kleur.dim('bundle exec fastlane ios testLabProd'));
  }
  console.log('');
  console.log('  Full setup guide: ' + kleur.cyan('https://github.com/sameer-ahmed/mobile-test-kit#readme'));
  console.log('');
  console.log(kleur.bold().green('  Done!') + kleur.green(' mobile-test-kit installed.'));
  console.log('');
}

run().catch(err => {
  console.error(kleur.red('\n  Error: ') + err.message);
  process.exit(1);
});
