'use strict';

const { execSync, spawnSync } = require('child_process');

function gcloudAvailable() {
  const r = spawnSync('gcloud', ['version'], { stdio: 'ignore' });
  return r.status === 0;
}

function bucketExists(bucket) {
  const r = spawnSync('gsutil', ['ls', '-b', bucket], { stdio: 'ignore' });
  return r.status === 0;
}

function run(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: 'inherit', ...opts });
    return true;
  } catch (e) {
    return false;
  }
}

function runCapture(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch (_) { return null; }
}

function setupGCP(ftlProject, ftlBucket, ok, warn, info) {
  if (!gcloudAvailable()) {
    warn('gcloud not found on PATH — skipping GCP setup.');
    info('Run these manually after installing gcloud CLI:');
    console.log(`    gcloud services enable testing.googleapis.com toolresults.googleapis.com storage.googleapis.com firebase.googleapis.com --project=${ftlProject}`);
    console.log(`    gsutil mb -l us-central1 ${ftlBucket}`);
    console.log(`    PROJECT_NUMBER=$(gcloud projects describe ${ftlProject} --format="value(projectNumber)")`);
    console.log(`    gsutil iam ch serviceAccount:service-\${PROJECT_NUMBER}@gcp-sa-firebase.iam.gserviceaccount.com:objectAdmin ${ftlBucket}`);
    return;
  }

  // 1. Enable APIs
  const apisOk = run(
    `gcloud services enable testing.googleapis.com toolresults.googleapis.com storage.googleapis.com firebase.googleapis.com --project=${ftlProject}`
  );
  if (apisOk) ok('APIs enabled (testing, toolresults, storage, firebase)');
  else warn('API enablement failed — check gcloud auth and project ID');

  // 2. Create bucket
  if (bucketExists(ftlBucket)) {
    info(`Bucket ${ftlBucket} already exists, skipped`);
  } else {
    const bucketOk = run(`gsutil mb -l us-central1 ${ftlBucket}`);
    if (bucketOk) ok(`Bucket created: ${ftlBucket}`);
    else warn(`Bucket creation failed — you may need Storage Admin role`);
  }

  // 3. Grant FTL service agent objectAdmin on bucket
  const projectNumber = runCapture(`gcloud projects describe ${ftlProject} --format="value(projectNumber)"`);
  if (projectNumber) {
    const sa = `serviceAccount:service-${projectNumber}@gcp-sa-firebase.iam.gserviceaccount.com`;
    const iamOk = run(`gsutil iam ch ${sa}:objectAdmin ${ftlBucket}`);
    if (iamOk) ok('FTL service agent granted objectAdmin on bucket');
    else warn('IAM grant failed — bucket may not be accessible by FTL');
  } else {
    warn('Could not get project number — IAM grant skipped');
  }

  // 4. Grant current user qualityAdmin
  const currentUser = runCapture('gcloud config get-value account');
  if (currentUser && currentUser !== '(unset)') {
    const roleOk = run(
      `gcloud projects add-iam-policy-binding ${ftlProject} --member="user:${currentUser}" --role="roles/firebase.qualityAdmin"`
    );
    if (roleOk) ok(`firebase.qualityAdmin granted to ${currentUser}`);
    else warn('Could not grant qualityAdmin — you may need Project Owner role');
  }
}

module.exports = { setupGCP };
