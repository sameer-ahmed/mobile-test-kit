'use strict';

const fs = require('fs');
const path = require('path');
const { readFastlaneHelpers } = require('./copy-files');

function patchFastlane(targetDir, ftlProject, ftlBucket, testPhone, testOtp, ok, info) {
  const fastlaneDir = path.join(targetDir, 'fastlane');
  if (!fs.existsSync(fastlaneDir)) fs.mkdirSync(fastlaneDir, { recursive: true });

  // Write FastFile-TestKit.rb with all config substituted
  let rb = readFastlaneHelpers(ftlProject, ftlBucket);
  rb = rb
    .replace(/ENV\["TEST_PHONE"\]/g, testPhone ? `"${testPhone}"` : 'ENV["TEST_PHONE"]')
    .replace(/ENV\["TEST_OTP"\]/g,   testOtp   ? `"${testOtp}"`   : 'ENV["TEST_OTP"]');
  fs.writeFileSync(path.join(fastlaneDir, 'FastFile-TestKit.rb'), rb);
  ok('fastlane/FastFile-TestKit.rb written');

  // Patch existing Fastfile to import it
  const fastfilePath = path.join(fastlaneDir, 'Fastfile');
  const importLine = 'import("FastFile-TestKit")';

  if (fs.existsSync(fastfilePath)) {
    const existing = fs.readFileSync(fastfilePath, 'utf8');
    if (existing.includes('FastFile-TestKit')) {
      info('fastlane/Fastfile already imports FastFile-TestKit, skipped');
    } else {
      fs.writeFileSync(fastfilePath, existing.trimEnd() + '\n' + importLine + '\n');
      ok('import("FastFile-TestKit") added to fastlane/Fastfile');
    }
  } else {
    fs.writeFileSync(fastfilePath, importLine + '\n');
    ok('fastlane/Fastfile created with import("FastFile-TestKit")');
  }
}

module.exports = { patchFastlane };
