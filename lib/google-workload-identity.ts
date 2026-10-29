/** Non-secret federation configuration; the subject token is fetched per refresh. */
export function workloadIdentityOptions(
  env: Record<string, string | undefined>,
  getSubjectToken: () => Promise<string>,
) {
  const names = ["GCP_PROJECT_NUMBER", "GCP_SERVICE_ACCOUNT_EMAIL", "GCP_WORKLOAD_IDENTITY_POOL_ID", "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID"] as const;
  if (!names.some((name) => env[name]?.trim())) return undefined;
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Missing Google federation configuration: ${missing.join(", ")}`);
  return {
    type: "external_account",
    audience: `//iam.googleapis.com/projects/${env.GCP_PROJECT_NUMBER!.trim()}/locations/global/workloadIdentityPools/${env.GCP_WORKLOAD_IDENTITY_POOL_ID!.trim()}/providers/${env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID!.trim()}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${env.GCP_SERVICE_ACCOUNT_EMAIL!.trim()}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken },
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  };
}
