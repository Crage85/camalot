// Small DOM helpers shared by the platform screens.

// Lucide icons (lucide.dev, ISC license): x, arrow-left, volume-2, volume-x.
const svg = (paths: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const SPEAKER =
  '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>';
export const ICON = {
  sound: svg(SPEAKER + '<path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>'),
  mute: svg(SPEAKER + '<line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>'),
  close: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  back: svg('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>'),
  speak: svg(
    '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
  ),
};

/** Opens a modal card. showModal makes the page behind inert, so focus stays inside the card. */
export function openDialog(label: string): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'cm-dialog';
  d.setAttribute('aria-label', label);
  // Keys pressed in the card must not reach the paused game behind it.
  d.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key !== 'Tab') return;
    // Wrap Tab inside the card; a modal dialog alone lets focus step out to the browser bar.
    const f = [...d.querySelectorAll<HTMLElement>('button, input, a[href]')].filter((x) => !(x as HTMLButtonElement).disabled);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    const at = document.activeElement;
    if (e.shiftKey ? at === first || !f.includes(at as HTMLElement) : at === last || !f.includes(at as HTMLElement)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  });
  d.addEventListener('keyup', (e) => e.stopPropagation());
  document.body.append(d);
  d.showModal();
  return d;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
