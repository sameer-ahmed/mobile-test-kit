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

function copyTestSkeletons(targetDir, framework, androidPackage, flutterPackage) {
  const installed = [];

  if (framework === 'react-native' || framework === 'unknown') {
    // Android skeleton — place in the correct package directory
    const pkgPath = (androidPackage || 'com.yourapp').replace(/\./g, '/');
    const androidDir = path.join(targetDir, 'android', 'app', 'src', 'androidTest', 'java', ...pkgPath.split('/'));
    if (!fs.existsSync(androidDir)) fs.mkdirSync(androidDir, { recursive: true });
    const androidDest = path.join(androidDir, 'FullAppUITest.kt');
    const androidRel = path.relative(targetDir, androidDest);
    if (!fs.existsSync(androidDest)) {
      let content = fs.readFileSync(path.join(TEMPLATES_DIR, 'FullAppUITest.kt'), 'utf8');
      content = content.replace('YOUR_ANDROID_PACKAGE', androidPackage || 'com.yourapp');
      fs.writeFileSync(androidDest, content);
      installed.push({ rel: androidRel, skipped: false });
    } else {
      installed.push({ rel: androidRel, skipped: true });
    }

    // iOS skeleton
    const iosDir = path.join(targetDir, 'ios', 'SmokeTestUITests');
    if (!fs.existsSync(iosDir)) fs.mkdirSync(iosDir, { recursive: true });
    const iosDest = path.join(iosDir, 'FullAppUITests.swift');
    const iosRel = path.relative(targetDir, iosDest);
    if (!fs.existsSync(iosDest)) {
      fs.copyFileSync(path.join(TEMPLATES_DIR, 'FullAppUITests.swift'), iosDest);
      installed.push({ rel: iosRel, skipped: false });
    } else {
      installed.push({ rel: iosRel, skipped: true });
    }
  }

  if (framework === 'flutter') {
    const integrationDir = path.join(targetDir, 'integration_test');
    if (!fs.existsSync(integrationDir)) fs.mkdirSync(integrationDir, { recursive: true });
    const flutterDest = path.join(integrationDir, 'app_test.dart');
    const flutterRel = path.relative(targetDir, flutterDest);
    if (!fs.existsSync(flutterDest)) {
      let content = fs.readFileSync(path.join(TEMPLATES_DIR, 'app_test.dart'), 'utf8');
      content = content.replace('YOUR_FLUTTER_PACKAGE', flutterPackage || 'your_app');
      fs.writeFileSync(flutterDest, content);
      installed.push({ rel: flutterRel, skipped: false });
    } else {
      installed.push({ rel: flutterRel, skipped: true });
    }
  }

  return installed;
}

function readFastlaneHelpers(ftlProject, ftlBucket) {
  let content = fs.readFileSync(path.join(TEMPLATES_DIR, 'fastlane-helpers.rb'), 'utf8');
  content = content.replace(/YOUR_PROJECT_ID/g, ftlProject);
  content = content.replace(/YOUR_BUCKET/g, ftlBucket);
  return content;
}

module.exports = { copyScript, copyRoboScript, copyTestSkeletons, readFastlaneHelpers };
