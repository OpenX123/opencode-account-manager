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

export interface Sub2ApiSettings {
  groupId: number;
  groupName: string;
  platform: string;
  baseUrl: string;
  defaultConcurrency: number;
  defaultPriority: number;
  sshHost: string;
  sshPort: string;
  sshUser: string;
  sshKey: string;
  dockerContainer: string;
  dbUser: string;
  dbName: string;
}

export interface AppSettings {
  sub2api: Sub2ApiSettings;
}
