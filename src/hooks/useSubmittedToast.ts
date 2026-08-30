import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

export function useSubmittedToast() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const state = location.state as { submitted?: boolean } | null;
    if (!state?.submitted) return;
    toast({ title: 'Request submitted successfully' });
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate, toast]);
}
