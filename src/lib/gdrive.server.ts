/**
 * Google Drive connector gateway helpers.
 *
 * Uses the Lovable-managed Google Drive connection. Files are uploaded as
 * multipart/related metadata + media so both the name and parent folder are
 * set in a single call.
 */

const DRIVE_GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const UPLOAD_GATEWAY = "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3";

function gatewayHeaders(extra?: Record<string, string>) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error("Google Drive সংযোগ কনফিগার করা নেই");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
    ...extra,
  };
}

async function parseResponse<T = Record<string, unknown>>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!res.ok) {
    console.error(`[gdrive] ${res.status}: ${text.slice(0, 500)}`);
    throw new Error(`Google Drive ত্রুটি [${res.status}]: ${text.slice(0, 300)}`);
  }
  return text ? (JSON.parse(text) as T) : null;
}

export async function driveFetch<T = Record<string, unknown>>(path: string, init?: RequestInit) {
  const url = `${DRIVE_GATEWAY}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...gatewayHeaders(), ...(init?.headers ?? {}) },
  });
  return parseResponse<T>(res);
}

type UploadResult = { id: string; name: string; webViewLink?: string; size?: string };

export async function uploadToDrive(opts: {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  folderId?: string | null;
}) {
  const boundary = `winstone-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name: opts.name,
    mimeType: opts.mimeType,
    parents: opts.folderId ? [opts.folderId] : undefined,
  });
  const prefix = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${opts.mimeType}\r\nContent-Transfer-Encoding: binary\r\n\r\n`;
  const suffix = `\r\n--${boundary}--\r\n`;
  const prefixBytes = new TextEncoder().encode(prefix);
  const suffixBytes = new TextEncoder().encode(suffix);

  const body = new Uint8Array(prefixBytes.length + opts.bytes.length + suffixBytes.length);
  body.set(prefixBytes, 0);
  body.set(opts.bytes, prefixBytes.length);
  body.set(suffixBytes, prefixBytes.length + opts.bytes.length);

  const url = `${UPLOAD_GATEWAY}/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,parents,size`;
  const res = await fetch(url, {
    method: "POST",
    headers: gatewayHeaders({ "Content-Type": `multipart/related; boundary=${boundary}` }),
    body,
  });
  const result = await parseResponse<UploadResult>(res);
  if (!result) throw new Error("Google Drive আপলোড ফলাফল ফাঁকা");
  return result;
}

type DocMetadata = { id: string; name: string; webViewLink?: string };

export async function createDriveDoc(name: string, folderId?: string | null) {
  const created = await driveFetch<DocMetadata>(`/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.document",
      parents: folderId ? [folderId] : undefined,
    }),
  });
  if (!created?.id) throw new Error("Google Drive ডকুমেন্ট তৈরি হয়নি");
  return created;
}

export async function getOrCreateDriveFolder(name: string, parentId?: string | null) {
  const escaped = name.replace(/'/g, "\\'").replace(/\\/g, "\\\\");
  const parentClause = parentId ? ` and '${parentId}' in parents` : "";
  const q = `mimeType='application/vnd.google-apps.folder' and name='${escaped}' and trashed=false${parentClause}`;
  const list = await driveFetch<{ files?: { id: string; name: string }[] }>(
    `/files?q=${encodeURIComponent(q)}&pageSize=1&fields=files(id,name)`,
  );
  if (list?.files?.[0]) return list.files[0].id;

  const created = await driveFetch<{ id: string }>(`/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    }),
  });
  if (!created?.id) throw new Error("Google Drive ফোল্ডার তৈরি হয়নি");
  return created.id;
}
