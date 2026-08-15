import { VobiLauncher } from './VobiLauncher';
import { VobiPanel } from './VobiPanel';
import { VobiAmbient } from './VobiAmbient';
import { useLocation } from 'react-router-dom';

interface VobiRootProps {
  theme: 'light' | 'dark';
}

export function VobiRoot({ theme }: VobiRootProps) {
  const location = useLocation();

  if (location.pathname === '/chat') {
    return null;
  }

  return (
    <>
      <VobiAmbient />
      <VobiLauncher theme={theme} />
      <VobiPanel theme={theme} />
    </>
  );
}
