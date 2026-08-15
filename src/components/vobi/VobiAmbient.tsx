import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getVobiErrorMessage } from '@/lib/vobiErrorMessages';
import { getVobiFormHint } from '@/lib/vobiFormHints';
import { getVobiPageGuide, type VobiPageAction } from '@/lib/vobiPageGuides';
import { filterVisibleItems, getUserGuideRoles } from '@/lib/vobiUserGuide';
import { cn } from '@/lib/utils';
import { useVobiAmbientStore } from '@/stores/vobiAmbientStore';
import { focusField } from '@/lib/vobiFocusField';

type DetectedFormField = {
  name: string;
  hint: string;
};

const fieldHint = (label: string) => {
  const text = label.toLowerCase();
  if (text.includes('amount') || text.includes('price') || text.includes('cost') || text.includes('mrc') || text.includes('nrc')) {
    return 'Enter numbers only. This is used for cost, payment, or report calculations.';
  }
  if (text.includes('quantity') || text === 'qty') {
    return 'Enter a whole number for how many items are needed, issued, or returned.';
  }
  if (text.includes('date')) {
    return 'Select the correct date. For requests, use today or a future date when required.';
  }
  if (text.includes('approver') || text.includes('assignee') || text.includes('assign')) {
    return 'Choose the staff member responsible for the next approval or action.';
  }
  if (text.includes('reason') || text.includes('purpose')) {
    return 'Explain why this is needed. Clear reasons help managers approve faster.';
  }
  if (text.includes('description') || text.includes('remarks') || text.includes('comment')) {
    return 'Add useful details so the next person understands the work without calling for context.';
  }
  if (text.includes('customer') || text.includes('project') || text.includes('site')) {
    return 'Use the correct customer, project, or site name so the record can be traced later.';
  }
  if (text.includes('priority') || text.includes('status')) {
    return 'Pick the correct workflow state so the right team knows how urgent this is.';
  }
  return 'Fill this with the exact information requested by the field label.';
};

const cleanText = (value?: string | null) => String(value || '').replace(/\s+/g, ' ').trim();

const isElementVisible = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
};

const fieldLabelFor = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
  const id = el.id;
  const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
  const nearbyLabel = el.closest('label');
  const wrapperLabel = el.closest('[data-field], .form-group, .space-y-1, .space-y-2, .mb-4')?.querySelector('label');
  return cleanText(
    label?.textContent ||
    nearbyLabel?.textContent ||
    wrapperLabel?.textContent ||
    el.getAttribute('aria-label') ||
    el.getAttribute('placeholder') ||
    el.name
  );
};

function scanVisibleFormFields(): DetectedFormField[] {
  if (typeof window === 'undefined') return [];
  const fields = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')
  )
    .filter((el) => {
      const type = 'type' in el ? String(el.type || '').toLowerCase() : '';
      return !['hidden', 'submit', 'button', 'reset', 'file', 'checkbox', 'radio'].includes(type);
    })
    .filter((el) => !el.disabled && !el.closest('.vobi-ambient-popup') && !el.closest('.vobi-launcher'))
    .filter((el) => isElementVisible(el))
    .map((el) => fieldLabelFor(el))
    .filter(Boolean);

  return Array.from(new Set(fields))
    .slice(0, 5)
    .map((name) => ({ name, hint: fieldHint(name) }));
}

function playSoftErrorTone() {
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;

    const ctx = new AudioContextCtor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(520, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(390, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.22);
    window.setTimeout(() => ctx.close().catch(() => undefined), 300);
  } catch {
    // Sound is optional and may be blocked by browser autoplay rules.
  }
}

