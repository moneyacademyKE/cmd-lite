/**
 * Thin Glass UI Renderer
 * This script runs in the webview. It has no complex state of its own.
 * It purely renders JSON-RPC payloads received from the VS Code extension
 * and emits DOM events back.
 */

// @ts-ignore
const vscode = acquireVsCodeApi();

// Minimal application state (mirrored from CLI)
let state = {
  messages: [] as Array<{ id: string, role: string, content: string }>,
  tokens: { prompt: 0, completion: 0, total: 0 },
  modelId: ''
};

// Render the application based on state
function render() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div class="crosshair tl"></div>
    <div class="crosshair tr"></div>
    <div class="crosshair bl"></div>
    <div class="crosshair br"></div>

    <div class="header">
      <h2>Command Code Chat</h2>
      <div class="metrics">
        <span>TOKENS // ${state.tokens.total.toLocaleString()}</span>
        <span>MODEL // ${state.modelId || 'None'}</span>
      </div>
    </div>
    <div class="chat-history">
      ${state.messages.map(m => `
        <div class="message message-${m.role}">
          <span class="message-role">${m.role}</span>
          <span>${m.content}</span>
        </div>
      `).join('')}
    </div>
    <div class="chat-input-container">
      <textarea id="chat-input" placeholder="Awaiting Input..."></textarea>
      <div class="controls">
        <div class="qr-code"></div>
        <button id="send-btn">Execute</button>
      </div>
    </div>
  `;

  // Attach event listeners after render
  const input = document.getElementById('chat-input') as HTMLTextAreaElement;
  const sendBtn = document.getElementById('send-btn');

  const sendMessage = () => {
    if (input.value.trim()) {
      vscode.postMessage({
        type: 'chatInput',
        payload: { prompt: input.value }
      });
      input.value = '';
    }
  };

  sendBtn?.addEventListener('click', sendMessage);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

// Listen for JSON-RPC payloads from the extension
window.addEventListener('message', event => {
  const message = event.data;
  
  if (message.jsonrpc === '2.0' && message.method === 'webview/dispatchEvent') {
    const { type, payload } = message.params;
    
    switch (type) {
      case 'RenderMessage':
        state.messages.push(payload);
        render();
        break;
      case 'UpdateTokens':
        state.tokens = payload;
        render();
        break;
      case 'ModelChanged':
        state.modelId = payload.modelId;
        render();
        break;
    }
  }
});

// Initial render
render();
