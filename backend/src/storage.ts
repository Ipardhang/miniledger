import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { config } from './config';
import { HttpError } from './errors';

const EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function assertImageSignature(buffer: Buffer, contentType: string): void {
  const valid =
    (contentType === 'image/jpeg' &&
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff) ||
    (contentType === 'image/png' &&
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) ||
    (contentType === 'image/webp' &&
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP');

  if (!valid) {
    throw new HttpError(400, 'Receipt is not a valid JPEG, PNG or WebP image');
  }
}

function localPath(key: string): string {
  const root = path.resolve(config.uploadDir);
  const resolved = path.resolve(root, key);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error('Invalid storage key');
  }
  return resolved;
}

function hmac(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac('sha256', key).update(value).digest();
}

function sha256Hex(value: Buffer | string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalKey(key: string): string {
  return key.split('/').map(uriEncode).join('/');
}

function s3Url(key: string): URL {
  if (!config.s3Endpoint || !config.s3Bucket) {
    throw new Error('S3 storage is not configured');
  }
  const base = config.s3Endpoint.endsWith('/')
    ? config.s3Endpoint.slice(0, -1)
    : config.s3Endpoint;
  return new URL(`${base}/${uriEncode(config.s3Bucket)}/${canonicalKey(key)}`);
}

function signedHeaders(
  method: string,
  key: string,
  payloadHash: string,
  contentType?: string,
): { url: URL; headers: Record<string, string> } {
  if (!config.s3Endpoint || !config.s3Bucket || !config.s3Region || !config.s3AccessKeyId || !config.s3SecretAccessKey) {
    throw new Error('Incomplete S3 configuration');
  }

  const url = s3Url(key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);
  const host = url.host;
  const signedHeaderNames = contentType
    ? 'content-type;host;x-amz-content-sha256;x-amz-date'
    : 'host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders =
    (contentType ? `content-type:${contentType}\n` : '') +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const canonicalRequest = [
    method,
    url.pathname,
    '',
    canonicalHeaders,
    signedHeaderNames,
    payloadHash,
  ].join('\n');
  const scope = `${dateStamp}/${config.s3Region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${config.s3SecretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, config.s3Region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  return {
    url,
    headers: {
      ...(contentType ? { 'Content-Type': contentType } : {}),
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.s3AccessKeyId}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`,
    },
  };
}

export async function storeReceipt(
  userId: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  if (!EXT[contentType]) {
    throw new HttpError(400, 'Receipt must be a JPEG, PNG or WebP image');
  }
  assertImageSignature(buffer, contentType);

  const key = `${userId}/${crypto.randomUUID()}${EXT[contentType]}`;

  if (config.receiptStorage === 'local') {
    await fs.mkdir(path.dirname(localPath(key)), { recursive: true });
    await fs.writeFile(localPath(key), buffer);
    return key;
  }

  const payloadHash = sha256Hex(buffer);
  const signed = signedHeaders('PUT', key, payloadHash, contentType);
  const response = await fetch(signed.url, {
    method: 'PUT',
    headers: signed.headers,
    body: buffer,
  });
  if (!response.ok) {
    throw new Error(`Object storage upload failed (${response.status})`);
  }
  return key;
}

export async function loadReceipt(key: string): Promise<{ buffer: Buffer; contentType: string }> {
  const extension = path.extname(key).toLowerCase();
  const contentType =
    extension === '.jpg' ? 'image/jpeg' :
    extension === '.png' ? 'image/png' :
    extension === '.webp' ? 'image/webp' :
    'application/octet-stream';

  if (config.receiptStorage === 'local') {
    try {
      return { buffer: await fs.readFile(localPath(key)), contentType };
    } catch {
      throw new HttpError(404, 'Receipt not found');
    }
  }

  const signed = signedHeaders('GET', key, sha256Hex(Buffer.alloc(0)));
  const response = await fetch(signed.url, {
    method: 'GET',
    headers: signed.headers,
  });
  if (response.status === 404) throw new HttpError(404, 'Receipt not found');
  if (!response.ok) throw new Error(`Object storage read failed (${response.status})`);
  return { buffer: Buffer.from(await response.arrayBuffer()), contentType };
}

export async function deleteReceipt(key: string): Promise<void> {
  if (config.receiptStorage === 'local') {
    await fs.unlink(localPath(key)).catch(() => undefined);
    return;
  }

  const signed = signedHeaders('DELETE', key, sha256Hex(Buffer.alloc(0)));
  await fetch(signed.url, { method: 'DELETE', headers: signed.headers });
}
