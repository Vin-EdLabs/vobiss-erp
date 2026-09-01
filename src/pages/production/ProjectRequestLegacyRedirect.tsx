import { Navigate, useParams } from 'react-router-dom';

/** Old per-unit URL (/project-request/:unitSlug/:id) -> new unified profile (/project-request/:id).
 *  Keeps existing bookmarks and notification links working after the 360° Service Request Flow. */
export default function ProjectRequestLegacyRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/project-request/${id}`} replace />;
}
