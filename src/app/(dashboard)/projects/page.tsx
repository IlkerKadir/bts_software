import { getSession } from '@/lib/session';
import { ProjectList } from './ProjectList';

export default async function ProjectsPage() {
  const user = await getSession();

  if (!user) return null;

  return (
    <ProjectList canDelete={user.role.canDelete} />
  );
}
