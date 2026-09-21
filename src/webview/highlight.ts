/// <reference lib="dom" />
/**
 * Syntax Highlighting & ANSI Parsing
 *
 * Zero-dependency regex tokenization for code blocks and stateful ANSI
 * escape-to-HTML conversion for terminal output streams.
 */
import { escapeHtml } from '../util/util';

// ─── ANSI Escape to HTML ─────────────────────────────

export function ansiToHtml(text: string): string {
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /\u001b\[([0-9;]*)m/g;
  let currentSpanOpen = false;
  let result = '';
  let lastIndex = 0;
  let match;

  let fgColor: string | null = null;
  let isBold = false;

  function getSpanStyle() {
    const styles: string[] = [];
    if (fgColor) styles.push(`color:${fgColor}`);
    if (isBold) styles.push('font-weight:bold');
    return styles.length > 0 ? `style="${styles.join(';')}"` : '';
  }

  while ((match = ansiRegex.exec(text)) !== null) {
    const plainText = text.substring(lastIndex, match.index);
    result += escapeHtml(plainText);

    const codes = match[1].split(';').map(Number);
    for (const code of codes) {
      if (code === 0) { fgColor = null; isBold = false; }
      else if (code === 1) { isBold = true; }
      else if (code === 22) { isBold = false; }
      else if (code >= 30 && code <= 37) {
        const colors = [
          'var(--vscode-terminal-ansiBlack)',
          'var(--vscode-terminal-ansiRed)',
          'var(--vscode-terminal-ansiGreen)',
          'var(--vscode-terminal-ansiYellow)',
          'var(--vscode-terminal-ansiBlue)',
          'var(--vscode-terminal-ansiMagenta)',
          'var(--vscode-terminal-ansiCyan)',
          'var(--vscode-terminal-ansiWhite)',
        ];
        fgColor = colors[code - 30];
      } else if (code === 39) { fgColor = null; }
      else if (code >= 90 && code <= 97) {
        const brightColors = [
          'var(--vscode-terminal-ansiBrightBlack)',
          'var(--vscode-terminal-ansiBrightRed)',
          'var(--vscode-terminal-ansiBrightGreen)',
          'var(--vscode-terminal-ansiBrightYellow)',
          'var(--vscode-terminal-ansiBrightBlue)',
          'var(--vscode-terminal-ansiBrightMagenta)',
          'var(--vscode-terminal-ansiBrightCyan)',
          'var(--vscode-terminal-ansiBrightWhite)',
        ];
        fgColor = brightColors[code - 90];
      }
    }

    if (currentSpanOpen) { result += '</span>'; currentSpanOpen = false; }

    const styleAttr = getSpanStyle();
    if (styleAttr) { result += `<span ${styleAttr}>`; currentSpanOpen = true; }

    lastIndex = ansiRegex.lastIndex;
  }

  result += escapeHtml(text.substring(lastIndex));
  if (currentSpanOpen) result += '</span>';
  return result;
}

export function cleanAndColorAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  const cleanRegex = /\u001b\[[0-9;]*[a-lA-Ln-zN-Z]/g;
  let cleaned = text.replace(cleanRegex, '');
  cleaned = cleaned.replace(/\r+/g, '');
  return ansiToHtml(cleaned);
}

// ─── Regex Code Syntax Highlighter ───────────────────

export function highlightTokens(rawCode: string, lang: string): string {
  let commentRegex = /\/\/.*/;
  if (lang === 'clojure' || lang === 'clj') {
    commentRegex = /;.*/;
  } else if (lang === 'python' || lang === 'py') {
    commentRegex = /#.*/;
  } else {
    commentRegex = /(\/\/.*)|(\/\*[\s\S]*?\*\/)/;
  }

  const stringRegex = /("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])*')|(`(?:\\.|[^`\\])*`)/;
  const numberRegex = /\b(\d+(?:\.\d+)?)\b/;
  const keywords = /\b(const|let|var|function|return|if|else|for|while|do|break|continue|switch|case|default|class|interface|type|extends|implements|import|export|from|as|new|this|typeof|instanceof|async|await|try|catch|finally|throw|debugger|defn|def|fn|let|loop|recur|if-not|when|when-not|cond|case|nil|true|false|defmacro|ns|require|use|import|defmulti|defmethod|lambda|import|from|def|class|return|if|elif|else|for|while|try|except|finally|raise|assert|pass|with|as|yield|lambda|in|is|not|and|or|css|html)\b/;

  const rules = [
    { type: 'comment', regex: commentRegex },
    { type: 'string', regex: stringRegex },
    { type: 'keyword', regex: keywords },
    { type: 'number', regex: numberRegex },
  ];

  let index = 0;
  let html = '';

  while (index < rawCode.length) {
    let earliestMatch: { rule: typeof rules[0]; match: RegExpExecArray } | null = null;

    for (const rule of rules) {
      const regex = new RegExp(rule.regex.source, rule.regex.flags);
      const m = regex.exec(rawCode.slice(index));
      if (m && m.index !== undefined) {
        if (!earliestMatch || m.index < earliestMatch.match.index) {
          earliestMatch = { rule, match: m };
        }
      }
    }

    if (earliestMatch) {
      const matchIndex = earliestMatch.match.index + index;
      const matchText = earliestMatch.match[0];

      if (matchIndex > index) {
        html += escapeHtml(rawCode.substring(index, matchIndex));
      }

      html += `<span class="token-${earliestMatch.rule.type}">${escapeHtml(matchText)}</span>`;
      index = matchIndex + matchText.length;
    } else {
      html += escapeHtml(rawCode.substring(index));
      break;
    }
  }

  return html;
}

const SUPPORTED_LANGS = [
  'javascript', 'typescript', 'js', 'ts', 'json',
  'clojure', 'clj', 'python', 'py', 'css', 'html',
];

export function highlightCode(code: string, lang: string): string {
  const normalizedLang = (lang || '').toLowerCase().trim();
  if (!normalizedLang) return escapeHtml(code);
  if (SUPPORTED_LANGS.includes(normalizedLang)) {
    return highlightTokens(code, normalizedLang);
  }
  return escapeHtml(code);
}
