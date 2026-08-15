import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_OPEN = 'vobi-panel-open';
const STORAGE_WIDTH = 'vobi-panel-width';
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 320;
const MAX_WIDTH = 520;

export const VOBI_OPEN_EVENT = 'vobi:open';
export const VOBI_CLOSE_EVENT = 'vobi:close';
export const VOBI_TOGGLE_EVENT = 'vobi:toggle';

interface VobiContextValue {
  isOpen: boolean;
  panelWidth: number;
  commandDraft: string;
  open: (opts?: { command?: string }) => void;
  close: () => void;
  toggle: () => void;
  setPanelWidth: (w: number) => void;
  setCommandDraft: (cmd: string) => void;
}

const VobiContext = createContext<VobiContextValue | undefined>(undefined);

function readStoredOpen(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_OPEN) === 'true';
}

function readStoredWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH;
  const n = Number(localStorage.getItem(STORAGE_WIDTH));
  if (Number.isFinite(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
  return DEFAULT_WIDTH;
}

export function VobiProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(readStoredOpen);
  const [panelWidth, setPanelWidthState] = useState(readStoredWidth);
  const [commandDraft, setCommandDraft] = useState('');

  const persistOpen = useCallback((open: boolean) => {
    setIsOpen(open);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_OPEN, String(open));
    }
  }, []);

  const open = useCallback(
    (opts?: { command?: string }) => {
      persistOpen(true);
      if (opts?.command) setCommandDraft(opts.command);
    },
    [persistOpen]
  );

  const close = useCallback(() => {
    persistOpen(false);
  }, [persistOpen]);

  const toggle = useCallback(() => {
    persistOpen(!isOpen);
  }, [isOpen, persistOpen]);

  const setPanelWidth = useCallback((w: number) => {
    const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));
    setPanelWidthState(clamped);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_WIDTH, String(clamped));
    }
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ command?: string }>).detail;
      open(detail);
    };
    const onClose = () => close();
    const onToggle = () => toggle();

    window.addEventListener(VOBI_OPEN_EVENT, onOpen as EventListener);
    window.addEventListener(VOBI_CLOSE_EVENT, onClose);
    window.addEventListener(VOBI_TOGGLE_EVENT, onToggle);
    return () => {
      window.removeEventListener(VOBI_OPEN_EVENT, onOpen as EventListener);
      window.removeEventListener(VOBI_CLOSE_EVENT, onClose);
      window.removeEventListener(VOBI_TOGGLE_EVENT, onToggle);
    };
  }, [open, close, toggle]);

  const value = useMemo(
    () => ({
      isOpen,
      panelWidth,
      commandDraft,
      open,
      close,
      toggle,
      setPanelWidth,
      setCommandDraft,
    }),
    [isOpen, panelWidth, commandDraft, open, close, toggle, setPanelWidth]
  );

  return (
    <VobiContext.Provider value={value}>{children}</VobiContext.Provider>
  );
}

export function useVobi() {
  const ctx = useContext(VobiContext);
  if (!ctx) throw new Error('useVobi must be used within VobiProvider');
  return ctx;
}

export function dispatchVobiOpen(command?: string) {
  window.dispatchEvent(
    new CustomEvent(VOBI_OPEN_EVENT, { detail: command ? { command } : undefined })
  );
}
