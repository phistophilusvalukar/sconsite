import React, { useMemo } from 'react';
import { sanitizeRichHtml } from './richText';

interface SafeRichTextProps {
  html: string;
  className?: string;
  inline?: boolean;
  as?: 'div' | 'span' | 'h1' | 'h2' | 'h3';
}

const SafeRichText: React.FC<SafeRichTextProps> = ({ html, className, inline = false, as: Element = 'div' }) => {
  const cleanHtml = useMemo(() => sanitizeRichHtml(html, inline ? 'inline' : 'block'), [html, inline]);
  return <Element className={className} dangerouslySetInnerHTML={{ __html: cleanHtml }} />;
};

export default SafeRichText;
