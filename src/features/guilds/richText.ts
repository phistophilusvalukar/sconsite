const BLOCK_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H2', 'H3', 'A', 'SPAN']);
const INLINE_TAGS = new Set(['BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'A', 'SPAN']);

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const isSafeLink = (value: string) => {
  try {
    const protocol = new URL(value, window.location.origin).protocol;
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:';
  } catch {
    return false;
  }
};

const SAFE_STYLE_PROPERTIES = new Set([
  'color', 'background', 'background-color', 'background-image',
  'font', 'font-family', 'font-size', 'font-style', 'font-variant', 'font-weight',
  'line-height', 'letter-spacing', 'word-spacing',
  'text-align', 'text-decoration', 'text-decoration-color', 'text-decoration-line',
  'text-decoration-style', 'text-indent', 'text-shadow', 'text-transform', 'white-space',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-color', 'border-style', 'border-width', 'border-radius',
  'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'box-shadow', 'opacity'
]);

const getSafeInlineStyle = (element: Element) => {
  const rawStyle = element.getAttribute('style') || '';
  if (!rawStyle || rawStyle.length > 2000) return '';
  const probe = document.createElement('span');
  probe.setAttribute('style', rawStyle);
  const safeDeclarations: string[] = [];

  for (const property of Array.from(probe.style)) {
    if (!SAFE_STYLE_PROPERTIES.has(property)) continue;
    const value = probe.style.getPropertyValue(property).trim();
    if (!value || value.length > 500 || /url\s*\(|expression\s*\(|javascript\s*:|@import|-moz-binding|behavior\s*:/i.test(value)) continue;
    safeDeclarations.push(`${property}: ${value}`);
  }

  return safeDeclarations.join('; ');
};

export const sanitizeRichHtml = (html: string, mode: 'block' | 'inline' = 'block') => {
  if (typeof document === 'undefined') return '';
  const template = document.createElement('template');
  template.innerHTML = html;
  const allowedTags = mode === 'inline' ? INLINE_TAGS : BLOCK_TAGS;

  for (const element of Array.from(template.content.querySelectorAll('*'))) {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    const href = element.tagName === 'A' ? element.getAttribute('href') || '' : '';
    const safeStyle = getSafeInlineStyle(element);
    for (const attribute of Array.from(element.attributes)) {
      element.removeAttribute(attribute.name);
    }

    if (safeStyle) element.setAttribute('style', safeStyle);

    if (element.tagName === 'A' && isSafeLink(href)) {
      element.setAttribute('href', href);
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  }

  return template.innerHTML;
};

export const richTextToPlainText = (html: string) => {
  if (typeof document === 'undefined') return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const template = document.createElement('template');
  template.innerHTML = sanitizeRichHtml(html);
  return (template.content.textContent || '').replace(/\s+/g, ' ').trim();
};

export const plainTextToRichHtml = (value: string) => value
  .split(/\n{2,}/)
  .map(paragraph => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`)
  .join('');
