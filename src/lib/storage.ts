import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { put, del } from "@vercel/blob";

// Vercel Blob in prod (BLOB_READ_WRITE_TOKEN set by Vercel once a Blob store is
// linked to the project); local disk otherwise so dev doesn't need a token.
// Blob keys are the returned URL, disk keys are a random UUID — readAttachmentFile
// and deleteAttachmentFile branch on that shape.
const STORAGE_ROOT = path.join(process.cwd(), "storage", "attachments");
const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

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

  if (blobEnabled()) {
    const blob = await put(`attachments/${key}`, file, { access: "public" });
    return blob.url;
  }

  await mkdir(STORAGE_ROOT, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(STORAGE_ROOT, key), buffer);
  return key;
}

export async function readAttachmentFile(key: string): Promise<Buffer> {
  if (key.startsWith("https://")) {
    const res = await fetch(key);
    if (!res.ok) throw new Error(`Failed to fetch attachment from blob storage: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(path.join(STORAGE_ROOT, key));
}

export async function deleteAttachmentFile(key: string): Promise<void> {
  if (key.startsWith("https://")) {
    await del(key);
    return;
  }
  await unlink(path.join(STORAGE_ROOT, key));
}
