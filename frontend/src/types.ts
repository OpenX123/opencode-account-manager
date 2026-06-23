// ============================================================
// Frontend Type Definitions
// ============================================================

export interface AccountSummary {
  id: string;
  alias: string;
  email: string;
  username: string;
  avatarUrl: string;
  lastVerifiedAt: number;
  createdAt: number;
  note: string;
  invitedBy: string | null;
  hasCookies: boolean;
}

export interface InviteLinkResult {
  accountId: string;
  alias: string;
  inviteLink: string;
}

export interface RegistrationStatus {
  id: string;
  inviteLink: string;
  invitedBy: string | null;
  status: "monitoring" | "completed" | "failed" | "timeout";
  email: string;
  password: string;
  newAccountId: string | null;
  newAccountAlias: string | null;
  error: string | null;
  startedAt: number;
  completedAt: number | null;
}
