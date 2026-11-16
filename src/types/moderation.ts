export type ReportTargetType = 'post' | 'comment' | 'channel' | 'ad' | 'user';

export type ReportReasonId =
  | 'substances'
  | 'violence'
  | 'csam'
  | 'hate'
  | 'harassment'
  | 'spam'
  | 'scam'
  | 'privacy'
  | 'copyright'
  | 'selfharm'
  | 'impersonation'
  | 'illegal'
  | 'other';

export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  channelId?: string;
  title?: string;
  advertiserId?: string;
}

export type ReportStatus = 'received' | 'reviewing' | 'actioned' | 'dismissed';

export interface ModerationReport {
  id: string;
  target: ReportTarget;
  reason: ReportReasonId;
  details?: string;
  createdAt: number;
  status: ReportStatus;
  blockAdvertiser?: boolean;
}

export type SanctionLevel = 'S0' | 'S1' | 'S2' | 'S3' | 'S4';

export type SanctionAction =
  | 'warning'
  | 'content_removed'
  | 'throttle'
  | 'relay_block'
  | 'permanent_block';

export type SanctionStatus = 'active' | 'appealed' | 'lifted' | 'expired';

export interface SanctionRecord {
  id: string;
  caseId: string;
  level: SanctionLevel;
  ruleId: string;
  action: SanctionAction;
  reasonCode: string;
  reason: string;
  issuedAt: number;
  expiresAt: number | null;
  status: SanctionStatus;
}

export type AppealStatus = 'submitted' | 'reviewing' | 'accepted' | 'rejected';

export interface ModerationAppeal {
  id: string;
  sanctionId: string;
  text: string;
  createdAt: number;
  status: AppealStatus;
  decidedAt?: number;
  response?: string;
}
