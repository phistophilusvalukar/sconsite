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

const getSafeTextColor = (element: Element) => {
  const rawStyle = element.getAttribute('style') || '';
  if (!rawStyle || rawStyle.length > 500) return '';
  const probe = document.createElement('span');
  probe.setAttribute('style', rawStyle);
  const color = probe.style.color.trim();
  if (!color || color.length > 100 || /url\s*\(|expression\s*\(|var\s*\(/i.test(color)) return '';
  return color;
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
    const textColor = getSafeTextColor(element);
    for (const attribute of Array.from(element.attributes)) {
      element.removeAttribute(attribute.name);
    }

    if (textColor) element.setAttribute('style', `color: ${textColor}`);

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
