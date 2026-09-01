import { useParams } from 'react-router-dom';
import ProductionDetail from './ProductionDetail';
import ProductionHub from './ProductionHub';

/**
 * `/project-request/:unitSlug` is shared by two very different pages that happen to have the
 * same URL shape: a unit hub listing (design/sales/ts/ip/noc/project — always non-numeric) and
 * the unified Service Request profile (`/project-request/:id`, from the 360° Service Request
 * Flow — always numeric). React Router can't disambiguate two routes with an identical dynamic
 * segment, so this wrapper does it directly: numeric param -> profile, else -> hub.
 */
export default function ProjectRequestSingleSegmentRoute() {
  const { unitSlug } = useParams<{ unitSlug: string }>();
  if (/^\d+$/.test(unitSlug || '')) {
    return <ProductionDetail id={unitSlug} unitSlug={undefined} />;
  }
  return <ProductionHub />;
}
