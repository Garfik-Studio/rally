import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { Storage } from "@google-cloud/storage";

// Cloud Storage in prod (GCS_BUCKET set once a bucket is provisioned — see
// docs/06-gcp-migration.md); local disk otherwise so dev needs no credentials.
// On Cloud Run the client picks up the attached service account automatically
// (Application Default Credentials), no key file to manage. Off GCP — the
// Vercel-hosted preview deploy — there's no ADC metadata server, so set
// GCS_CREDENTIALS_JSON (a service account key's JSON, verbatim) to use the
// same bucket from there too; leave GCS_BUCKET unset there and preview just
// falls back to local disk, which is fine for a throwaway environment but
// won't survive across serverless invocations, so uploads are unreliable.
// The bucket is private: /api/attachments/[id] is the only place that ever
// reads an object and it always streams bytes through the server, so nothing
// needs a public URL or a signed link. Keys are disambiguated by prefix:
// "gcs:<id>" lives in the bucket, anything else is a filename on local disk.
const STORAGE_ROOT = path.join(process.cwd(), "storage", "attachments");
const GCS_PREFIX = "gcs:";
const bucketName = () => process.env.GCS_BUCKET;

let storageClient: Storage | undefined;
function gcsBucket() {
  const bucket = bucketName();
  if (!bucket) throw new Error("GCS_BUCKET is not set but an attachment key points at Cloud Storage");
  if (!storageClient) {
    const credentialsJson = process.env.GCS_CREDENTIALS_JSON;
    storageClient = credentialsJson ? new Storage({ credentials: JSON.parse(credentialsJson) }) : new Storage();
  }
  return storageClient.bucket(bucket);
}

export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const MAX_TASK_ATTACHMENTS_BYTES = 5 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/json",
]);

/** Saves the file under a server-generated key (never the user's filename) and returns that key. */
export async function saveAttachmentFile(file: File): Promise<string> {
  const key = crypto.randomUUID();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (bucketName()) {
    await gcsBucket().file(`attachments/${key}`).save(buffer, { contentType: file.type });
    return GCS_PREFIX + key;
  }

  await mkdir(STORAGE_ROOT, { recursive: true });
  await writeFile(path.join(STORAGE_ROOT, key), buffer);
  return key;
}

export async function readAttachmentFile(key: string): Promise<Buffer> {
  if (key.startsWith(GCS_PREFIX)) {
    const [buffer] = await gcsBucket().file(`attachments/${key.slice(GCS_PREFIX.length)}`).download();
    return buffer;
  }
  return readFile(path.join(STORAGE_ROOT, key));
}

export async function deleteAttachmentFile(key: string): Promise<void> {
  if (key.startsWith(GCS_PREFIX)) {
    await gcsBucket().file(`attachments/${key.slice(GCS_PREFIX.length)}`).delete();
    return;
  }
  await unlink(path.join(STORAGE_ROOT, key));
}
