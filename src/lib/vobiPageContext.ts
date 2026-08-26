import { getVobiPageGuide, type VobiPageGuide } from './vobiPageGuides';

export type VobiLiveUiSnapshot = {
  title?: string;
  headings: string[];
  buttons: string[];
  fields: string[];
};

export type VobiPageContextPayload = {
  pathname: string;
  pageGuide: {
    pageName: string;
    actions: Array<{ label: string; hint: string; urgent?: boolean }>;
  } | null;
  liveUi: VobiLiveUiSnapshot;
};

function clean(text?: string | null) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isVisible(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== 'hidden' &&
    style.display !== 'none' &&
    !el.closest('.vobi-panel') &&
    !el.closest('.vobi-launcher') &&
    !el.closest('.vobi-ambient-popup')
  );
}

/** Capture what is on screen so Vobi can explain the exact page the user sees. */
export function captureLiveUiSnapshot(): VobiLiveUiSnapshot {
  if (typeof document === 'undefined') {
    return { headings: [], buttons: [], fields: [] };
  }

  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .filter((el) => isVisible(el as HTMLElement))
    .map((el) => clean(el.textContent))
    .filter((t) => t.length > 1 && t.length < 120)
    .slice(0, 10);

  const buttons = Array.from(
    document.querySelectorAll('button, a[role="button"], [data-vobi-action]')
  )
    .filter((el) => isVisible(el as HTMLElement))
    .map((el) => clean(el.textContent) || clean((el as HTMLElement).getAttribute('aria-label')))
    .filter((t) => t.length > 1 && t.length < 60)
    .filter((t) => !/^(×|x|close|menu)$/i.test(t))
    .slice(0, 16);

  const fields = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input, textarea, select'
    )
  )
    .filter((el) => {
      const type = String(el.type || '').toLowerCase();
      return !['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio', 'file'].includes(type);
    })
    .filter((el) => isVisible(el))
    .map((el) => {
      const id = el.id;
      const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      return (
        clean(label?.textContent) ||
        clean(el.getAttribute('aria-label')) ||
        clean(el.getAttribute('placeholder')) ||
        clean(el.name)
      );
    })
    .filter(Boolean)
    .slice(0, 16);

  return {
    title: clean(document.title),
    headings: Array.from(new Set(headings)),
    buttons: Array.from(new Set(buttons)),
    fields: Array.from(new Set(fields)),
  };
}

export function buildVobiPageContext(pathname: string): VobiPageContextPayload {
  const path = String(pathname || '/').split('?')[0] || '/';
  const guide = getVobiPageGuide(path);
  return {
    pathname: path,
    pageGuide: guide
      ? {
          pageName: guide.pageName,
          actions: (guide.actions || []).map((a) => ({
            label: a.label,
            hint: a.hint,
            urgent: a.urgent,
          })),
        }
      : null,
    liveUi: captureLiveUiSnapshot(),
  };
}

export function pageBriefingUserText(guide: VobiPageGuide | null, pathname: string) {
  const name = guide?.pageName || 'this page';
  return `I'm on ${name} (${pathname}). Explain how this page works and how I should use it step by step. Cover the main actions, what to watch out for, and the best next step. Be practical — I should not need to ask a colleague.`;
}
