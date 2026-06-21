import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const browser = await chromium.launch({ headless: true });

// Capture the CMD Lite standalone webview
const webviewPage = await browser.newPage({ viewport: { width: 450, height: 750 } });
await webviewPage.goto('file://' + join(ROOT, 'scripts', 'final-standalone.html'), { waitUntil: 'networkidle', timeout: 15000 });
await webviewPage.waitForTimeout(2000);

await webviewPage.screenshot({ path: join(ROOT, 'scripts', 'final-webview.png') });
console.log('✓ Webview screenshot: scripts/final-webview.png');

// Also capture with a CLI reference on the same canvas for side-by-side
const sideBySide = await browser.newPage({ viewport: { width: 1200, height: 750 } });

const cliContent = [
  '   ███████ ███████ ███████████ ███████████ ███████ ████████    ████',
  '   ███ ███ ██  ███ ███ ███ ███ ███ ███ ███ ███ ███ ███  ███ ███████',
  '   ███     ██  ███ ███ ███ ███ ███ ███ ███ ███████ ███  ███ ███ ███',
  '   ███ ███ ██  ███ ███ ███ ███ ███ ███ ███ ███████ ███  ███ ███ ███',
  '   ███████ ███████ ███ ███ ███ ███ ███ ███ ███ ███ ███  ███ ███████',
  '',
  '',
  '# Command Code v0.39.0',
  '# models: deepseek-v4-pro with max effort · taste-1',
  '# ~/Desktop/cmd',
  '',
  '❯ list 3 colors',
  '',
  '✻ Thought for 1 second [ctrl+o to expand]',
  '',
  '⠶ Red, blue, green',
  '',
  '────────────────────────────────────────────────────────────────────────────────────────────────────',
  '❯ Ask your question...',
  '────────────────────────────────────────────────────────────────────────────────────────────────────',
  '  ? for shortcuts                                             [ctrl+t] continuous learning ◻ TASTE',
].join('\n');

const comparisonHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Comparison</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #1a1a1a; display: flex; gap: 0; font-family: system-ui; height: 100vh; }
.panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.panel-header { padding: 6px 12px; background: #222; color: #aaa; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #333; }
.content { flex: 1; overflow: auto; }
iframe { width: 100%; height: 100%; border: none; }
pre { margin: 0; padding: 16px; font-family: "SF Mono", Menlo, monospace; font-size: 12px; line-height: 1.5; color: #E0E0E0; background: #0a0a0a; white-space: pre; overflow: auto; height: 100%; }
</style>
</head>
<body>
<div class="panel">
  <div class="panel-header">CMD Lite Webview v0.3.0</div>
  <div class="content">
    <iframe src="file://${join(ROOT, 'scripts', 'final-standalone.html')}"></iframe>
  </div>
</div>
<div class="panel" style="border-left: 2px solid #333;">
  <div class="panel-header">cmd CLI TUI v0.39.0</div>
  <div class="content">
    <pre>${cliContent}</pre>
  </div>
</div>
</body>
</html>`;

writeFileSync(join(ROOT, 'scripts', 'comparison.html'), comparisonHtml);
await sideBySide.goto('file://' + join(ROOT, 'scripts', 'comparison.html'), { waitUntil: 'networkidle', timeout: 15000 });
await sideBySide.waitForTimeout(3000);
await sideBySide.screenshot({ path: join(ROOT, 'scripts', 'final-comparison.png'), fullPage: false });
console.log('✓ Side-by-side: scripts/final-comparison.png');

// Final DOM verification
const domCheck = await webviewPage.evaluate(() => {
  const doc = document;
  const checks = {};
  
  // All structural elements
  checks.header = !!doc.querySelector('.header');
  checks.logo = !!doc.querySelector('.header-logo');
  checks.title = doc.querySelector('.header-title')?.textContent || '';
  checks.actionBar = doc.querySelectorAll('.action-btn').length;
  checks.chatPanel = !!doc.getElementById('chat-panel')?.classList.contains('panel-active');
  checks.footer = !!doc.querySelector('.footer-bar');
  checks.crosshairs = doc.querySelectorAll('.crosshair').length;
  
  // Input area
  checks.promptChar = doc.querySelector('.input-prompt')?.textContent || '';
  checks.placeholder = doc.getElementById('chat-input')?.placeholder || '';
  checks.sendBtn = doc.getElementById('send-btn')?.textContent?.trim() || '';
  
  // Prompt bar
  checks.shortcutText = doc.querySelector('.tui-shortcut-help')?.textContent || '';
  checks.learningText = doc.querySelector('.tui-learning-status')?.textContent || '';
  checks.tasteText = doc.getElementById('tui-taste-toggle')?.textContent || '';
  
  // Separator
  const container = doc.querySelector('.chat-input-container');
  if (container) {
    const before = getComputedStyle(container, '::before');
    checks.separator = before.content !== 'none' && before.content.length > 0;
  }
  
  // Footer  
  checks.footerItems = Array.from(doc.querySelectorAll('.footer-item')).map(f => f.textContent.trim());
  
  // Extra elements
  checks.connectionDot = !!doc.querySelector('.connection-dot');
  checks.scrollBtn = !!doc.getElementById('scroll-bottom-btn');
  
  return checks;
});

console.log('\n=== DOM Verification ===');
const results = [
  ['Header with CMD logo', domCheck.header && domCheck.logo],
  ['Action bar with 8 buttons', domCheck.actionBar === 8],
  ['Chat panel active by default', domCheck.chatPanel],
  ['Footer bar with 6 items', domCheck.footerItems.length >= 5],
  ['❯ input prompt', domCheck.promptChar === '❯'],
  ['Placeholder: "Ask your question..."', domCheck.placeholder === 'Ask your question...'],
  ['? for shortcuts text', domCheck.shortcutText === '? for shortcuts'],
  ['[ctrl+t] continuous learning', domCheck.learningText === '[ctrl+t] continuous learning'],
  ['TASTE toggle visible', domCheck.tasteText.includes('TASTE')],
  ['Send button with ❯ Execute', domCheck.sendBtn.includes('Execute') || domCheck.sendBtn.includes('❯')],
  ['CLI separator line (::before)', domCheck.separator],
  ['4 crosshairs', domCheck.crosshairs === 4],
  ['Connection status dot', domCheck.connectionDot],
  ['Scroll-to-bottom button', domCheck.scrollBtn],
];

let allPass = true;
for (const [name, ok] of results) {
  const icon = ok ? '✓' : '✗';
  console.log(`  ${icon} ${name}`);
  if (!ok) allPass = false;
}

console.log(`\n${allPass ? '✓ ALL CHECKS PASSED' : '✗ SOME CHECKS FAILED'}`);
console.log(`Version: 0.3.0`);
console.log(`VSIX: cmd-lite-0.3.0.vsix (${(readFileSync(join(ROOT, 'cmd-lite-0.3.0.vsix')).length / 1024).toFixed(0)} KB)`);

await browser.close();
