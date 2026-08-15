import { useQuery } from '@tanstack/react-query';
import { getVobiOverview } from '@/api/vobi';

export function useVobiOverview(enabled = true) {
  return useQuery({
    queryKey: ['vobi-overview'],
    queryFn: getVobiOverview,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
