'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

const RUBY_SCRIPT = `
require 'xcodeproj'

proj_path = Dir.glob('ios/*.xcodeproj').first
abort('No .xcodeproj found in ios/') unless proj_path

project = Xcodeproj::Project.open(proj_path)

if project.targets.any? { |t| t.name == 'SmokeTestUITests' }
  puts 'SmokeTestUITests target already exists — skipped'
  exit 0
end

# Find main app target (first native target that isn't a test target)
main_target = project.targets.find { |t|
  t.is_a?(Xcodeproj::Project::Object::PBXNativeTarget) &&
  t.product_type == 'com.apple.product-type.application'
}
abort('Could not find main app target') unless main_target

# Create UI test target
test_target = project.new_target(
  :ui_test_bundle,
  'SmokeTestUITests',
  :ios,
  '15.1'
)

# Set bundle identifier
bundle_id = ARGV[0] || (main_target.build_configurations.first&.build_settings&.dig('PRODUCT_BUNDLE_IDENTIFIER') || 'com.yourapp') + '.SmokeTestUITests'
test_target.build_configurations.each do |config|
  config.build_settings['BUNDLE_IDENTIFIER']            = bundle_id
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']   = '15.1'
  config.build_settings['TEST_TARGET_NAME']             = main_target.name
  config.build_settings['SWIFT_VERSION']                = '5.0'
end

# Add target dependency on main app
dep = project.new(Xcodeproj::Project::Object::PBXTargetDependency)
dep.target = main_target
test_target.dependencies << dep

project.save
puts "SmokeTestUITests UITest target added to #{proj_path}"
`;

function xcodeproj_available() {
  const r = spawnSync('ruby', ['-e', "require 'xcodeproj'; puts 'ok'"], {
    stdio: ['ignore', 'pipe', 'ignore']
  });
  return r.status === 0 && r.stdout && r.stdout.toString().includes('ok');
}

function patchIOS(targetDir, androidPackage, ok, warn, info) {
  if (process.platform !== 'darwin') {
    info('Not macOS — iOS Xcode patch skipped');
    return;
  }

  const xcodeproj = require('glob').sync
    ? require('glob').sync('ios/*.xcodeproj', { cwd: targetDir })[0]
    : null;

  // Simple glob without the glob package
  const iosDir = path.join(targetDir, 'ios');
  if (!fs.existsSync(iosDir)) {
    info('ios/ directory not found — iOS Xcode patch skipped');
    return;
  }

  const projEntry = fs.readdirSync(iosDir).find(f => f.endsWith('.xcodeproj'));
  if (!projEntry) {
    info('No .xcodeproj found in ios/ — iOS Xcode patch skipped');
    return;
  }

  if (!xcodeproj_available()) {
    warn('xcodeproj gem not found. Add iOS UITest target manually:');
    console.log('    Xcode → File → New → Target → UI Testing Bundle');
    console.log('    Name: SmokeTestUITests, Deployment Target: 15.1');
    console.log('    Then drag ios/SmokeTestUITests/FullAppUITests.swift into the target.');
    console.log('');
    console.log('    Or install the gem first:  gem install xcodeproj');
    return;
  }

  const scriptPath = path.join(os.tmpdir(), 'add_uitest_target.rb');
  fs.writeFileSync(scriptPath, RUBY_SCRIPT);

  const bundleId = androidPackage
    ? androidPackage + '.SmokeTestUITests'
    : 'com.yourapp.SmokeTestUITests';

  const result = spawnSync('ruby', [scriptPath, bundleId], {
    cwd: targetDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8'
  });

  fs.unlinkSync(scriptPath);

  if (result.status === 0) {
    const output = (result.stdout || '').trim();
    if (output.includes('already exists')) {
      info('SmokeTestUITests target already exists, skipped');
    } else {
      ok('SmokeTestUITests UITest target added to Xcode project');
    }
  } else {
    warn('Xcode target addition failed:');
    if (result.stderr) console.log('    ' + result.stderr.trim().split('\n').join('\n    '));
    console.log('    Add manually: Xcode → File → New → Target → UI Testing Bundle → SmokeTestUITests');
  }
}

module.exports = { patchIOS };
