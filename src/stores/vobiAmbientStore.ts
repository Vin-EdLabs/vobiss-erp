import { create } from 'zustand';
import type { VobiErrorContext } from '@/lib/vobiErrorMessages';

export type VobiAmbientMode = 'idle' | 'error' | 'hint' | 'guide' | 'exact';

export type VobiPageAlert = {
  label: string;
  text: string;
  severity: 'warn' | 'error';
};

export type VobiFieldIssue = {
  field: string;
  label?: string;
  message: string;
};

export type VobiFormState = {
  formKey: string;
  missingFields: string[];
  invalidFields: VobiFieldIssue[];
};

export type VobiExactIssue = {
  title?: string;
  body?: string;
  formKey?: string;
  fieldErrors: VobiFieldIssue[];
  action?: string;
};

export type VobiSection = {
  id: string;
  title: string;
  help: string;
  priority?: number;
};

type VobiAmbientState = {
  mode: VobiAmbientMode;
  isOpen: boolean;
  errorContext: VobiErrorContext | null;
  exactIssue: VobiExactIssue | null;
  formState: VobiFormState | null;
  sections: Record<string, VobiSection>;
  formKey: string | null;
  pageRoute: string | null;
  pageAlerts: VobiPageAlert[];
  bottomBarLabel: string;
  setError: (ctx: VobiErrorContext) => void;
  setExactIssue: (issue: VobiExactIssue) => void;
  setFormState: (state: VobiFormState | null, options?: { showIssues?: boolean }) => void;
  registerSection: (section: VobiSection) => void;
  unregisterSection: (id: string) => void;
  setFormHint: (key: string) => void;
  setPageGuide: (route: string) => void;
  setPageAlerts: (alerts: VobiPageAlert[]) => void;
  open: () => void;
  close: () => void;
  dismissHint: () => void;
  dismissGuide: (scope?: 'page' | 'all') => void;
  clear: () => void;
};

let errorTimer: ReturnType<typeof setTimeout> | null = null;
let errorDismissTimer: ReturnType<typeof setTimeout> | null = null;

const HINT_DISMISSED_KEY = 'vobi_hint_dismissed';
const GUIDE_DISMISSED_KEY = 'vobi_guide_dismissed';
const GUIDE_DISABLED_KEY = 'vobi_guides_disabled';
const RECENT_ERRORS_KEY = 'vobi_recent_errors';

function getDismissedHints(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HINT_DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDismissedHint(key: string) {
  if (typeof window === 'undefined') return;
  const next = Array.from(new Set([...getDismissedHints(), key]));
  window.localStorage.setItem(HINT_DISMISSED_KEY, JSON.stringify(next));
}

function normalizeRoute(route: string | null) {
  return route || '/';
}

function areGuidesDisabled() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(GUIDE_DISABLED_KEY) === '1';
}

function getDismissedGuides(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(GUIDE_DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDismissedGuide(route: string | null) {
  if (typeof window === 'undefined') return;
  const next = Array.from(new Set([...getDismissedGuides(), normalizeRoute(route)]));
  window.localStorage.setItem(GUIDE_DISMISSED_KEY, JSON.stringify(next));
}

function disableGuides() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(GUIDE_DISABLED_KEY, '1');
}

function clearTimers() {
  if (errorTimer) clearTimeout(errorTimer);
  if (errorDismissTimer) clearTimeout(errorDismissTimer);
  errorTimer = null;
  errorDismissTimer = null;
}

function pageGuideState(route: string | null) {
  return {
    mode: 'idle' as const,
    isOpen: false,
    errorContext: null,
    exactIssue: null,
    formKey: null,
    pageAlerts: [],
    bottomBarLabel: '',
    pageRoute: route,
  };
}

function rememberRecentError(issue: VobiExactIssue | VobiErrorContext) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(RECENT_ERRORS_KEY);
    const current = raw ? JSON.parse(raw) : [];
    const entry = {
      at: Date.now(),
      message: 'rawMessage' in issue ? issue.rawMessage : issue.body || issue.title,
      fields: 'fieldErrors' in issue ? issue.fieldErrors?.map((f: any) => f.field) : [],
    };
    window.localStorage.setItem(RECENT_ERRORS_KEY, JSON.stringify([entry, ...(Array.isArray(current) ? current : [])].slice(0, 10)));
  } catch {
    // Memory is helpful only; never block the UI.
  }
}

function scheduleIssueDismiss(set: any) {
  errorDismissTimer = setTimeout(() => {
    set((state: VobiAmbientState) => (
      state.mode === 'error' || state.mode === 'exact'
        ? pageGuideState(state.pageRoute)
        : {}
    ));
  }, 10000);
}

