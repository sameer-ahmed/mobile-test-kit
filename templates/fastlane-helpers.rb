################################################################################
# mobile-test-kit — Fastlane helpers
# Add these to your Fastfile or a shared FastFile-Common.
# Replace YOUR_PROJECT_ID and YOUR_BUCKET before committing.
################################################################################

FIREBASE_TEST_LAB_PROJECT = 'YOUR_PROJECT_ID'
FIREBASE_TEST_LAB_BUCKET  = 'YOUR_BUCKET'

# ── Helpers: detect a connected physical device ────────────────────────────────

def physical_android_device_serial
  raw = `adb devices 2>/dev/null`.lines
  raw.drop(1).each do |line|
    serial, status = line.chomp.split("\t")
    next unless status&.strip == "device"
    next if serial.to_s.start_with?("emulator")
    api = `adb -s #{serial} shell getprop ro.build.version.sdk 2>/dev/null`.strip.to_i
    return serial if api >= 24
  end
  nil
end

def physical_ios_device_udid
  output = `xcrun xctrace list devices 2>&1`
  physical_section = output.split(/== Simulators ==/i).first || output
  physical_section.scan(/\(([0-9a-f\-]{36})\)/i).flatten.each do |udid|
    ios_ver = physical_section.match(/#{Regexp.escape(udid)}.*?(\d+\.\d+)/m)&.captures&.first
    next unless ios_ver
    major, minor = ios_ver.split('.').map(&:to_i)
    return udid if major > 15 || (major == 15 && minor >= 1)
  end
  ""
end

# ── Android ───────────────────────────────────────────────────────────────────

lane :testLabProd_android do
  serial = physical_android_device_serial
  if serial
    UI.message("Physical device detected (#{serial}) — running locally")
    ENV['ANDROID_SERIAL'] = serial
    gradle(
      task: 'connectedAndroidTest',
      build_type: 'ProdDebug',
      project_dir: 'android',
      properties: { 'android.testInstrumentationRunnerArguments.class' => 'com.yourapp.FullAppUITest' }
    )
    ENV.delete('ANDROID_SERIAL')
  else
    UI.message("No device — building for Firebase Test Lab")
    gradle(task: 'assembleProdRelease', project_dir: 'android')
    apk = Dir['android/app/build/outputs/apk/**/app-prod-release.apk'].first
    UI.user_error!("APK not found") unless apk
    sh "gsutil cp '#{apk}' '#{FIREBASE_TEST_LAB_BUCKET}/apks/app.apk'"
    sh "gcloud firebase test android run \
          --project #{FIREBASE_TEST_LAB_PROJECT} \
          --type robo \
          --app '#{FIREBASE_TEST_LAB_BUCKET}/apks/app.apk' \
          --robo-script 'testlab/robo_script_android.json' \
          --results-bucket '#{FIREBASE_TEST_LAB_BUCKET}' \
          --device model=oriole,version=33,locale=en,orientation=portrait \
          --device model=redfin,version=30,locale=en,orientation=portrait \
          --timeout 5m"
  end
end

lane :localFullTest_android do
  serial = physical_android_device_serial
  destination = serial ? "serial:#{serial}" : "emulator"
  UI.message(serial ? "Running on physical device #{serial}" : "No device — falling back to emulator")
  gradle(
    task: 'connectedAndroidTest',
    build_type: 'ProdDebug',
    project_dir: 'android',
    properties: { 'android.testInstrumentationRunnerArguments.class' => 'com.yourapp.FullAppUITest' }
  )
end

lane :checkTestCoverage_android do
  sh "bash scripts/ui_test_coverage.sh"
end

# ── iOS ───────────────────────────────────────────────────────────────────────

lane :testLabProd_ios do
  udid = physical_ios_device_udid
  if udid && !udid.empty?
    UI.message("Physical iOS device detected (#{udid}) — running locally")
    scan(
      scheme: 'tapprn ProdDebug',
      destination: "id=#{udid}",
      output_directory: 'test_output',
      output_types: 'junit'
    )
  else
    UI.message("No device — building for Firebase Test Lab")
    derived_data = 'ios/build'
    xcodebuild(
      xcargs: 'build-for-testing',
      workspace: 'ios/tapprn.xcworkspace',
      scheme: 'tapprn ProdRelease',
      destination: 'generic/platform=iOS',
      derived_data_path: derived_data,
      xcconfig: nil
    )
    products = "#{derived_data}/Build/Products"
    xctestrun = Dir["#{products}/*.xctestrun"].first
    UI.user_error!("No .xctestrun found in #{products}") unless xctestrun
    sh "cd '#{products}' && \
        zip -r /tmp/ios_tests.zip Release-iphoneos/ '#{File.basename(xctestrun)}' && \
        gsutil cp /tmp/ios_tests.zip '#{FIREBASE_TEST_LAB_BUCKET}/ios/ios_tests.zip' && \
        gcloud firebase test ios run \
          --project #{FIREBASE_TEST_LAB_PROJECT} \
          --test '#{FIREBASE_TEST_LAB_BUCKET}/ios/ios_tests.zip' \
          --results-bucket '#{FIREBASE_TEST_LAB_BUCKET}' \
          --device model=iphone14pro,version=16.6 \
          --timeout 5m"
  end
end

lane :localFullTest_ios do
  udid = physical_ios_device_udid
  destination = (udid && !udid.empty?) ? "id=#{udid}" : "platform=iOS Simulator,name=iPhone 17 Pro"
  UI.message(destination.include?('id=') ? "Running on physical device #{udid}" : "No device — using simulator")
  scan(
    scheme: 'tapprn ProdDebug',
    destination: destination,
    output_directory: 'test_output',
    output_types: 'junit'
  )
end

lane :checkTestCoverage_ios do
  sh "bash scripts/ui_test_coverage.sh"
end
