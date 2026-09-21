/// <reference lib="dom" />
/**
 * Webview Layout Templates
 *
 * Static HTML templates for the main app shell and onboarding screen.
 * Decomplects layout structure from runtime behavior.
 */

export function buildAppHtml(): string {
  return `
    <div class="crosshair tl"></div><div class="crosshair tr"></div><div class="crosshair bl"></div><div class="crosshair br"></div>
    <div class="header">
      <div class="header-top">
        <div class="header-logo">
   ███  ███ █████
   █ █  █ █ █
   █    █ █ ███
   █ █  █ █ █
   ███  ███ █████
        </div>
        <div class="header-title-area">
          <h2 class="header-title">Command Code</h2>
          <span class="header-version" id="header-version">v0.0.0</span>
          <span class="header-models" id="header-models">loading...</span>
          <span class="header-cwd" id="header-cwd">~</span>
        </div>
      </div>
      <div class="metrics">
        <span class="metric" id="token-count">TOKENS // P 0 / C 0 / 0</span>
        <span class="metric" id="model-name">MODEL // NONE</span>
        <span class="metric" id="perm-mode">PERM // STANDARD</span>
      </div>
    </div>
    <div class="action-bar">
      <button class="action-btn" data-action="start" title="Start New Session">&#x25B6; START</button>
      <button class="action-btn" data-action="continue" title="Continue Last Session">&#x21BB; CONTINUE</button>
      <button class="action-btn" data-action="list-sessions" title="Recent Sessions">&#x2630; SESSIONS</button>
      <button class="action-btn" data-action="list-agents" title="Active Agents">&#x2691; AGENTS</button>
      <button class="action-btn" data-action="list-loops" title="Agent Loops">&#x27F3; LOOPS</button>
      <button class="action-btn" data-action="list-mcp" title="MCP Servers">&#x2699; MCP</button>
      <button class="action-btn" data-action="toggle-context" title="Toggle Context Panel">&#x2630; CTX</button>
      <button class="action-btn" data-action="pick-model" title="Pick Model">&#x2699; MODEL</button>
      <button class="action-btn" data-action="pick-permission" title="Pick Permission">&#x2699; PERM</button>
      <button class="action-btn" data-action="show-status" title="Show Status">&#x2139; STATUS</button>
    </div>
    <div class="main-content">
      <div class="panel-container">
        <div id="chat-panel" class="panel panel-active">
          <div class="chat-history" id="chat-history"></div>
          <div id="tui-active-status" class="tui-status-line hidden">
            <span class="tui-status-spinner">o</span>
            <span class="tui-status-text">Hypothesizing... esc to interrupt</span>
            <span class="tui-status-time">&bull; 0s</span>
            <span class="tui-status-tokens">&bull; &darr; 0</span>
          </div>
          <div class="chat-input-container">
            <div id="autocomplete-list" class="autocomplete-list hidden"></div>
            <div class="input-prompt-row">
              <span class="input-prompt">&#x276F;</span>
              <textarea id="chat-input" placeholder="Ask your question..."></textarea>
            </div>
            <div class="prompt-tui-bar">
              <span class="tui-shortcut-help">? for shortcuts</span>
              <span class="tui-learning-status">[ctrl+t] continuous learning</span>
              <span class="tui-taste-toggle" id="tui-taste-toggle">&#x25A1; TASTE</span>
            </div>
            <div class="chat-input-row">
              <div class="qr-code"></div>
              <button id="send-btn">&#x276F; Execute</button>
            </div>
          </div>
        </div>
        <div id="sessions-panel" class="panel">
          <div class="panel-header"><span>RECENT SESSIONS</span><button class="panel-close" data-panel="sessions">&#x2715;</button></div>
          <div class="session-list" id="session-list"></div>
        </div>
        <div id="agents-panel" class="panel">
          <div class="panel-header"><span>ACTIVE AGENTS</span><button class="panel-close" data-panel="agents">&#x2715;</button></div>
          <div class="session-list" id="agent-list"></div>
        </div>
        <div id="loops-panel" class="panel">
          <div class="panel-header"><span>AGENT LOOPS</span><button class="panel-close" data-panel="loops">&#x2715;</button></div>
          <div class="session-list" id="loop-list"></div>
        </div>
        <div id="mcp-panel" class="panel">
          <div class="panel-header"><span>MCP SERVERS</span><button class="panel-close" data-panel="mcp">&#x2715;</button></div>
          <div class="session-list" id="mcp-list"></div>
        </div>
        <div id="status-panel" class="panel">
          <div class="panel-header"><span>STATUS</span><button class="panel-close" data-panel="status">&#x2715;</button></div>
          <pre class="status-content" id="status-content"></pre>
        </div>
      </div>
      <div id="context-panel" class="sidebar hidden">
        <div class="panel-header"><span>CONTEXT</span><button class="panel-close" data-panel="context">&#x2715;</button></div>
        <div class="context-section">
          <div class="context-section-title">GIT</div>
          <div class="context-section-body" id="context-git-body"><span class="context-muted">No git data</span></div>
        </div>
        <div class="context-section">
          <div class="context-section-title">FILES</div>
          <div class="context-section-body" id="context-files-body"><span class="context-muted">No files open</span></div>
        </div>
        <div class="context-section">
          <div class="context-section-title">DIAGNOSTICS</div>
          <div class="context-section-body" id="context-diag-body"><span class="context-muted">No diagnostics</span></div>
        </div>
      </div>
    </div>
    <div class="footer-bar">
      <span class="footer-item" id="footer-model">MODEL // NONE</span>
      <span class="footer-item" id="footer-mode">MODE // STANDARD</span>
      <span class="footer-item" id="footer-tokens">T // P 0 / C 0 / 0</span>
      <span class="footer-item" id="footer-session">SESSION // --</span>
      <span class="footer-item" id="footer-turn">TURN // 0</span>
      <span class="footer-item streaming-indicator" id="footer-stream"></span>
    </div>
  `;
}

