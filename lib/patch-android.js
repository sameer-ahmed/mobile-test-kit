'use strict';

const fs = require('fs');
const path = require('path');

function patchAndroid(targetDir, ok, info) {
  const gradlePath = path.join(targetDir, 'android', 'app', 'build.gradle');
  if (!fs.existsSync(gradlePath)) {
    info('android/app/build.gradle not found — skipping Android patch');
    return;
  }

  let src = fs.readFileSync(gradlePath, 'utf8');
  let changed = false;

  function patch(label, check, transform) {
    if (check(src)) {
      info(`${label} already present, skipped`);
    } else {
      src = transform(src);
      changed = true;
      ok(label);
    }
  }

  // A — Kotlin plugin
  patch(
    'Kotlin plugin in build.gradle',
    s => s.includes('org.jetbrains.kotlin.android'),
    s => s.replace(
      /^(plugins\s*\{[^}]*?)(})/ms,
      (_, body, close) => `${body}    id "org.jetbrains.kotlin.android"\n${close}`
    )
  );

  // B — compileOptions Java 17
  patch(
    'compileOptions Java 17',
    s => s.includes('JavaVersion.VERSION_17'),
    s => s.replace(
      /(android\s*\{)/,
      '$1\n    compileOptions {\n        sourceCompatibility JavaVersion.VERSION_17\n        targetCompatibility JavaVersion.VERSION_17\n    }'
    )
  );

  // C — kotlinOptions
  patch(
    'kotlinOptions jvmTarget 17',
    s => s.includes('kotlinOptions'),
    s => s.replace(
      /(compileOptions\s*\{[^}]*\})/s,
      '$1\n    kotlinOptions {\n        jvmTarget = "17"\n    }'
    )
  );

  // D — testInstrumentationRunner
  patch(
    'testInstrumentationRunner in defaultConfig',
    s => s.includes('testInstrumentationRunner'),
    s => s.replace(
      /(defaultConfig\s*\{)/,
      '$1\n        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"'
    )
  );

  // E — androidTest dependencies
  patch(
    'androidTest dependencies (uiautomator, runner, rules, junit)',
    s => s.includes('uiautomator'),
    s => s.replace(
      /(dependencies\s*\{)/,
      `$1\n    androidTestImplementation 'androidx.test:runner:1.5.2'\n    androidTestImplementation 'androidx.test:rules:1.5.0'\n    androidTestImplementation 'androidx.test.ext:junit:1.1.5'\n    androidTestImplementation 'androidx.test.uiautomator:uiautomator:2.2.0'`
    )
  );

  // F — react{} debuggableVariants (exclude prodDebug from Metro so bundle is embedded)
  patch(
    'react{} debuggableVariants (embeds JS bundle in prodDebug)',
    s => s.includes('debuggableVariants'),
    s => {
      if (/\breact\s*\{/.test(s)) {
        // Insert inside existing react{} block
        return s.replace(/(react\s*\{)/, '$1\n        debuggableVariants = ["devDebug", "stagingDebug", "uatDebug"]');
      } else {
        // Append react{} block after android{} closing brace
        return s + '\nreact {\n    debuggableVariants = ["devDebug", "stagingDebug", "uatDebug"]\n}\n';
      }
    }
  );

  if (changed) {
    fs.writeFileSync(gradlePath, src);
  }
}

module.exports = { patchAndroid };
