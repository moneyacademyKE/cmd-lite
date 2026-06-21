import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

const browser = await chromium.launch({ headless: true });

// Load the standalone webview
const webviewPage = await browser.newPage({ viewport: { width: 450, height: 750 } });
const webviewPath = 'file://' + join(ROOT, 'scripts', 'standalone-webview.html');
await webviewPage.goto(webviewPath, { waitUntil: 'networkidle', timeout: 15000 });
await webviewPage.waitForTimeout(2000);

// Take webview screenshot
await webviewPage.screenshot({ path: join(ROOT, 'scripts', 'webview-render.png') });
console.log('Webview screenshot saved');

// Analyze webview DOM
const result = await webviewPage.evaluate(() => {
  const doc = document;
  const info = {};

  // Check what rendered
  info.hasApp = !!doc.getElementById('app');
  info.appContent = (doc.getElementById('app')?.children.length || 0) + ' children';

  // Check for key elements
  info.header = !!doc.querySelector('.header');
  info.headerLogo = !!doc.querySelector('.header-logo');
  info.actionBar = !!doc.querySelector('.action-bar');
  info.chatHistory = !!doc.querySelector('.chat-history');
  info.inputContainer = !!doc.querySelector('.chat-input-container');
  info.footerBar = !!doc.querySelector('.footer-bar');
  info.crosshairs = doc.querySelectorAll('.crosshair').length;

  // Check for actual rendered content
  info.actionButtons = Array.from(doc.querySelectorAll('.action-btn')).map(b => b.textContent.trim());
  info.hasChatHistory = !!doc.querySelector('.message');
  info.footerItems = Array.from(doc.querySelectorAll('.footer-item')).map(f => f.textContent.trim());

  // Get the chat input prompt and placeholder
  const prompt = doc.querySelector('.input-prompt');
  info.inputPrompt = prompt ? prompt.textContent : 'MISSING';
  const textarea = doc.getElementById('chat-input');
  info.placeholder = textarea ? textarea.placeholder : 'MISSING';

  // Get header text
  const headerTitle = doc.querySelector('.header-title');
  info.headerTitle = headerTitle ? headerTitle.textContent : 'MISSING';
  const headerVersion = doc.getElementById('header-version');
  info.headerVersion = headerVersion ? headerVersion.textContent : 'MISSING';
  const headerModels = doc.getElementById('header-models');
  info.headerModels = headerModels ? headerModels.textContent : 'MISSING';
  const headerCwd = doc.getElementById('header-cwd');
  info.headerCwd = headerCwd ? headerCwd.textContent : 'MISSING';
  const headerLogo = doc.querySelector('.header-logo');
  info.headerLogoText = headerLogo ? headerLogo.textContent.replace(/\s+/g, ' ').trim() : 'MISSING';

  // Check separator
  const inputContainer = doc.querySelector('.chat-input-container');
  if (inputContainer) {
    const beforeStyle = getComputedStyle(inputContainer, '::before');
    info.hasSeparator = beforeStyle.content !== 'none' && beforeStyle.content.length > 1;
    info.separatorText = beforeStyle.content;
    info.inputBorderTop = getComputedStyle(inputContainer).borderTop;
  }

  // Check prompt bar
  const shortcutHelp = doc.querySelector('.tui-shortcut-help');
  info.shortcutText = shortcutHelp ? shortcutHelp.textContent : 'MISSING';
  const learningStatus = doc.querySelector('.tui-learning-status');
  info.learningText = learningStatus ? learningStatus.textContent : 'MISSING';
  const tasteToggle = doc.getElementById('tui-taste-toggle');
  info.tasteText = tasteToggle ? tasteToggle.textContent : 'MISSING';

  // Get model provider colors from CSS
  info.styleSheets = doc.styleSheets.length;

  // Check for thought-style elements
  info.accordions = doc.querySelectorAll('.step-accordion').length;
  if (info.accordions > 0) {
    info.thoughtSummary = doc.querySelector('.step-accordion summary')?.textContent || '';
  }

  // Get the actual send button text
  const sendBtn = doc.getElementById('send-btn');
  info.sendBtnText = sendBtn ? sendBtn.textContent.trim() : 'MISSING';

  // Check for connection dot
  info.connectionDot = !!doc.querySelector('.connection-dot');

  // Check streaming indicator
  const footerStream = document.getElementById('footer-stream');
  info.footerStream = footerStream ? footerStream.innerHTML.slice(0, 100) : 'MISSING';

  // Take pixel measurements
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  info.bodyBg = bodyBg;

  // Check grid background
  const bgImage = getComputedStyle(document.body).backgroundImage;
  info.hasGridBg = bgImage.includes('linear-gradient') && bgImage.length > 50;

  // Check footer
  const footer = doc.querySelector('.footer-bar');
  info.footerDisplay = footer ? getComputedStyle(footer).display : 'MISSING';

  return info;
});

console.log('\n=== WEBVIEW RENDER ANALYSIS ===');
console.log(JSON.stringify(result, null, 2));

