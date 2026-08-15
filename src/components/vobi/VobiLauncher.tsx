import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useVobi } from '@/context/VobiContext';
import { useVobiOverview } from '@/hooks/useVobiOverview';
import { useVobiAmbientStore } from '@/stores/vobiAmbientStore';

interface VobiLauncherProps {
  theme: 'light' | 'dark';
}

export function VobiLauncher({ theme: _theme }: VobiLauncherProps) {
  const { isOpen, toggle } = useVobi();
  const ambientMode = useVobiAmbientStore((state) => state.mode);
  const ambientOpen = useVobiAmbientStore((state) => state.isOpen);
  const openAmbient = useVobiAmbientStore((state) => state.open);
  const { data } = useVobiOverview(true);
  const hasPending = (data?.pendingCount ?? 0) > 0;
  const hasAmbientNotice = ambientMode !== 'idle';
  const hasAmbientError = ambientMode === 'error';

  const handleClick = () => {
    if (hasAmbientNotice && !ambientOpen && !isOpen) {
      openAmbient();
      return;
    }
    toggle();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, toggle]);

  return (
    <button
      type="button"
      aria-label="Open Vobi"
      aria-expanded={isOpen}
      onClick={handleClick}
      className={cn(
        'vobi-launcher fixed z-[9999] flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full',
        'bottom-[max(20px,env(safe-area-inset-bottom))] right-[max(20px,env(safe-area-inset-right))]',
        'bg-[#111827]',
        'transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DCAA5]/70',
        (hasPending || hasAmbientNotice) && !isOpen && 'vobi-attention-ring'
      )}
    >
      <style>{`
        @keyframes vobiGuideSpin {
          0% { transform: rotate(0deg) scale(1); }
          45% { transform: rotate(180deg) scale(1.06); }
          100% { transform: rotate(360deg) scale(1); }
        }
        .vobi-guide-spin {
          animation: vobiGuideSpin 1.15s cubic-bezier(0.4, 0, 0.2, 1) 2;
        }
      `}</style>
      {(hasPending || hasAmbientNotice) && !isOpen && <span className="vobi-logo-halo absolute inset-1 rounded-full" aria-hidden />}
      {(hasPending || hasAmbientNotice) && !isOpen && !ambientOpen && (
        <span
          className={cn(
            'vobi-pulse-dot absolute right-1 top-1 h-[9px] w-[9px] rounded-full',
            hasAmbientError ? 'bg-red-400' : 'bg-[#5DCAA5]'
          )}
          aria-hidden
        />
      )}
      <img
        src="/vobi-logo.png"
        alt=""
        className={cn(
          'h-[82px] w-[82px] max-w-none object-cover object-left',
          (hasPending || hasAmbientNotice) && !isOpen && 'vobi-logo-attention',
          hasAmbientNotice && !ambientOpen && !isOpen && 'vobi-guide-spin'
        )}
        draggable={false}
      />
    </button>
  );
}
