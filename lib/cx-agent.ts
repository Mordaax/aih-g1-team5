import { GoogleAuth } from "google-auth-library";

export const primaryLanguageLabels = [
  "English",
  "Tagalog",
  "Bahasa Indonesia",
] as const;

export const languageLabels = primaryLanguageLabels;

export type PreferredLanguage = string;

export function isPreferredLanguage(value: unknown): value is PreferredLanguage {
  return (
    typeof value === "string" &&
    value.trim().length >= 2 &&
    value.trim().length <= 64 &&
    !/[\r\n]/.test(value)
  );
}

type JsonRecord = Record<string, unknown>;

type RunSessionRequest = {
  config: {
    session: string;
    app_version: string;
    deployment: string;
  };
  inputs: Array<
    | { variables: { preferred_language: PreferredLanguage } }
    | { text: string }
  >;
};

type RunSessionResult = {
  message: string;
  outputCount: number;
};

export type CxAgentErrorCode =
  | "CONFIGURATION"
  | "AUTHENTICATION"
  | "TIMEOUT"
  | "UPSTREAM";

export class CxAgentError extends Error {
  constructor(
    message: string,
    public readonly code: CxAgentErrorCode,
    public readonly upstreamStatus?: number,
  ) {
    super(message);
    this.name = "CxAgentError";
  }
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new CxAgentError(
      `Missing required environment variable: ${name}`,
      "CONFIGURATION",
    );
  }

  return value;
}

function getCxConfig() {
  const projectId =
    process.env.GCP_PROJECT_ID?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT_ID?.trim() ||
    getRequiredEnv("GCP_PROJECT_ID");
  const region =
    process.env.GCP_REGION_ID?.trim() ||
    process.env.CX_REGION?.trim() ||
    getRequiredEnv("GCP_REGION_ID");
  const applicationId = getRequiredEnv("CX_APPLICATION_ID");
  const deploymentId = getRequiredEnv("CX_DEPLOYMENT_ID");
  const applicationVersionId = getRequiredEnv("CX_APPLICATION_VERSION_ID");
  const apiVersion = process.env.CX_API_VERSION?.trim() || "v1beta";
  const applicationName = `projects/${projectId}/locations/${region}/apps/${applicationId}`;

  return {
    apiVersion,
    applicationName,
    applicationVersionName: `${applicationName}/versions/${applicationVersionId}`,
    deploymentName: `${applicationName}/deployments/${deploymentId}`,
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function extractText(response: unknown) {
  if (!isRecord(response) || !Array.isArray(response.outputs)) {
    return { message: "", outputCount: 0 };
  }

  const textOutputs = response.outputs.flatMap((output) => {
    if (!isRecord(output)) return [];

    if (typeof output.text === "string" && output.text.trim()) {
      return [output.text.trim()];
    }

    if (typeof output.progress === "string" && output.progress.trim()) {
      return [output.progress.trim()];
    }

    return [];
  });

  return {
    message: textOutputs.join("\n\n"),
    outputCount: response.outputs.length,
  };
}

export async function runCxSession({
  message,
  sessionId,
  language,
}: {
  message: string;
  sessionId: string;
  language: PreferredLanguage;
}): Promise<RunSessionResult> {
  const { apiVersion, applicationName, applicationVersionName, deploymentName } = getCxConfig();
  const sessionName = `${applicationName}/sessions/${sessionId}`;
  const authOptions = {
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    ...(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
      ? {
          credentials: JSON.parse(
            process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
          ),
        }
      : {}),
  };
  let accessToken: string | null | undefined;

  try {
    const auth = new GoogleAuth(authOptions);
    accessToken = await auth.getAccessToken();
  } catch (error) {
    throw new CxAgentError(
      error instanceof Error ? error.message : "Google Cloud authentication failed",
      "AUTHENTICATION",
    );
  }

  if (!accessToken) {
    throw new CxAgentError(
      "Google Cloud authentication did not return an access token",
      "AUTHENTICATION",
    );
  }

  const inputs: RunSessionRequest["inputs"] = [
    { variables: { preferred_language: language } },
  ];

  if (message) {
    inputs.push({ text: message });
  }

  let response: Response;

  try {
    response = await fetch(
      `https://ces.googleapis.com/${apiVersion}/${sessionName}:runSession`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          config: {
            session: sessionName,
            app_version: applicationVersionName,
            deployment: deploymentName,
          },
          inputs,
        } satisfies RunSessionRequest),
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new CxAgentError(
        "CX Agent Studio request timed out",
        "TIMEOUT",
      );
    }

    throw new CxAgentError(
      error instanceof Error ? error.message : "CX Agent Studio request failed",
      "UPSTREAM",
    );
  }

  if (!response.ok) {
    throw new CxAgentError(
      `CX Agent Studio returned HTTP ${response.status}`,
      "UPSTREAM",
      response.status,
    );
  }

  const responseBody = (await response.json()) as unknown;
  return extractText(responseBody);
}
