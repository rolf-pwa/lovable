import { supabase } from "@/integrations/supabase/client";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token}`,
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}

// --- Google Auth ---

export async function getGoogleAuthUrl() {
  const headers = await getAuthHeaders();
  const redirectUri = `${window.location.origin}/google-callback`;
  const res = await fetch(`${FUNCTIONS_URL}/google-auth?action=auth-url`, {
    method: "POST",
    headers,
    body: JSON.stringify({ redirect_uri: redirectUri }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to get auth URL");
  return data.url as string;
}

export async function exchangeGoogleCode(code: string) {
  const headers = await getAuthHeaders();
  const redirectUri = `${window.location.origin}/google-callback`;
  const res = await fetch(`${FUNCTIONS_URL}/google-auth?action=callback`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to exchange code");
  return data;
}

export async function getGoogleConnectionStatus() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${FUNCTIONS_URL}/google-auth?action=status`, {
    method: "POST",
    headers,
  });
  return res.json();
}

export async function syncCharterDriveSources(contactId: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${FUNCTIONS_URL}/drive-watch`, {
    method: "POST",
    headers,
    body: JSON.stringify({ contactId, mode: "charter-sync" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to sync charter Drive folder");
  return data;
}

export async function disconnectGoogle() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${FUNCTIONS_URL}/google-auth?action=disconnect`, {
    method: "POST",
    headers,
  });
  return res.json();
}

// --- Calendar ---

export async function listCalendarEvents(timeMin?: string, timeMax?: string) {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({ action: "list" });
  if (timeMin) params.set("timeMin", timeMin);
  if (timeMax) params.set("timeMax", timeMax);
  const res = await fetch(`${FUNCTIONS_URL}/google-calendar?${params}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to list events");
  return data;
}

export async function createCalendarEvent(event: {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  attendees?: { email: string }[];
}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${FUNCTIONS_URL}/google-calendar?action=create`, {
    method: "POST",
    headers,
    body: JSON.stringify(event),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create event");
  return data;
}

// --- Gmail ---

export async function listGmailMessages(query?: string) {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({ action: "list" });
  if (query) params.set("q", query);
  const res = await fetch(`${FUNCTIONS_URL}/google-gmail?${params}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to list messages");
  return data;
}

export async function readGmailMessage(messageId: string) {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({ action: "read", messageId });
  const res = await fetch(`${FUNCTIONS_URL}/google-gmail?${params}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to read message");
  return data;
}

export async function sendGmailMessage(
  to: string,
  subject: string,
  body: string,
  opts?: { cc?: string; bcc?: string; threadId?: string; inReplyTo?: string; references?: string },
) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${FUNCTIONS_URL}/google-gmail?action=send`, {
    method: "POST",
    headers,
    body: JSON.stringify({ to, subject, body, ...opts }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to send message");
  return data;
}

// --- Gmail threads / mailbox ---

export async function listGmailThreads(params: {
  q?: string; labelIds?: string; maxResults?: number; pageToken?: string;
} = {}) {
  const headers = await getAuthHeaders();
  const sp = new URLSearchParams({ action: "threads-list" });
  if (params.q) sp.set("q", params.q);
  if (params.labelIds) sp.set("labelIds", params.labelIds);
  if (params.maxResults) sp.set("maxResults", String(params.maxResults));
  if (params.pageToken) sp.set("pageToken", params.pageToken);
  const res = await fetch(`${FUNCTIONS_URL}/google-gmail?${sp}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to list threads");
  return data as { threads: any[]; nextPageToken: string | null };
}

export async function getGmailThread(threadId: string) {
  const headers = await getAuthHeaders();
  const sp = new URLSearchParams({ action: "thread-get", threadId });
  const res = await fetch(`${FUNCTIONS_URL}/google-gmail?${sp}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to get thread");
  return data as { id: string; messages: any[] };
}

export async function modifyGmail(payload: {
  messageId?: string; threadId?: string;
  addLabelIds?: string[]; removeLabelIds?: string[];
}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${FUNCTIONS_URL}/google-gmail?action=modify`, {
    method: "POST", headers, body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to modify");
  return data;
}

export async function trashGmail(payload: { messageId?: string; threadId?: string }) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${FUNCTIONS_URL}/google-gmail?action=trash`, {
    method: "POST", headers, body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to trash");
  return data;
}

export async function untrashGmail(payload: { messageId?: string; threadId?: string }) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${FUNCTIONS_URL}/google-gmail?action=untrash`, {
    method: "POST", headers, body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to untrash");
  return data;
}

export async function listGmailLabels() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${FUNCTIONS_URL}/google-gmail?action=labels-list`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to list labels");
  return data as { labels: any[] };
}

export async function getGmailProfile() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${FUNCTIONS_URL}/google-gmail?action=profile`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to get profile");
  return data as { emailAddress: string; messagesTotal: number; threadsTotal: number };
}

export async function createGmailDraft(to: string, subject: string, body: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${FUNCTIONS_URL}/google-gmail?action=draft`, {
    method: "POST",
    headers,
    body: JSON.stringify({ to, subject, body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create draft");
  return data;
}

// --- Google Docs ---

export async function listGoogleDocs(query?: string) {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({ action: "list" });
  if (query) params.set("q", query);
  const res = await fetch(`${FUNCTIONS_URL}/google-docs?${params}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to list docs");
  return data.files as { id: string; name: string; modifiedTime: string; webViewLink: string }[];
}

export async function getGoogleDoc(docIdOrUrl: string) {
  const headers = await getAuthHeaders();
  const isUrl = docIdOrUrl.startsWith("http");
  const params = new URLSearchParams({
    action: "get",
    ...(isUrl ? { url: docIdOrUrl } : { docId: docIdOrUrl }),
  });
  const res = await fetch(`${FUNCTIONS_URL}/google-docs?${params}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to get doc");
  return data as { id: string; name: string; modifiedTime: string; content: string };
}

