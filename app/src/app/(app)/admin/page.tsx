import { redirect } from 'next/navigation';

// Legacy admin page — superseded by /settings (admin tabs live there).
export default function AdminPage() {
  redirect('/settings');
}
