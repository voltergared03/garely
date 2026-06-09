// Shared types for the Servers / Remote Access section (§15).

/** Someone currently connected to a server (live, fresh heartbeat). */
export interface ActiveServerSession {
  userId: string;
  name: string | null;
  startedAt: string; // ISO
  isSelf: boolean; // true when it's the current user's own session
}

export interface ServerView {
  id: string;
  name: string;
  // host/port/username/domain/settings are present ONLY for admins — the member-safe
  // view (non-admin grantees) omits them so they can't see the server's address/login.
  host?: string;
  port?: number;
  protocol: string;
  username?: string;
  domain?: string | null;
  settings?: unknown;
  departmentId: string | null;
  hasSecret: boolean;
  createdAt: string;
  updatedAt: string;
  accessCount?: number; // present only in the admin list
  activeSessions?: ActiveServerSession[]; // who's currently using this server (live presence)
}

export interface OrgMember {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export interface DeptLite {
  id: string;
  name: string;
  color: string | null;
}

export interface Grant {
  id: string;
  kind: 'user' | 'department';
  user: { id: string; name: string | null; email: string | null; image: string | null } | null;
  department: { id: string; name: string; color: string | null } | null;
  createdAt: string;
}