export const useVobiAmbientStore = create<VobiAmbientState>((set, get) => ({
  mode: 'idle',
  isOpen: false,
  errorContext: null,
  exactIssue: null,
  formState: null,
  sections: {},
  formKey: null,
  pageRoute: null,
  pageAlerts: [],
  bottomBarLabel: '',

  setError: (ctx) => {
    clearTimers();
    rememberRecentError(ctx);
    const count = ctx.fieldErrors?.length || 1;
    set({
      mode: 'error',
      isOpen: true,
      errorContext: ctx,
      exactIssue: null,
      pageRoute: ctx.pageContext?.startsWith('/') ? ctx.pageContext : get().pageRoute,
      bottomBarLabel: `Vobi noticed ${count} error${count === 1 ? '' : 's'} - tap to fix`,
    });
    scheduleIssueDismiss(set);
  },

  setExactIssue: (issue) => {
    clearTimers();
    rememberRecentError(issue);
    const count = issue.fieldErrors.length || 1;
    set({
      mode: 'exact',
      isOpen: true,
      exactIssue: issue,
      errorContext: null,
      formKey: issue.formKey || get().formKey,
      bottomBarLabel: `${count} exact issue${count === 1 ? '' : 's'} need fixing`,
    });
    scheduleIssueDismiss(set);
  },

  setFormState: (formState, options) => {
    set({ formState });
    if (!formState) return;

    const fieldErrors = [
      ...formState.missingFields.map((field) => ({
        field,
        label: field,
        message: `${field} is required before submitting.`,
      })),
      ...formState.invalidFields,
    ];

    if (options?.showIssues && fieldErrors.length > 0) {
      get().setExactIssue({
        title: `${fieldErrors.length} thing${fieldErrors.length === 1 ? '' : 's'} need fixing`,
        body: `Vobi checked ${formState.formKey} and found exact fields that need attention.`,
        formKey: formState.formKey,
        fieldErrors,
        action: 'Show me',
      });
    }
  },

  registerSection: (section) => {
    set((state) => ({
      sections: {
        ...state.sections,
        [section.id]: section,
      },
    }));
  },

  unregisterSection: (id) => {
    set((state) => {
      const next = { ...state.sections };
      delete next[id];
      return { sections: next };
    });
  },

  setFormHint: (key) => {
    // Remember form key silently — no guideline popups; users open Vobi when they want help.
    set({ formKey: key || null });
  },

  setPageGuide: (route) => {
    // Keep route for Vobi page context — do not show hardcoded guide popups.
    const state = get();
    if (state.mode === 'error' || state.mode === 'exact' || state.mode === 'hint') {
      set({ pageRoute: route });
      return;
    }
    set({
      mode: 'idle',
      isOpen: false,
      errorContext: null,
      exactIssue: null,
      formKey: null,
      pageRoute: route,
      pageAlerts: [],
      bottomBarLabel: '',
    });
  },

  setPageAlerts: (alerts) => {
    set({ pageAlerts: alerts });
  },

  open: () => set((state) => (state.mode === 'idle' ? {} : { isOpen: true })),
  close: () => {
    const state = get();
    if (state.mode === 'error') {
      clearTimers();
      set(pageGuideState(state.pageRoute));
      return;
    }
    if (state.mode === 'exact') {
      clearTimers();
      set(pageGuideState(state.pageRoute));
      return;
    }
    if (state.mode === 'guide' && state.isOpen) {
      saveDismissedGuide(state.pageRoute);
      set({ isOpen: false, mode: 'idle', bottomBarLabel: '' });
      return;
    }
    set({ isOpen: false });
  },
  dismissHint: () => {
    const key = get().formKey;
    if (key) saveDismissedHint(key);
    set({ isOpen: false, mode: 'idle', formKey: null, bottomBarLabel: '' });
  },
  dismissGuide: (scope = 'page') => {
    const route = get().pageRoute;
    if (scope === 'all') {
      disableGuides();
    } else {
      saveDismissedGuide(route);
    }
    set({ isOpen: false, mode: 'idle', bottomBarLabel: '' });
  },
  clear: () => {
    clearTimers();
    set({
      mode: 'idle',
      isOpen: false,
      errorContext: null,
      exactIssue: null,
      formState: null,
      sections: {},
      formKey: null,
      pageRoute: null,
      pageAlerts: [],
      bottomBarLabel: '',
    });
  },
}));

export const vobiAmbientStore = useVobiAmbientStore;
