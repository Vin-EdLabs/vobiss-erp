import { useEffect } from 'react';
import { vobiAmbientStore, type VobiSection } from '@/stores/vobiAmbientStore';

export function useVobiSection(section: VobiSection | null | undefined, enabled = true) {
  useEffect(() => {
    if (!enabled || !section?.id) return;
    vobiAmbientStore.getState().registerSection(section);
    return () => vobiAmbientStore.getState().unregisterSection(section.id);
  }, [enabled, section?.help, section?.id, section?.priority, section?.title]);
}
