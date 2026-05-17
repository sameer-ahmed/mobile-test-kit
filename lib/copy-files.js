#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

function copyScript(targetDir) {
  const scriptsDir = path.join(targetDir, 'scripts');
  if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });

  const src = path.join(TEMPLATES_DIR, 'ui_test_coverage.sh');
  const dest = path.join(scriptsDir, 'ui_test_coverage.sh');

  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  return dest;
}

function copyRoboScript(targetDir) {
  const testlabDir = path.join(targetDir, 'testlab');
  if (!fs.existsSync(testlabDir)) fs.mkdirSync(testlabDir, { recursive: true });

  const src = path.join(TEMPLATES_DIR, 'robo_script.json');
  const dest = path.join(testlabDir, 'robo_script_android.json');

  if (!fs.existsSync(dest)) {
    fs.copyFileSync(src, dest);
    return dest;
  }
  return null;
}

function readFastlaneHelpers(ftlProject, ftlBucket) {
  let content = fs.readFileSync(path.join(TEMPLATES_DIR, 'fastlane-helpers.rb'), 'utf8');
  content = content.replace(/YOUR_PROJECT_ID/g, ftlProject);
  content = content.replace(/YOUR_BUCKET/g, ftlBucket);
  return content;
}

module.exports = { copyScript, copyRoboScript, readFastlaneHelpers };