export function buildOnboardingHtml(): string {
  return `
    <div class="onboarding-welcome">
      <div class="onboarding-logo-container">
        <pre class="onboarding-ascii">
 ██████╗███╗   ███╗██████╗ 
██╔════╝████╗ ████║██╔══██╗
██║     ██╔████╔██║██║  ██║
██║     ██║╚██╔╝██║██║  ██║
╚██████╗██║ ╚═╝ ██║██████╔╝
 ╚═════╝╚═╝     ╚═╝╚═════╝ 
        </pre>
      </div>
      <div class="onboarding-tagline">Your autonomous coding agent with taste</div>
      <div class="onboarding-section">
        <button class="onboarding-btn onboarding-start-session-btn" data-action="start">
          <span class="btn-icon">▶</span><span class="btn-title">Start New Session</span>
        </button>
      </div>
      <div class="onboarding-section">
        <h3>Quick Actions</h3>
        <div class="onboarding-buttons">
          <button class="onboarding-btn" data-prompt="/fix">
            <div class="btn-header"><span class="btn-icon">🔧</span><span class="btn-title">Fix Diagnostics</span></div>
            <span class="btn-desc">Analyze and fix active workspace diagnostics</span>
          </button>
          <button class="onboarding-btn" data-prompt="/plan ">
            <div class="btn-header"><span class="btn-icon">📝</span><span class="btn-title">Plan Mode</span></div>
            <span class="btn-desc">Propose an implementation plan for a task</span>
          </button>
          <button class="onboarding-btn" data-prompt="/taste">
            <div class="btn-header"><span class="btn-icon">👅</span><span class="btn-title">Inspect Taste</span></div>
            <span class="btn-desc">View learned taste preferences for this repo</span>
          </button>
          <button class="onboarding-btn" data-prompt="/design ">
            <div class="btn-header"><span class="btn-icon">🎨</span><span class="btn-title">Design Mode</span></div>
            <span class="btn-desc">Run the /design agent for UI/UX workflows</span>
          </button>
        </div>
      </div>
      <div class="onboarding-section">
        <h3>Keyboard Shortcuts</h3>
        <table class="shortcuts-table">
          <tr><td><kbd>Cmd+Shift+\`</kbd> / <kbd>Ctrl+Shift+\`</kbd></td><td>Start New Session</td></tr>
          <tr><td><kbd>Ctrl+T</kbd></td><td>Toggle Continuous Learning</td></tr>
          <tr><td><kbd>Enter</kbd></td><td>Submit prompt</td></tr>
          <tr><td><kbd>Shift+Enter</kbd></td><td>Insert new line</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Interrupt execution</td></tr>
        </table>
      </div>
    </div>
  `;
}
