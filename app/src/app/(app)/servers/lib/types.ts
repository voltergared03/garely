// Shared types for the Servers / Remote Access section (§15).

export interface ServerView {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  username: string;
  domain: string | null;
  settings: unknown;
  departmentId: string | null;
  hasSecret: boolean;
  createdAt: string;
  updatedAt: string;
  accessCount?: number; // present only in the admin list
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
