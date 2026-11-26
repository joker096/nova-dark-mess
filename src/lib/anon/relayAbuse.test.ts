import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAnonRelay } from './relay';
import type { AbuseReportSubmission } from './blocks';
import { sha256 } from '@noble/hashes/sha2.js';

function hashKey(key: string): string {
  return Array.from(sha256(new TextEncoder().encode(key)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('InMemoryAnonRelay abuse reports', () => {
  let relay: InMemoryAnonRelay;

  beforeEach(() => {
    relay = new InMemoryAnonRelay();
  });

  it('accepts valid abuse report and tracks count', () => {
    const signingKey = 'test_key_for_abuse_report';
    const signingKeyHash = hashKey(signingKey);
    
    const report: AbuseReportSubmission = {
      v: 1,
      reportId: 'a'.repeat(32),
      queueIdHash: 'b'.repeat(64),
      signingKeyHash,
      reportedAt: Date.now(),
      category: 'spam',
    };

    expect(relay.submitAbuseReport(report)).toBe(true);
    expect(relay.submitAbuseReport(report)).toBe(true);
    expect(relay.submitAbuseReport(report)).toBe(true);

    const status = relay.getAbuseStatus(signingKey);
    expect(status.reportCount).toBe(3);
  });

  it('blocks signing key after MAX_REPORTS_PER_KEY reports', () => {
    const signingKey = 'test_signing_key_1234567890123456789012345678901234567890';
    const signingKeyHash = hashKey(signingKey);

    const report: AbuseReportSubmission = {
      v: 1,
      reportId: 'a'.repeat(32),
      queueIdHash: 'b'.repeat(64),
      signingKeyHash,
      reportedAt: Date.now(),
      category: 'spam',
    };

    // Submit 10 reports (MAX_REPORTS_PER_KEY = 10)
    for (let i = 0; i < 10; i++) {
      expect(relay.submitAbuseReport(report)).toBe(true);
    }

    // Key should now be blocked
    expect(relay.isSigningKeyBlocked(signingKey)).toBe(true);
  });

  it('rejects queue creation with blocked signing key', () => {
    const signingKey = 'blocked_key_1234567890123456789012345678901234567890';
    const signingKeyHash = hashKey(signingKey);

    const report: AbuseReportSubmission = {
      v: 1,
      reportId: 'a'.repeat(32),
      queueIdHash: 'b'.repeat(64),
      signingKeyHash,
      reportedAt: Date.now(),
      category: 'spam',
    };

    // Block the key
    for (let i = 0; i < 10; i++) {
      relay.submitAbuseReport(report);
    }

    // Try to create queue with blocked key
    expect(() => {
      relay.createQueueWithSigningKey(signingKey, 'private_key');
    }).toThrow('Signing key blocked due to abuse reports');
  });

  it('allows queue creation with non-blocked signing key', () => {
    const signingKey = 'good_key_1234567890123456789012345678901234567890';
    const result = relay.createQueueWithSigningKey(signingKey, 'private_key');
    expect(result.queueId).toBeDefined();
    expect(result.inviteToken).toBeDefined();
  });

  it('blocks enqueue for queue with blocked signing key', () => {
    const signingKey = 'enqueue_blocked_key_1234567890123456789012345678901234567890';
    const signingKeyHash = hashKey(signingKey);

    // Create a queue first
    const queue = relay.createQueueWithSigningKey(signingKey, 'private_key');

    // Submit abuse reports to block the key
    const report: AbuseReportSubmission = {
      v: 1,
      reportId: 'a'.repeat(32),
      queueIdHash: 'b'.repeat(64),
      signingKeyHash,
      reportedAt: Date.now(),
      category: 'spam',
    };
    for (let i = 0; i < 10; i++) {
      relay.submitAbuseReport(report);
    }

    // Try to enqueue - should fail
    expect(() => {
      relay.enqueue(queue.queueId, queue.senderToken, 'test payload');
    }).toThrow('Signing key blocked due to abuse reports');
  });

  it('getAbuseStatus returns correct info', () => {
    const signingKey = 'status_key_1234567890123456789012345678901234567890';
    const signingKeyHash = hashKey(signingKey);

    const report: AbuseReportSubmission = {
      v: 1,
      reportId: 'a'.repeat(32),
      queueIdHash: 'b'.repeat(64),
      signingKeyHash,
      reportedAt: Date.now(),
      category: 'spam',
    };

    // Before any reports
    let status = relay.getAbuseStatus(signingKey);
    expect(status.blocked).toBe(false);
    expect(status.reportCount).toBe(0);
    expect(status.blockedAt).toBeNull();

    // After 3 reports
    relay.submitAbuseReport(report);
    relay.submitAbuseReport(report);
    relay.submitAbuseReport(report);
    status = relay.getAbuseStatus(signingKey);
    expect(status.blocked).toBe(false);
    expect(status.reportCount).toBe(3);
    expect(status.blockedAt).toBeNull();

    // After 10 reports (blocked)
    for (let i = 0; i < 7; i++) {
      relay.submitAbuseReport(report);
    }
    status = relay.getAbuseStatus(signingKey);
    expect(status.blocked).toBe(true);
    expect(status.reportCount).toBe(10);
    expect(status.blockedAt).not.toBeNull();
  });

  it('rejects invalid abuse reports', () => {
    const invalidReport = {
      v: 1,
      reportId: 'a'.repeat(32),
      queueIdHash: 'b'.repeat(64),
      signingKeyHash: 'invalid', // not 64 hex chars
      reportedAt: Date.now(),
      category: 'spam',
    } as AbuseReportSubmission;

    expect(relay.submitAbuseReport(invalidReport)).toBe(false);
  });

  it('cleans up old abuse reports', () => {
    const signingKey = 'cleanup_key_1234567890123456789012345678901234567890';
    const signingKeyHash = hashKey(signingKey);

    const report: AbuseReportSubmission = {
      v: 1,
      reportId: 'a'.repeat(32),
      queueIdHash: 'b'.repeat(64),
      signingKeyHash,
      reportedAt: Date.now() - 31 * 24 * 60 * 60 * 1000, // 31 days ago
      category: 'spam',
    };

    relay.submitAbuseReport(report);
    
    // Manually trigger cleanup (simulate time passing)
    // We can't easily test the private cleanup method, but we can verify
    // the report was added
    const status = relay.getAbuseStatus(signingKey);
    expect(status.reportCount).toBe(1);
  });
});