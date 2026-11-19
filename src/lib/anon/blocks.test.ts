import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  blockSender,
  buildAbuseReport,
  createAbuseReportSubmission,
  clearAbuseReports,
  clearBlockList,
  isAbuseCategory,
  isBlocked,
  loadAbuseReports,
  loadBlockList,
  markAbuseReportUploaded,
  recordAbuseReport,
  unblockSender,
  verifyAbuseReportSignature,
} from './blocks';
import { createInviteToken } from './spam';
import { generateQueueSigningKeyPair } from './signing';

function keyPair() {
  const pair = generateQueueSigningKeyPair();
  return pair.publicKey;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  clearBlockList();
  clearAbuseReports();
  vi.restoreAllMocks();
});

describe('local block list', () => {
  it('blocks and unblocks a sender by signing key', () => {
    const key = keyPair();
    expect(isBlocked(key)).toBe(false);
    expect(blockSender(key, 'spam wave')).toBe(true);
    expect(isBlocked(key)).toBe(true);

    const entries = loadBlockList();
    expect(entries).toHaveLength(1);
    expect(entries[0].signingPublicKey).toBe(key);
    expect(entries[0].note).toBe('spam wave');

    expect(unblockSender(key)).toBe(true);
    expect(isBlocked(key)).toBe(false);
    expect(unblockSender(key)).toBe(false);
  });

  it('rejects malformed signing keys', () => {
    expect(blockSender('not-a-key')).toBe(false);
    expect(isBlocked('not-a-key')).toBe(false);
    expect(unblockSender('')).toBe(false);
    expect(loadBlockList()).toHaveLength(0);
  });

  it('persists entries across accesses and deduplicates', () => {
    const key = keyPair();
    blockSender(key);
    expect(loadBlockList()).toHaveLength(1);

    // A second key survives in the same list.
    const other = keyPair();
    blockSender(other);
    expect(loadBlockList()).toHaveLength(2);
  });

  it('clears the whole list', () => {
    blockSender(keyPair());
    blockSender(keyPair());
    clearBlockList();
    expect(loadBlockList()).toHaveLength(0);
  });

  it('keeps blocking and reports available for the session when storage writes fail', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage full');
    });
    const key = keyPair();
    expect(blockSender(key)).toBe(true);
    expect(isBlocked(key)).toBe(true);
    expect(loadBlockList()).toHaveLength(1);

    const report = await recordAbuseReport({
      queueId: 'q_00000000000000000000000000000000',
      signingPublicKey: key,
      category: 'spam',
    });
    expect(report).not.toBeNull();
    expect(loadAbuseReports()).toEqual([report]);
  });

  it('ignore garbage stored data', () => {
    localStorage.setItem('nova_anon_block_list_v1', '{not json');
    expect(loadBlockList()).toEqual([]);
    localStorage.setItem('nova_anon_block_list_v1', JSON.stringify([{ signingPublicKey: 'bad' }]));
    expect(loadBlockList()).toEqual([]);
  });
});

