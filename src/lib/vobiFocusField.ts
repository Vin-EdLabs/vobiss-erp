const normalize = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ');

function labelTextFor(el: HTMLElement) {
  const id = el.getAttribute('id');
  const direct = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
  const wrapping = el.closest('label');
  const nearby = el.closest('[data-field], .form-group, .space-y-1, .space-y-2, .mb-4')?.querySelector('label');
  return normalize(
    direct?.textContent ||
    wrapping?.textContent ||
    nearby?.textContent ||
    el.getAttribute('aria-label') ||
    el.getAttribute('placeholder') ||
    el.getAttribute('name') ||
    ''
  );
}

function matchesField(el: HTMLElement, fieldName: string) {
  const wanted = normalize(fieldName);
  const candidates = [
    el.getAttribute('data-vobi-field'),
    el.getAttribute('name'),
    el.getAttribute('id'),
    el.getAttribute('aria-label'),
    el.getAttribute('placeholder'),
    labelTextFor(el),
  ]
    .map((value) => normalize(value || ''))
    .filter(Boolean);

  return candidates.some((candidate) => candidate === wanted);
}

export function focusField(fieldName: string): boolean {
  if (typeof window === 'undefined') return false;

  const fields = Array.from(
    document.querySelectorAll<HTMLElement>('[data-vobi-field], input, textarea, select, [contenteditable="true"]')
  ).filter((el) => !el.closest('.vobi-ambient-popup'));

  const target = fields.find((el) => matchesField(el, fieldName));
  if (!target) return false;

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => {
    target.focus?.({ preventScroll: true });
    target.classList.add('vobi-field-focus-glow');
    window.setTimeout(() => target.classList.remove('vobi-field-focus-glow'), 2800);
  }, 350);

  return true;
}
