import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const PORT = 8753;
const ROOT = new URL('..', import.meta.url).pathname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Start a minimal static server
const server = createServer((req, res) => {
  let filePath = join(ROOT, req.url === '/' ? '/scripts/visual-test.html' : req.url);
  try {
    const content = readFileSync(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

await new Promise(resolve => server.listen(PORT, resolve));
console.log(`Server running at http://localhost:${PORT}`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle', timeout: 15000 });
  // Wait for the webview iframe to load
  await page.waitForSelector('#webview-frame', { timeout: 5000 });
  await page.waitForTimeout(3000); // Give the iframe time to render

  // Take full page screenshot
  await page.screenshot({
    path: join(ROOT, 'scripts', 'visual-comparison.png'),
    fullPage: true,
  });
  console.log('Screenshot saved to scripts/visual-comparison.png');

  // Also take individual screenshots
  const webviewWrapper = await page.$('.webview-wrapper');
  if (webviewWrapper) {
    await webviewWrapper.screenshot({
      path: join(ROOT, 'scripts', 'webview-screenshot.png'),
    });
    console.log('Webview screenshot saved');
  }

  const cliWrapper = await page.$('.cli-wrapper');
  if (cliWrapper) {
    await cliWrapper.screenshot({
      path: join(ROOT, 'scripts', 'cli-screenshot.png'),
    });
    console.log('CLI screenshot saved');
  }

  console.log('\nScreenshots captured! Compare:');
  console.log('  scripts/webview-screenshot.png (CMD Lite)');
  console.log('  scripts/cli-screenshot.png (cmd CLI)');
  console.log('  scripts/visual-comparison.png (side-by-side)');

} catch (err) {
  console.error('Error:', err.message);
  // Try to take a screenshot anyway
  try {
    await page.screenshot({
      path: join(ROOT, 'scripts', 'error-state.png'),
      fullPage: true,
    });
    console.log('Error state screenshot saved');
  } catch {}
} finally {
  await browser.close();
  server.close();
}
