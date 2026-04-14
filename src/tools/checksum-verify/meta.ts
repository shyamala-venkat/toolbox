import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'checksum-verify',
  name: 'File Checksum Verifier',
  description: 'Verify file integrity by comparing computed hashes against expected values',
  longDescription:
    'Select a file and paste the expected hash from a download page or release notes. ' +
    'The tool auto-detects the algorithm from the hash length (MD5, SHA-1, SHA-256, SHA-512) ' +
    'and computes the file hash via the Rust backend. Streaming in 64 KiB chunks, up to 100 MB.',
  category: 'crypto',
  tags: ['checksum', 'verify', 'hash', 'file', 'integrity', 'md5', 'sha256', 'download'],
  icon: 'shield-check',
  tier: 'free',
  requiresBackend: true,
};

export type VerifyAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha512';

export interface AlgorithmInfo {
  id: VerifyAlgorithm;
  label: string;
  hexLength: number;
}

/** Ordered by hash length so auto-detection can iterate deterministically. */
export const VERIFY_ALGORITHMS: AlgorithmInfo[] = [
  { id: 'md5', label: 'MD5', hexLength: 32 },
  { id: 'sha1', label: 'SHA-1', hexLength: 40 },
  { id: 'sha256', label: 'SHA-256', hexLength: 64 },
  { id: 'sha512', label: 'SHA-512', hexLength: 128 },
];

/**
 * Detect the hash algorithm from the hex string length.
 * Returns `null` if the length doesn't match any known algorithm.
 */
export const detectAlgorithm = (hex: string): AlgorithmInfo | null => {
  const trimmed = hex.trim();
  // Must be valid hex characters only
  if (!/^[0-9a-fA-F]+$/.test(trimmed)) return null;
  return VERIFY_ALGORITHMS.find((a) => a.hexLength === trimmed.length) ?? null;
};
