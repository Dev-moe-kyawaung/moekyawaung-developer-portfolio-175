import { useMemo } from 'react';

const KEYWORD_LIST =
  'const|let|var|function|return|new|if|else|for|while|import|from|export|default|class|extends|private|readonly|uniform|varying|attribute|precision|void|float|vec2|vec3|vec4|mat3|mat4|in|out|await|async|null|true|false|this|typeof';

// Alternation: [1] string literal, [2] number, [3] keyword — matched in one pass.
const TOKEN = new RegExp(`(?:('(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|\`(?:[^\`\\\\]|\\\\.)*\`))|\\b(\\d+(?:\\.\\d+)?)\\b|\\b(${KEYWORD_LIST})\\b`, 'g');

function highlight(src: string): string {
  const esc = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = esc.split('\n').map((line) => {
    const commentIdx = line.search(/(\/\/|#\s|--\s)/);
    let code = line;
    let comment = '';
    if (commentIdx >= 0 && !/https?:/.test(line.slice(0, commentIdx + 2))) {
      code = line.slice(0, commentIdx);
      comment = line.slice(commentIdx);
    }
    // Single pass so inserted markup is never re-scanned.
    code = code.replace(TOKEN, (m, str, num, kw) => {
      if (str !== undefined) return `<span class="text-emerald-300">${m}</span>`;
      if (num !== undefined) return `<span class="text-amber-300">${m}</span>`;
      if (kw !== undefined) return `<span class="text-violet-300">${m}</span>`;
      return m;
    });
    if (comment) comment = `<span class="text-slate-500 italic">${comment}</span>`;
    return code + comment;
  });
  return lines.join('\n');
}

export default function CodeBlock({ code, label, lang = 'ts' }: { code: string; label?: string; lang?: string }) {
  const html = useMemo(() => highlight(code.trim()), [code]);
  return (
    <div className="my-5 overflow-hidden rounded-xl border border-white/10 bg-[#0a0d18]">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
        <span className="font-mono text-[11px] text-slate-400">{label ?? ''}</span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-600">{lang}</span>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-slate-200">
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}