// --- Gap detection ---
console.log('\n=== GAP ANALYSIS ===');
const gaps = [];

if (!result.header) gaps.push('✗ Header not rendering');
if (!result.headerLogo) gaps.push('✗ Header logo missing');
if (!result.headerTitle) gaps.push('✗ Header title missing');
if (result.headerVersion === 'v0.0.0' || result.headerVersion === 'MISSING') {
  gaps.push('△ Version not populated: "' + result.headerVersion + '"');
}
if (result.headerModels === 'loading...' || result.headerModels === 'MISSING') {
  gaps.push('△ Models not populated: "' + result.headerModels + '"');
}
if (result.headerCwd === '~' || result.headerCwd === 'MISSING') {
  gaps.push('△ CWD not populated: "' + result.headerCwd + '"');
}
if (result.headerLogoText && result.headerLogoText.length < 5) {
  gaps.push('△ CMD logo seems too small');
}
if (!result.actionBar) gaps.push('✗ Action bar not rendering');
if (result.actionButtons.length < 8) {
  gaps.push('✗ Missing action buttons: ' + result.actionButtons.length + '/8');
}
if (!result.chatHistory) gaps.push('✗ Chat history not rendering');
if (!result.inputContainer) gaps.push('✗ Input container not rendering');
if (result.inputPrompt === 'MISSING') gaps.push('✗ ❯ input prompt character missing');
if (result.placeholder !== 'Ask your question...') {
  gaps.push('△ Wrong placeholder: "' + result.placeholder + '"');
}
if (!result.hasSeparator) gaps.push('△ CLI separator line not visible (might just be CSS ::before)');
if (result.shortcutText !== '? for shortcuts') {
  gaps.push('△ Wrong shortcut text: "' + result.shortcutText + '"');
}
if (result.learningText !== '[ctrl+t] continuous learning') {
  gaps.push('△ Wrong learning text: "' + result.learningText + '"');
}
if (result.tasteText !== '□ TASTE') {
  gaps.push('△ Wrong TASTE toggle text: "' + result.tasteText + '"');
}
if (!result.footerBar) gaps.push('✗ Footer bar not rendering');
if (result.footerItems.length < 5) gaps.push('✗ Missing footer items: ' + result.footerItems.length + '/6');
if (result.crosshairs !== 4) gaps.push('✗ Missing crosshair decorations: ' + result.crosshairs + '/4');

// Check if thought accordion was rendered with new style
if (result.accordions > 0 && result.thoughtSummary) {
  if (result.thoughtSummary.includes('🤔')) {
    gaps.push('△ Thought accordion still shows 🤔 emoji: "' + result.thoughtSummary + '"');
  } else if (result.thoughtSummary.includes('Reasoning')) {
    gaps.push('△ Thought accordion still says "Reasoning"');
  } else {
    console.log('  ✓ Thought accordion updated: "' + result.thoughtSummary + '"');
  }
}

if (!result.sendBtnText.includes('❯') && !result.sendBtnText.includes('Execute')) {
  gaps.push('△ Send button text different: "' + result.sendBtnText + '"');
}

console.log('Results:');
if (gaps.length === 0) {
  console.log('  ✓ ALL CHECKS PASSED - No gaps detected');
} else {
  gaps.forEach(g => console.log('  ' + g));
}

// --- Now take a screenshot of the CLI reference for comparison ---
console.log('\n=== CLI REFERENCE (from tmux capture) ===');
const cliLines = readFileSync(join(ROOT, 'scripts', 'visual-test.html'), 'utf8');
// Extract the CLI pre content
const match = cliLines.match(/<pre id="cli-output">([\s\S]*?)<\/pre>/);
if (match) {
  const cliContent = match[1];
  const lines = cliContent.trimEnd().split('\n');
  console.log('  CLI lines: ' + lines.length);
  console.log('  Max line width: ' + Math.max(...lines.map(l => l.length)));
  
  // Extract key visual elements from CLI
  const cliElements = [];
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed.includes('█████')) cliElements.push('ASCII art logo (5 lines)');
    if (trimmed.startsWith('# Command Code')) cliElements.push('Version header');
    if (trimmed.startsWith('# models:')) cliElements.push('Models label');
    if (trimmed.startsWith('# ~')) cliElements.push('CWD label');
    if (trimmed.startsWith('❯')) cliElements.push('❯ prompt');
    if (trimmed.includes('✻ Thought')) cliElements.push('Thought with duration');
    if (trimmed.startsWith('⠶')) cliElements.push('⠶ response bullet');
    if (trimmed.includes('────────────────')) cliElements.push('Separator line');
    if (trimmed.includes('? for shortcuts')) cliElements.push('Shortcut help bar');
    if (trimmed.includes('continuous learning')) cliElements.push('Learning status');
    if (trimmed.includes('◻ TASTE') || trimmed.includes('□ TASTE')) cliElements.push('TASTE toggle');
  }
  
  console.log('\n  CLI visual elements found:');
  const unique = [...new Set(cliElements)];
  unique.forEach(e => console.log('    ✓ ' + e));
}

await browser.close();