export function VobiAmbient() {
  const location = useLocation();
  const { user } = useAuth();
  const soundedErrorRef = useRef<string | null>(null);
  const [detectedFormFields, setDetectedFormFields] = useState<DetectedFormField[]>([]);
  const {
    mode,
    isOpen,
    errorContext,
    exactIssue,
    sections,
    formKey,
    pageRoute,
    pageAlerts,
    bottomBarLabel,
    setError,
    setPageGuide,
    open,
    close,
    dismissHint,
    dismissGuide,
  } = useVobiAmbientStore();

  const userRoles = useMemo(() => getUserGuideRoles(user), [user]);

  useEffect(() => {
    setPageGuide(location.pathname);
  }, [location.pathname, setPageGuide]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest('.vobi-ambient-popup') ||
        target.closest('.vobi-launcher') ||
        target.closest('.vobi-ambient-trigger')
      ) {
        return;
      }
      close();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [close, isOpen]);

  useEffect(() => {
    const scan = () => setDetectedFormFields(scanVisibleFormFields());
    scan();

    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'open', 'aria-hidden'] });
    window.addEventListener('focusin', scan);
    window.addEventListener('click', scan);
    window.addEventListener('resize', scan);

    return () => {
      observer.disconnect();
      window.removeEventListener('focusin', scan);
      window.removeEventListener('click', scan);
      window.removeEventListener('resize', scan);
    };
  }, [location.pathname]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      setError({
        errorCode: 'SERVER_ERROR',
        pageContext: location.pathname,
        rawMessage: event.message,
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const rawMessage = reason instanceof Error ? reason.message : String(reason || 'Unexpected error');
      setError({
        errorCode: rawMessage.toLowerCase().includes('network') ? 'NETWORK_ERROR' : 'SERVER_ERROR',
        pageContext: location.pathname,
        rawMessage,
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [location.pathname, setError]);

  useEffect(() => {
    if ((mode !== 'error' && mode !== 'exact') || !isOpen) return;
    const key = mode === 'exact'
      ? `exact-${exactIssue?.title || ''}-${exactIssue?.fieldErrors?.map((f) => f.field).join(',') || ''}`
      : `${errorContext?.errorCode}-${errorContext?.rawMessage || ''}-${errorContext?.pageContext}`;
    if (soundedErrorRef.current === key) return;
    soundedErrorRef.current = key;
    playSoftErrorTone();
  }, [errorContext, exactIssue, isOpen, mode]);

  const content = useMemo(() => {
    if (mode === 'exact' && exactIssue?.fieldErrors?.length) {
      return { type: 'exact' as const, issue: exactIssue };
    }

    if (mode === 'error') {
      const message = getVobiErrorMessage(errorContext);
      return { type: 'error' as const, message };
    }

    if (mode === 'hint') {
      const hint = getVobiFormHint(formKey);
      if (!hint) return null;
      if (!filterVisibleItems([{ visibleTo: hint.visibleTo }], userRoles).length) return null;
      const fields = filterVisibleItems(hint.fields, userRoles);
      if (!fields.length) return null;
      return { type: 'hint' as const, hint, fields };
    }

    if (mode === 'guide') {
      const guide = getVobiPageGuide(pageRoute);
      if (!guide) return null;
      const actions = filterVisibleItems(guide.actions, userRoles);
      const sectionActions: VobiPageAction[] = Object.values(sections)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
        .map((section) => ({
          label: section.title,
          hint: section.help,
          visibleTo: ['*'],
        }));
      const alertActions: VobiPageAction[] = pageAlerts.map((alert) => ({
        label: alert.label,
        hint: alert.text,
        urgent: alert.severity === 'error',
        visibleTo: ['*'],
      }));
      const formActions: VobiPageAction[] = detectedFormFields.length
        ? [
            {
              label: 'Open form detected',
              hint: 'Vobi can read the visible form fields on this page. Use the field notes below before submitting.',
              visibleTo: ['*'],
            },
            ...detectedFormFields.map((field) => ({
              label: field.name,
              hint: field.hint,
              visibleTo: ['*'],
            })),
          ]
        : [];
      const allActions = [...alertActions, ...sectionActions, ...formActions, ...actions];
      if (!allActions.length) return null;
      return { type: 'guide' as const, guide, actions: allActions };
    }

    return null;
  }, [detectedFormFields, errorContext, exactIssue, formKey, mode, pageAlerts, pageRoute, sections, userRoles]);

  if (!content || mode === 'idle') return null;

  const isError = content.type === 'error' || content.type === 'exact';
  return (
    <div className={cn(
      'pointer-events-none fixed bottom-[84px] right-5 z-[9998] max-w-[calc(100vw-40px)] flex-col items-end',
      isError ? 'flex' : 'hidden md:flex'
    )}>
      <style>{`
        .vobi-field-focus-glow {
          outline: 3px solid rgba(239, 68, 68, 0.75) !important;
          box-shadow: 0 0 0 8px rgba(239, 68, 68, 0.18), 0 0 24px rgba(93, 202, 165, 0.45) !important;
          transition: box-shadow 180ms ease, outline 180ms ease;
        }
        @keyframes vobiAmbientIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes vobiAmbientDotPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.65); }
          50% { transform: scale(1.18); box-shadow: 0 0 0 7px rgba(248, 113, 113, 0); }
        }
        .vobi-ambient-popup {
          animation: vobiAmbientIn 220ms cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}</style>

      {isOpen && (
        <div className="vobi-ambient-popup pointer-events-auto mb-3 w-[320px] overflow-hidden rounded-2xl border border-[#5DCAA5]/25 bg-[radial-gradient(circle_at_top_right,rgba(93,202,165,0.26),transparent_34%),linear-gradient(145deg,#07111f_0%,#111827_48%,#172033_100%)] text-white shadow-2xl shadow-slate-950/45 ring-1 ring-white/10 backdrop-blur-xl">
          <div className={cn('h-1 w-full', isError ? 'bg-red-500' : 'bg-[#5DCAA5]')} />
          <div className="relative p-4">
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#5DCAA5]/10 blur-2xl" aria-hidden />
            <button
              type="button"
              aria-label="Close Vobi help"
              onClick={close}
              className="absolute right-3 top-3 rounded-full p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            {content.type === 'error' && (
              <div className="space-y-3 pr-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 rounded-full bg-red-500/15 p-1.5 text-red-300">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-red-200">{content.message.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-300">{content.message.body}</p>
                  </div>
                </div>
                <ol className="space-y-2">
                  {content.message.steps.map((step, index) => (
                    <li key={`${step}-${index}`} className="flex gap-2 text-xs leading-5 text-white">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#5DCAA5]/60 text-[10px] font-bold text-[#5DCAA5]">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  onClick={close}
                  className="w-full rounded-xl border border-[#5DCAA5]/70 px-3 py-2 text-xs font-semibold text-[#9FE7CF] transition hover:bg-[#5DCAA5]/10"
                >
                  {content.message.action || 'Got it - fix the form'}
                </button>
              </div>
            )}

            {content.type === 'exact' && (
              <div className="space-y-3 pr-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 rounded-full bg-red-500/15 p-1.5 text-red-300">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-red-200">
                      {content.issue.title || `${content.issue.fieldErrors.length} thing${content.issue.fieldErrors.length === 1 ? '' : 's'} need fixing`}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-slate-300">
                      {content.issue.body || 'Vobi found exact fields on this screen that need attention.'}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {content.issue.fieldErrors.slice(0, 5).map((field) => (
                    <div key={`${field.field}-${field.message}`} className="rounded-xl border border-red-400/20 bg-red-500/10 p-2">
                      <p className="text-xs font-semibold text-red-100">● {field.label || field.field}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-200">{field.message}</p>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => focusField(content.issue.fieldErrors[0]?.field || content.issue.fieldErrors[0]?.label || '')}
                  className="w-full rounded-xl border border-[#5DCAA5]/70 px-3 py-2 text-xs font-semibold text-[#9FE7CF] transition hover:bg-[#5DCAA5]/10"
                >
                  {content.issue.action || 'Show me'}
                </button>
              </div>
            )}

            {content.type === 'hint' && (
              <div className="space-y-3 pr-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5DCAA5]">{content.hint.formName}</p>
                  <h3 className="mt-1 text-sm font-semibold">Here's what each field needs</h3>
                </div>
                <div className="space-y-2.5">
                  {content.fields.map((field) => (
                    <div key={field.name} className="flex gap-2 text-xs leading-5">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#5DCAA5]" />
                      <p className="text-slate-300">
                        <span className="font-semibold text-white">{field.name}: </span>
                        {field.hint}
                      </p>
                    </div>
                  ))}
                </div>
                {content.hint.warning && (
                  <p className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-2 text-xs leading-5 text-amber-100">
                    {content.hint.warning}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-xl bg-[#5DCAA5] px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-[#7FE0BF]"
                  >
                    Thanks, got it
                  </button>
                  <button
                    type="button"
                    onClick={dismissHint}
                    className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
                  >
                    Don't show again
                  </button>
                </div>
              </div>
            )}

            {content.type === 'guide' && (
              <div className="space-y-3 pr-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5DCAA5]">
                    {content.guide.pageName} page
                  </p>
                  <h3 className="mt-1 text-sm font-semibold">Here's what you can do and how:</h3>
                </div>
                <div className="space-y-2.5">
                  {content.actions.map((action, index) => (
                    <div key={`${action.label}-${index}`} className="flex gap-2 text-xs leading-5">
                      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', action.urgent ? 'bg-red-400' : 'bg-[#5DCAA5]')} />
                      <p className={action.urgent ? 'text-red-100' : 'text-slate-300'}>
                        <span className={cn('font-semibold', action.urgent ? 'text-red-200' : 'text-white')}>
                          {action.label}: 
                        </span>
                        {action.hint}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => dismissGuide('page')}
                    className="rounded-xl bg-[#5DCAA5] px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-[#7FE0BF]"
                  >
                    Got it
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissGuide('all')}
                    className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
                  >
                    Don't show page guides
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="pointer-events-auto hidden items-center justify-end pr-[64px] md:flex">
        <button
          type="button"
          onClick={() => (isOpen ? close() : open())}
          className={cn(
            'vobi-ambient-trigger',
            'max-w-[310px] truncate rounded-full border px-3 py-1.5 text-right text-xs font-semibold shadow-xl backdrop-blur-md transition-opacity duration-200',
            'hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DCAA5]/50',
            isError
              ? 'border-red-200 bg-red-50/95 text-red-700 shadow-red-900/15'
              : 'border-slate-200 bg-white/95 text-slate-700 shadow-slate-900/15'
          )}
        >
          {bottomBarLabel}
        </button>
      </div>
    </div>
  );
}
