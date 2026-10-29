import test from 'node:test';
import assert from 'node:assert/strict';
import { workloadIdentityOptions } from '../lib/google-workload-identity.ts';

const config = {
  GCP_PROJECT_NUMBER: '123456789012',
  GCP_SERVICE_ACCOUNT_EMAIL: 'mdw-vercel@aih-g1-team-5.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'production',
};
test('local development keeps application-default authentication when federation is absent', () => {
  assert.equal(workloadIdentityOptions({}, async () => 'token'), undefined);
});
test('partial federation configuration fails with missing variable names', () => {
  assert.throws(() => workloadIdentityOptions({GCP_PROJECT_NUMBER:'123456789012'}, async () => 'token'), /GCP_SERVICE_ACCOUNT_EMAIL/);
});
test('federation targets the configured service account and retrieves a fresh subject token', async () => {
  let tokens = 0;
  const options = workloadIdentityOptions(config, async () => `token-${++tokens}`);
  assert.equal(options.audience, '//iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel/providers/production');
  assert.equal(options.service_account_impersonation_url, 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/mdw-vercel@aih-g1-team-5.iam.gserviceaccount.com:generateAccessToken');
  assert.equal(await options.subject_token_supplier.getSubjectToken(), 'token-1');
  assert.equal(await options.subject_token_supplier.getSubjectToken(), 'token-2');
});
