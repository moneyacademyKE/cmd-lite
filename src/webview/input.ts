/// <reference lib="dom" />
/**
 * Input Autocomplete State Machine
 *
 * Handles /, @, and ! token parsing, autocomplete list rendering,
 * keyboard navigation, and selection insertion.
 */
import { escapeHtml } from '../util/util';
import { state } from './state';

// ─── Autocomplete State ──────────────────────────────

let autocompleteActive = false;
let autocompleteItems: string[] = [];
let autocompleteSelectedIndex = 0;
let autocompleteTokenStart = 0;
let autocompleteTokenEnd = 0;
let autocompleteTokenType: '/' | '@' | '!' | null = null;

export function isAutocompleteActive(): boolean {
  return autocompleteActive;
}

export function getAutocompleteItemCount(): number {
  return autocompleteItems.length;
}

// ─── Token Parsing ────────────────────────────────────

function getActiveToken(
  text: string,
  caretPos: number,
): { type: '/' | '@' | '!' | null; query: string; start: number; end: number } {
  let start = caretPos;
  while (start > 0 && !/\s/.test(text[start - 1])) {
    start--;
  }
  const token = text.slice(start, caretPos);
  if (token.startsWith('@')) return { type: '@', query: token.slice(1), start, end: caretPos };
  if (token.startsWith('/')) return { type: '/', query: token.slice(1), start, end: caretPos };
  if (token.startsWith('!')) return { type: '!', query: token.slice(1), start, end: caretPos };
  return { type: null, query: '', start, end: caretPos };
}

// ─── List Rendering ───────────────────────────────────

function updateAutocompleteList(): void {
  const listEl = document.getElementById('autocomplete-list');
  if (!listEl) return;

  if (!autocompleteActive || autocompleteItems.length === 0) {
    listEl.classList.add('hidden');
    return;
  }

  listEl.classList.remove('hidden');
  listEl.innerHTML = autocompleteItems.map((item, index) => {
    const isSelected = index === autocompleteSelectedIndex;
    const prefix = autocompleteTokenType === '@' ? '@' : autocompleteTokenType === '/' ? '/' : '!';
    return `<div class="autocomplete-item ${isSelected ? 'selected' : ''}" data-index="${index}">${prefix}${escapeHtml(item)}</div>`;
  }).join('');
}

// ─── Selection ────────────────────────────────────────

export function insertAutocompleteSelection(): void {
  const input = document.getElementById('chat-input') as HTMLTextAreaElement;
  if (!input) return;

  const prefix = autocompleteTokenType === '@' ? '@' : autocompleteTokenType === '/' ? '/' : '!';
  const val = autocompleteItems[autocompleteSelectedIndex] + ' ';
  const text = input.value;
  const before = text.slice(0, autocompleteTokenStart);
  const after = text.slice(autocompleteTokenEnd);

  input.value = before + prefix + val + after;
  input.selectionStart = input.selectionEnd = autocompleteTokenStart + prefix.length + val.length;

  hideAutocomplete();
  input.focus();
}

export function hideAutocomplete(): void {
  autocompleteActive = false;
  autocompleteItems = [];
  autocompleteSelectedIndex = 0;
  updateAutocompleteList();
}

// ─── Keyboard Navigation ─────────────────────────────

export function navigateAutocompleteDown(): void {
  autocompleteSelectedIndex = (autocompleteSelectedIndex + 1) % autocompleteItems.length;
  updateAutocompleteList();
}

export function navigateAutocompleteUp(): void {
  autocompleteSelectedIndex = (autocompleteSelectedIndex - 1 + autocompleteItems.length) % autocompleteItems.length;
  updateAutocompleteList();
}

// ─── Input Change Handler ─────────────────────────────

export function handleInputOrCursorChange(input: HTMLTextAreaElement): void {
  const caretPos = input.selectionStart;
  const text = input.value;
  const token = getActiveToken(text, caretPos);

  if (!token.type) {
    hideAutocomplete();
    return;
  }

  let items: string[] = [];
  if (token.type === '/') {
    const all = ['help', 'clear', 'plan', 'design', 'fix', 'taste', 'sessions', 'agents', 'loops', 'mcp'];
    items = all.filter(cmd => cmd.startsWith(token.query));
  } else if (token.type === '@') {
    const allFiles = new Set<string>();
    if (state.context.activeFile) allFiles.add(state.context.activeFile.path);
    for (const f of state.context.openFiles) {
      allFiles.add(f.path);
    }
    items = Array.from(allFiles).filter(p => p.toLowerCase().includes(token.query.toLowerCase()));
  } else if (token.type === '!') {
    const all = ['pnpm test', 'pnpm run build', 'git status', 'git diff'];
    items = all.filter(cmd => cmd.toLowerCase().startsWith(token.query.toLowerCase()));
  }

  if (items.length > 0) {
    autocompleteActive = true;
    autocompleteItems = items;
    autocompleteSelectedIndex = Math.min(autocompleteSelectedIndex, items.length - 1);
    autocompleteTokenStart = token.start;
    autocompleteTokenEnd = token.end;
    autocompleteTokenType = token.type;
    updateAutocompleteList();
  } else {
    hideAutocomplete();
  }
}

// ─── Textarea Height ──────────────────────────────────

export function adjustTextareaHeight(input: HTMLTextAreaElement): void {
  input.style.height = 'auto';
  const newHeight = Math.min(Math.max(input.scrollHeight, 60), 200);
  input.style.height = `${newHeight}px`;
}
