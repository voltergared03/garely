import { redirect } from 'next/navigation';

/** The quizzes hub now lives as a tab inside the Tasks page. Keep this route as
 *  a redirect so existing links / bookmarks / the dashboard card keep working. */
export default function QuizzesPage() {
  redirect('/tasks?tab=quizzes');
}
