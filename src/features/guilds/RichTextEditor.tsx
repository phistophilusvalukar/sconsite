import React, { useEffect, useRef, useState } from 'react';
import { Bold, Code2, Italic, Link, List, ListOrdered, Quote, Strikethrough, Underline } from 'lucide-react';
import { sanitizeRichHtml } from './richText';

interface RichTextEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inline?: boolean;
  placeholder?: string;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ label, value, onChange, inline = false, placeholder }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [sourceMode, setSourceMode] = useState(false);

  useEffect(() => {
    if (!sourceMode && editorRef.current && document.activeElement !== editorRef.current) {
      editorRef.current.innerHTML = sanitizeRichHtml(value, inline ? 'inline' : 'block');
    }
  }, [inline, sourceMode, value]);

  const runCommand = (command: string, commandValue?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    onChange(editorRef.current?.innerHTML || '');
  };

  const addLink = () => {
    const url = window.prompt('Link URL (HTTP, HTTPS, or email)');
    if (!url) return;
    try {
      const protocol = new URL(url, window.location.origin).protocol;
      if (!['http:', 'https:', 'mailto:'].includes(protocol)) throw new Error('Unsafe link');
      runCommand('createLink', url);
    } catch {
      window.alert('Use an HTTP, HTTPS, or email link.');
    }
  };

  const finishEditing = () => {
    const clean = sanitizeRichHtml(editorRef.current?.innerHTML || value, inline ? 'inline' : 'block');
    if (editorRef.current) editorRef.current.innerHTML = clean;
    onChange(clean);
  };

  return (
    <div className="guild-rich-editor">
      <div className="guild-rich-editor-label">
        <span>{label}</span>
        <button type="button" className={sourceMode ? 'is-active' : ''} onClick={() => setSourceMode(current => !current)}>
          <Code2 size={14} /> {sourceMode ? 'Visual editor' : 'HTML source'}
        </button>
      </div>
      {!sourceMode && (
        <div className="guild-rich-toolbar" aria-label={`${label} formatting controls`}>
          <button type="button" title="Bold" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('bold')}><Bold size={15} /></button>
          <button type="button" title="Italic" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('italic')}><Italic size={15} /></button>
          <button type="button" title="Underline" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('underline')}><Underline size={15} /></button>
          <button type="button" title="Strikethrough" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('strikeThrough')}><Strikethrough size={15} /></button>
          {!inline && <button type="button" title="Bulleted list" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('insertUnorderedList')}><List size={15} /></button>}
          {!inline && <button type="button" title="Numbered list" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('insertOrderedList')}><ListOrdered size={15} /></button>}
          {!inline && <button type="button" title="Quote" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('formatBlock', 'blockquote')}><Quote size={15} /></button>}
          <button type="button" title="Link" onMouseDown={event => event.preventDefault()} onClick={addLink}><Link size={15} /></button>
          <button type="button" title="Remove formatting" onMouseDown={event => event.preventDefault()} onClick={() => runCommand('removeFormat')}>Clear</button>
        </div>
      )}
      {sourceMode ? (
        <textarea
          className="guild-rich-source"
          rows={inline ? 3 : 7}
          value={value}
          onChange={event => onChange(event.target.value)}
          onBlur={() => onChange(sanitizeRichHtml(value, inline ? 'inline' : 'block'))}
          spellCheck={false}
        />
      ) : (
        <div
          ref={editorRef}
          className={`guild-rich-surface ${inline ? 'guild-rich-surface-inline' : ''}`}
          contentEditable
          role="textbox"
          aria-label={label}
          aria-multiline={!inline}
          data-placeholder={placeholder}
          onInput={event => onChange(event.currentTarget.innerHTML)}
          onBlur={finishEditing}
          suppressContentEditableWarning
        />
      )}
      <p className="guild-rich-help">Safe HTML only. Text colors are allowed; scripts, embeds, event handlers, and other inline styles are removed.</p>
    </div>
  );
};

export default RichTextEditor;
