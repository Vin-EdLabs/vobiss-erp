import { useQuery } from '@tanstack/react-query';
import { getVobiSummary, type VobiSummaryResponse } from '@/api/vobi';

export function useVobiSummary(
  period: 'since_login' | 'today' | 'week',
  enabled = true
) {
  return useQuery<VobiSummaryResponse>({
    queryKey: ['vobi-summary', period],
    queryFn: () => getVobiSummary(period),
    enabled,
    staleTime: 45_000,
  });
}