describe('abuse reports', () => {
  it('builds a hash-only report with no identifying data', async () => {
    const key = keyPair();
    const queueId = `q_${createInviteToken().slice(0, 32).toLowerCase().replace(/[^0-9a-f]/g, '0').slice(0, 32)}`;
    const report = await buildAbuseReport({ queueId, signingPublicKey: key, category: 'spam' });
    expect(report).not.toBeNull();
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(key);
    expect(serialized).not.toContain(queueId);
    expect(report!.queueIdHash).toMatch(/^[0-9a-f]{64}$/);
    expect(report!.signingKeyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(report!.reportId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('rejects malformed queue ids, keys and categories', async () => {
    const key = keyPair();
    expect(
      await buildAbuseReport({ queueId: 'bad', signingPublicKey: key, category: 'spam' }),
    ).toBeNull();
    expect(
      await buildAbuseReport({ queueId: 'q_00000000000000000000000000000000', signingPublicKey: 'bad', category: 'spam' }),
    ).toBeNull();
    expect(
      await buildAbuseReport({
        queueId: 'q_00000000000000000000000000000000',
        signingPublicKey: key,
        category: 'nonsense' as never,
      }),
    ).toBeNull();
  });

  it('records reports locally in newest-first order', async () => {
    const a = await recordAbuseReport({
      queueId: 'q_00000000000000000000000000000000',
      signingPublicKey: keyPair(),
      category: 'spam',
    });
    const b = await recordAbuseReport({
      queueId: 'q_11111111111111111111111111111111',
      signingPublicKey: keyPair(),
      category: 'harassment',
    });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    const reports = loadAbuseReports();
    expect(reports).toHaveLength(2);
    expect(reports[0].queueIdHash).toBe(b!.queueIdHash);
    expect(reports[1].queueIdHash).toBe(a!.queueIdHash);
    expect(isAbuseCategory(reports[0].category)).toBe(true);
  });

  it('reuses pending report ids for retries and marks successful uploads', async () => {
    const params = {
      queueId: 'q_00000000000000000000000000000000',
      signingPublicKey: keyPair(),
      category: 'spam' as const,
    };
    const first = await recordAbuseReport(params);
    const retry = await recordAbuseReport(params);
    expect(retry?.reportId).toBe(first?.reportId);
    expect(markAbuseReportUploaded(first!.reportId!)).toBe(true);

    const next = await recordAbuseReport(params);
    expect(next?.reportId).not.toBe(first?.reportId);
    expect(loadAbuseReports().find((report) => report.reportId === first?.reportId)?.uploadedAt)
      .toEqual(expect.any(Number));
  });

  it('clears reports', async () => {
    await recordAbuseReport({
      queueId: 'q_00000000000000000000000000000000',
      signingPublicKey: keyPair(),
      category: 'illegal',
    });
    clearAbuseReports();
    expect(loadAbuseReports()).toHaveLength(0);
  });

  describe('authenticated abuse reports (Phase G)', () => {
    it('builds a report with reporter key hash when reporter key is provided', async () => {
      const reporter = generateQueueSigningKeyPair();
      const queueId = `q_${createInviteToken().slice(0, 32).toLowerCase().replace(/[^0-9a-f]/g, '0').slice(0, 32)}`;
      const signingKey = generateQueueSigningKeyPair().publicKey;
      const report = await buildAbuseReport({
        queueId,
        signingPublicKey: signingKey,
        category: 'spam',
        reporterSigningPublicKey: reporter.publicKey,
      });
      expect(report).not.toBeNull();
      expect(report!.reporterKeyHash).toMatch(/^[0-9a-f]{64}$/);
      // reporterKeyHash should NOT equal the raw public key (it's a hash)
      expect(report!.reporterKeyHash).not.toBe(reporter.publicKey);
    });

    it('builds a hash-only report without reporter key', async () => {
      const signingKey = generateQueueSigningKeyPair().publicKey;
      const queueId = `q_${createInviteToken().slice(0, 32).toLowerCase().replace(/[^0-9a-f]/g, '0').slice(0, 32)}`;
      const report = await buildAbuseReport({
        queueId,
        signingPublicKey: signingKey,
        category: 'harassment',
      });
      expect(report).not.toBeNull();
      expect(report!.reporterKeyHash).toBeUndefined();
    });

    it('signs and verifies an authenticated abuse report', async () => {
      const reporter = generateQueueSigningKeyPair();
      const signingKey = generateQueueSigningKeyPair().publicKey;
      const queueId = `q_${createInviteToken().slice(0, 32).toLowerCase().replace(/[^0-9a-f]/g, '0').slice(0, 32)}`;
      const report = await buildAbuseReport({
        queueId,
        signingPublicKey: signingKey,
        category: 'illegal',
        reporterSigningPublicKey: reporter.publicKey,
      });
      expect(report).not.toBeNull();
      expect(report!.reporterKeyHash).toBeDefined();

      const submission = await createAbuseReportSubmission(report!, reporter.privateKey);
      expect(submission).not.toBeNull();
      expect(submission!.signature).toBeDefined();
      expect(typeof submission!.signature).toBe('string');
      expect(submission!.signature.length).toBeGreaterThan(0);

      const valid = await verifyAbuseReportSignature(reporter.publicKey, submission!);
      expect(valid).toBe(true);
    });

    it('rejects a signature made with the wrong key', async () => {
      const reporter = generateQueueSigningKeyPair();
      const wrongReporter = generateQueueSigningKeyPair();
      const signingKey = generateQueueSigningKeyPair().publicKey;
      const queueId = `q_${createInviteToken().slice(0, 32).toLowerCase().replace(/[^0-9a-f]/g, '0').slice(0, 32)}`;
      const report = await buildAbuseReport({
        queueId,
        signingPublicKey: signingKey,
        category: 'spam',
        reporterSigningPublicKey: reporter.publicKey,
      });
      expect(report).not.toBeNull();

      const submission = await createAbuseReportSubmission(report!, wrongReporter.privateKey);
      expect(submission).not.toBeNull();
      expect(submission!.signature).toBeDefined();

      // Verifying with the wrong public key should fail
      const valid = await verifyAbuseReportSignature(reporter.publicKey, submission!);
      expect(valid).toBe(false);
    });

    it('returns false for hash-only reports (no signature)', async () => {
      const signingKey = generateQueueSigningKeyPair().publicKey;
      const queueId = `q_${createInviteToken().slice(0, 32).toLowerCase().replace(/[^0-9a-f]/g, '0').slice(0, 32)}`;
      const report = await buildAbuseReport({
        queueId,
        signingPublicKey: signingKey,
        category: 'spam',
      });
      expect(report).not.toBeNull();

      const submission = await createAbuseReportSubmission(report!);
      expect(submission).not.toBeNull();
      expect(submission!.signature).toBeUndefined();

      const valid = await verifyAbuseReportSignature(signingKey, submission!);
      expect(valid).toBe(false);
    });

    it('creates a submission with signature when reporter private key is provided', async () => {
      const reporter = generateQueueSigningKeyPair();
      const signingKey = generateQueueSigningKeyPair().publicKey;
      const queueId = `q_${createInviteToken().slice(0, 32).toLowerCase().replace(/[^0-9a-f]/g, '0').slice(0, 32)}`;
      const report = await recordAbuseReport({
        queueId,
        signingPublicKey: signingKey,
        category: 'spam',
        reporterSigningPublicKey: reporter.publicKey,
      });
      expect(report).not.toBeNull();
      expect(report!.reporterKeyHash).toBeDefined();

      const submission = await createAbuseReportSubmission(report!, reporter.privateKey);
      expect(submission).not.toBeNull();
      expect(submission!.signature).toBeDefined();
      expect(submission!.reporterKeyHash).toBe(report!.reporterKeyHash);
      expect(submission!.queueIdHash).toBe(report!.queueIdHash);
    });
  });
});
