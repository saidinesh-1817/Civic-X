import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BadRequestError } from './apiError.js';

export interface StoredFileResult {
  filename: string;
  urlPath: string;
  sizeBytes: number;
  mimeType: string;
}

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/**
 * Validates image buffer magic bytes to ensure file type authenticity
 */
export function validateImageMagicBytes(buffer: Buffer): string {
  if (buffer.length < 12) {
    throw new BadRequestError('Invalid image file: file header too short');
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // GIF: 47 49 46 38 ('GIF8')
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'image/gif';
  }

  // WEBP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  throw new BadRequestError(
    'Invalid image file format. Allowed formats are JPEG, PNG, WEBP, and GIF.'
  );
}

/**
 * Parses and saves a base64-encoded or data-URI image to disk securely.
 * Generates an unguessable unique filename and stores it in the uploads directory.
 *
 * @param dataUriOrBase64 Base64 string or Data URI (e.g. data:image/png;base64,...)
 * @param subfolder Target subfolder in uploads/ (default: 'complaints')
 * @returns StoredFileResult containing safe filename and URL path
 */
export async function saveBase64Image(
  dataUriOrBase64: string,
  subfolder: string = 'complaints'
): Promise<StoredFileResult> {
  if (!dataUriOrBase64 || typeof dataUriOrBase64 !== 'string') {
    throw new BadRequestError('Invalid or empty image payload');
  }

  let base64Data = dataUriOrBase64;

  // Check if string is a Data URI: data:<mime>;base64,<data>
  const dataUriMatch = dataUriOrBase64.match(/^data:[a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+;base64,(.+)$/);
  if (dataUriMatch) {
    base64Data = dataUriMatch[1];
  }

  // Decode buffer
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Data, 'base64');
  } catch {
    throw new BadRequestError('Malformed base64 image data');
  }

  // Validate size
  if (buffer.length === 0) {
    throw new BadRequestError('Image file is empty (0 bytes)');
  }

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new BadRequestError(
      `Image file size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed size of 5 MB`
    );
  }

  // Validate genuine magic bytes
  const verifiedMimeType = validateImageMagicBytes(buffer);
  const extension = ALLOWED_MIME_MAP[verifiedMimeType] || '.jpg';

  // Generate safe unique filename: complaint_<timestamp>_<randomHex>.<ext>
  const randomSuffix = crypto.randomBytes(8).toString('hex');
  const safeFilename = `${subfolder.replace(/[^a-zA-Z0-9_-]/g, '')}_${Date.now()}_${randomSuffix}${extension}`;

  // Ensure upload directory exists
  const uploadsBaseDir = path.resolve(process.cwd(), 'uploads', subfolder);
  await fs.promises.mkdir(uploadsBaseDir, { recursive: true });

  // Save file to disk
  const filePath = path.join(uploadsBaseDir, safeFilename);
  await fs.promises.writeFile(filePath, buffer);

  const urlPath = `/uploads/${subfolder}/${safeFilename}`;

  return {
    filename: safeFilename,
    urlPath,
    sizeBytes: buffer.length,
    mimeType: verifiedMimeType,
  };
}
