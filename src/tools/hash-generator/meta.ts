import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'hash-generator',
  name: 'Hash Generator',
  description:
    'Generate MD5, SHA-1, SHA-256, SHA-512, and CRC32 hashes from text or files',
  longDescription:
    'Compute cryptographic and non-cryptographic digests for arbitrary text or local files. ' +
    'File hashing is streamed in 64 KiB chunks on the Rust side, so files up to 100 MB process ' +
    'without loading the whole payload into memory.',
  category: 'crypto',
  tags: ['hash', 'md5', 'sha1', 'sha256', 'sha512', 'crc32', 'checksum', 'digest'],
  icon: 'hash',
  tier: 'free',
  requiresBackend: true,
};

export const HASH_ALGORITHMS = [
  { id: 'md5', label: 'MD5' },
  { id: 'sha1', label: 'SHA-1' },
  { id: 'sha256', label: 'SHA-256' },
  { id: 'sha512', label: 'SHA-512' },
  { id: 'crc32', label: 'CRC32' },
] as const;

export type HashAlgorithmId = (typeof HASH_ALGORITHMS)[number]['id'];
