#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function detectFramework(targetDir) {
  const hasAppDir = fs.existsSync(path.join(targetDir, 'App'));
  const hasLibDir = fs.existsSync(path.join(targetDir, 'lib'));
  const hasPubspec = fs.existsSync(path.join(targetDir, 'pubspec.yaml'));
  const hasPackageJson = fs.existsSync(path.join(targetDir, 'package.json'));

  if (hasPubspec && hasLibDir) return 'flutter';

  if (hasPackageJson && hasAppDir) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['react-native']) return 'react-native';
    } catch (_) {}
  }

  if (hasLibDir && hasPubspec) return 'flutter';
  if (hasAppDir) return 'react-native';

  return 'unknown';
}

function detectAndroidTestFile(targetDir) {
  try {
    const result = execSync(
      `find "${targetDir}/android" -name "*.kt" -path "*/androidTest/*" 2>/dev/null | head -1`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    return result || null;
  } catch (_) { return null; }
}

function detectIOSTestFile(targetDir) {
  try {
    const result = execSync(
      `find "${targetDir}/ios" -name "*.swift" -path "*/SmokeTestUITests/*" 2>/dev/null | head -1`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    return result || null;
  } catch (_) { return null; }
}

function detectFlutterTestFile(targetDir) {
  try {
    const result = execSync(
      `find "${targetDir}/integration_test" -name "*.dart" 2>/dev/null | head -1`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    return result || null;
  } catch (_) { return null; }
}

module.exports = { detectFramework, detectAndroidTestFile, detectIOSTestFile, detectFlutterTestFile };
