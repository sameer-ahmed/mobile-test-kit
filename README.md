# mobile-test-kit

> Zero-friction mobile UI testing setup for React Native and Flutter apps.

**One command installs everything:**

```bash
npx create-mobile-test-kit
```

---

## What you get

- **Firebase Test Lab** integration (real hardware, no emulators)
- **Physical device routing** (plugged-in phone takes priority automatically)
- **Coverage drift detection** (new screens with no tests → stubs appear instantly)
- **Fastlane lanes** for running, checking, and scheduling tests
- **Full automation** — GCP setup, build.gradle patches, Xcode targets, Fastlane merges

Works with **React Native** and **Flutter**.

---

## What gets installed

| File | Purpose |
|------|---------|
| `scripts/ui_test_coverage.sh` | Scans all testIDs / ValueKeys in source, diffs against test files, appends stubs for gaps |
| `.claude/settings.json` | PostToolUse hook — runs coverage check automatically on every source edit |
| `testlab/robo_script_android.json` | Robo login script template for Android FTL crawl |
| `fastlane/FastFile-TestKit.rb` | Fastlane lanes: `testLabProd`, `localFullTest`, `checkTestCoverage` |

---

## Requirements

- Node ≥ 18
- Ruby + Bundler (for Fastlane lanes)
- `gcloud` CLI — [install](https://cloud.google.com/sdk/docs/install)
- `gsutil` (bundled with gcloud)
- Firebase project on **Blaze** (pay-as-you-go) plan — required for iOS; free tier covers 60 min/day virtual + 30 min/day physical

---

## Full FTL setup

### 1 — Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** (or select existing)
2. Note your **Project ID**
3. Enable **Blaze** billing (⚙️ → Upgrade)

### 2 — Enable required APIs

```bash
gcloud config set project YOUR_PROJECT_ID

gcloud services enable \
  testing.googleapis.com \
  toolresults.googleapis.com \
  storage.googleapis.com \
  firebase.googleapis.com
```

### 3 — Create the GCS results bucket

```bash
gsutil mb -l us-central1 gs://YOUR_APP-test-lab-results

PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
gsutil iam ch \
  serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-firebase.iam.gserviceaccount.com:objectAdmin \
  gs://YOUR_APP-test-lab-results
```

### 4 — IAM roles

**Local dev** — your Google account needs:
```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="user:you@yourcompany.com" \
  --role="roles/firebase.qualityAdmin"
```

**CI/CD** — create a service account:
```bash
# Create SA
gcloud iam service-accounts create ftl-ci-runner \
  --display-name="Firebase Test Lab CI Runner" \
  --project=YOUR_PROJECT_ID

SA="ftl-ci-runner@YOUR_PROJECT_ID.iam.gserviceaccount.com"

# Grant roles
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:${SA}" --role="roles/cloudtestservice.testRunner"
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:${SA}" --role="roles/cloudtoolresults.editor"
gsutil iam ch serviceAccount:${SA}:objectAdmin gs://YOUR_APP-test-lab-results

# Key for CI secret
gcloud iam service-accounts keys create ftl-ci-key.json --iam-account="${SA}"
```

> Never commit `ftl-ci-key.json`. Store as a CI secret.

### 5 — Activate on CI

```bash
gcloud auth activate-service-account --key-file="${FTL_KEY_JSON}"
gcloud config set project YOUR_PROJECT_ID
```

---

## FTL pricing

Blaze plan (required for iOS):

| Device type | Free / day | Overage |
|-------------|-----------|---------|
| Android virtual | 60 min | $1.00 / hr |
| Android physical | 30 min | $5.00 / hr |
| iOS physical | 30 min | $5.00 / hr |

A typical 5-minute smoke test on 2 devices is free as long as daily usage stays under the allowance.

---

## Coverage drift detection

Every time you edit a source file, the Claude Code hook runs `ui_test_coverage.sh`:

```
Edit App/Login/LoginScreen.js
  → hook fires
  → script scans all testID= values
  → "login-biometric-button" has no test → stub appended to Android + iOS test files
  → Claude: "Stubs added for login-biometric-button. Implement now?"
```

### Manual run

```bash
bash scripts/ui_test_coverage.sh
# or via Fastlane:
bundle exec fastlane android checkTestCoverage
bundle exec fastlane ios checkTestCoverage
```

---

## Physical device routing

When you plug in a phone:

- **Android**: `adb devices` detects it → API level checked (≥ 24) → tests run there
- **iOS**: `xcrun xctrace list devices` detects it → iOS version checked (≥ 15.1) → tests run there
- No device / older device → Firebase Test Lab takes over automatically

---

## Fastlane lanes

```bash
# Run tests — physical device if connected, else FTL / simulator
bundle exec fastlane android testLabProd
bundle exec fastlane ios testLabProd

# Full local test run
bundle exec fastlane android localFullTest
bundle exec fastlane ios localFullTest

# Coverage gap report
bundle exec fastlane android checkTestCoverage
bundle exec fastlane ios checkTestCoverage
```

---

## Troubleshooting

**`PERMISSION_DENIED` on gcloud run** — your account needs `roles/firebase.qualityAdmin`. Grant it in IAM & Admin → IAM.

**`BucketNotFound`** — run the bucket grant from Step 3 above.

**`No .xctestrun found`** — the UI test target isn't added to the scheme's Test action. Xcode → Manage Schemes → Edit → Test → add your UITests target.

**iOS `DEPLOYMENT_TARGET` mismatch** — your UI test target's `IPHONEOS_DEPLOYMENT_TARGET` must be ≤ 18.4 (FTL's current max).

**Robo script doesn't fill the form** — resource IDs don't match. Dump the UI: `adb shell uiautomator dump /sdcard/dump.xml && adb pull /sdcard/dump.xml` and search for `resource-id` or `content-desc`.

---

## License

MIT
