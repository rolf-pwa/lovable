// Shared Vertex AI helper — Montreal region, PIPEDA compliant.
// Extracted from portal-assistant so any edge function can call Gemini without
// duplicating service-account JWT logic.

export interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key: string;
  client_email: string;
  token_uri: string;
}

const REGION = "northamerica-northeast1";

export function vertexModelUrl(projectId: string, model: string) {
  return `https://${REGION}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${REGION}/publishers/google/models/${model}:generateContent`;
}

export async function parseServiceAccountKey(raw?: string | null): Promise<ServiceAccountKey> {
  if (!raw) throw new Error("GCP_SERVICE_ACCOUNT_KEY not configured");
  let cleaned = raw.trim().replace(/^\uFEFF/, "");
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    try { cleaned = JSON.parse(cleaned); } catch { /* keep cleaned */ }
  }
  let sa: ServiceAccountKey;
  try {
    sa = JSON.parse(cleaned);
  } catch {
    throw new Error("GCP_SERVICE_ACCOUNT_KEY contains invalid JSON.");
  }
  if (!sa.private_key || !sa.client_email || !sa.project_id) {
    throw new Error("GCP key is missing required fields (private_key, client_email, project_id).");
  }
  return sa;
}

export async function getGcpAccessToken(sa: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  };
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unsigned = `${enc(header)}.${enc(payload)}`;
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsigned),
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${unsigned}.${signature}`;
  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Token exchange failed: ${data.error_description || data.error}`);
  }
  return data.access_token;
}

export interface VertexContent {
  role: "user" | "model";
  parts: Array<{ text?: string; fileData?: { mimeType: string; fileUri: string } }>;
}

export async function generateVertexContent(
  sa: ServiceAccountKey,
  model: string,
  contents: VertexContent[],
  generationConfig?: Record<string, unknown>,
): Promise<any> {
  const accessToken = await getGcpAccessToken(sa);
  const url = vertexModelUrl(sa.project_id, model);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        ...generationConfig,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vertex AI error ${res.status}: ${text.slice(0, 500)}`);
  }
  return await res.json();
}
