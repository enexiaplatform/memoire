import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate';

const PREFIX = 'memoire-zlib-v1:';
const COMPRESSION_THRESHOLD = 128 * 1024;

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

/** Keeps small/legacy values readable JSON and compresses only the unbounded Revision collection. */
export function encodeHistoricalStorage(raw: string) {
  if (raw.length < COMPRESSION_THRESHOLD || raw.startsWith(PREFIX)) return raw;
  const compressed = `${PREFIX}${bytesToBase64(zlibSync(strToU8(raw), { level: 1 }))}`;
  return compressed.length < raw.length ? compressed : raw;
}

/** Old uncompressed workspaces remain valid. A corrupt compressed value fails instead of becoming empty history. */
export function decodeHistoricalStorage(stored: string) {
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    return strFromU8(unzlibSync(base64ToBytes(stored.slice(PREFIX.length))));
  } catch {
    throw new Error('Compressed historical storage is unreadable. Restore from a verified backup.');
  }
}

export function isCompressedHistoricalStorage(stored: string) {
  return stored.startsWith(PREFIX);
}
