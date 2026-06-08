import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BlobServiceClient } from '@azure/storage-blob';
import logger from '../utils/logger.js';

const ENABLED = process.env.ENABLE_UPLOADS === 'true';
const IS_PROD = process.env.NODE_ENV === 'production';
const LOCAL_DIR = path.resolve('uploads');

let containerClient = null;

if (ENABLED && IS_PROD) {
  const blobService = BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING
  );
  containerClient = blobService.getContainerClient(
    process.env.AZURE_STORAGE_CONTAINER || 'uploads'
  );
}

function uniqueName(originalName) {
  const ext = path.extname(originalName);
  return `${crypto.randomUUID()}${ext}`;
}

/**
 * Upload a file (multer file object). Returns { url, filename }.
 */
export async function uploadFile(file) {
  if (!ENABLED) {
    throw new Error('Uploads are not enabled. Set ENABLE_UPLOADS=true in .env');
  }

  const filename = uniqueName(file.originalname);

  if (IS_PROD) {
    const blockBlob = containerClient.getBlockBlobClient(filename);
    await blockBlob.uploadData(file.buffer, {
      blobHTTPHeaders: { blobContentType: file.mimetype },
    });
    const url = blockBlob.url;
    logger.info(`File uploaded to Azure: ${filename}`);
    return { url, filename };
  }

  // Development: local filesystem
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, filename), file.buffer);
  const url = `/uploads/${filename}`;
  logger.info(`File uploaded locally: ${filename}`);
  return { url, filename };
}

/**
 * Delete a file by filename.
 */
export async function deleteFile(filename) {
  if (!ENABLED) {
    throw new Error('Uploads are not enabled. Set ENABLE_UPLOADS=true in .env');
  }

  if (IS_PROD) {
    const blockBlob = containerClient.getBlockBlobClient(filename);
    await blockBlob.deleteIfExists();
    logger.info(`File deleted from Azure: ${filename}`);
    return;
  }

  const filePath = path.join(LOCAL_DIR, filename);
  await fs.unlink(filePath).catch(() => {});
  logger.info(`File deleted locally: ${filename}`);
}

/**
 * Get the accessible URL for a file.
 */
export function getFileUrl(filename) {
  if (!ENABLED) {
    throw new Error('Uploads are not enabled. Set ENABLE_UPLOADS=true in .env');
  }

  if (IS_PROD) {
    return containerClient.getBlockBlobClient(filename).url;
  }

  return `/uploads/${filename}`;
}
