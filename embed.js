(function () {
  'use strict';

  // ── Config from data-attributes ─────────────────────────────────
  const script = document.currentScript;
  const API_BASE = (script.getAttribute('data-api') || '').replace(/\/+$/, '');
  if (!API_BASE) { console.error('[infoagent] data-api is required'); return; }
  const CHAT_URL = API_BASE + '/chat';
  const CONFIG_URL = API_BASE + '/widget-config';

  const needsRemoteConfig = !script.hasAttribute('data-title');

  function readLocalConfig() {
    return {
      title:       script.getAttribute('data-title')       || 'Chat',
      subtitle:    script.getAttribute('data-subtitle')    || '',
      placeholder: script.getAttribute('data-placeholder') || 'Scrivi un messaggio...',
      color:       script.getAttribute('data-color')       || '#0066CC',
      position:    script.getAttribute('data-position')    || 'right',
      welcomeMessage: script.getAttribute('data-welcome')  || '',
      mode:        script.getAttribute('data-mode')        || 'popup',
      lang:        script.getAttribute('data-lang')        || 'it',
      theme:       script.getAttribute('data-theme')       || '',
      persona:     script.getAttribute('data-persona')     || '',
      welcomeChips: (function () {
        try { return JSON.parse(script.getAttribute('data-welcome-chips') || '[]'); }
        catch (e) { return []; }
      })(),
      open: script.getAttribute('data-open') === 'true',
    };
  }

  function mergeConfig(remote) {
    // Explicit data-* attributes always win over remote values
    var merged = {};
    var keys = ['title', 'subtitle', 'placeholder', 'color', 'position',
                'welcomeMessage', 'mode', 'lang', 'theme', 'persona', 'welcomeChips', 'open'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var attrName = k === 'welcomeMessage' ? 'data-welcome'
                   : k === 'welcomeChips' ? 'data-welcome-chips'
                   : 'data-' + k;
      if (script.hasAttribute(attrName)) {
        // Use value from data-attribute
        if (k === 'welcomeChips') {
          try { merged[k] = JSON.parse(script.getAttribute(attrName)); } catch (e) { merged[k] = []; }
        } else {
          merged[k] = script.getAttribute(attrName) || '';
        }
      } else {
        merged[k] = remote[k] !== undefined ? remote[k] : '';
      }
    }
    return merged;
  }

  function boot(cfg) {
    var TITLE       = cfg.title;
    var SUBTITLE    = cfg.subtitle;
    var PLACEHOLDER = cfg.placeholder;
    var COLOR       = cfg.color || '#0066CC';
    var POSITION    = cfg.position || 'right';
    var WELCOME     = cfg.welcomeMessage || '';
    var MODE        = cfg.mode || 'popup';
    var LANG        = cfg.lang || 'it';
    var THEME       = cfg.theme || '';
    var PERSONA     = cfg.persona || '';
    var OPEN        = cfg.open === true || cfg.open === 'true';
    var welcomeChips = cfg.welcomeChips || [];

  // ── Widget strings ──────────────────────────────────────────────
  const STRINGS = {
    it: { placeholder: 'Scrivi un messaggio...', close: 'Chiudi', send: 'Invia', open: 'Apri chat', error: 'Si \u00e8 verificato un errore. Riprova tra poco.' },
    en: { placeholder: 'Type a message...', close: 'Close', send: 'Send', open: 'Open chat', error: 'An error occurred. Please try again shortly.' },
    es: { placeholder: 'Escribe un mensaje...', close: 'Cerrar', send: 'Enviar', open: 'Abrir chat', error: 'Se produjo un error. Int\u00e9ntalo de nuevo en breve.' },
  };
  const S = STRINGS[LANG] || STRINGS.it;

  // ── Session ID ──────────────────────────────────────────────────
  // Always generate a fresh session on each embed.js init (iframe reload).
  // This ensures persona/lang switches start a clean conversation.
  function createSessionId() {
    return crypto.randomUUID();
  }

  let sessionId = createSessionId();

  // ── XSS-safe rendering ──────────────────────────────────────────
  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function isValidUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch { return false; }
  }

  function renderMarkdown(text) {
    let html = escapeHtml(text);
    // Bold **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic *text*
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
      if (isValidUrl(url)) {
        return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
      }
      return text;
    });
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  /**
   * Parse [CARD: {...}] blocks in text. Returns HTML with cards rendered.
   * Must be called on raw text BEFORE renderMarkdown (cards are extracted first).
   */
  function renderWithCards(text) {
    var cardRegex = /\[CARD:\s*(\{[\s\S]*?\})\]/g;
    var parts = [];
    var lastIndex = 0;
    var match;

    while ((match = cardRegex.exec(text)) !== null) {
      // Render text before the card
      var before = text.substring(lastIndex, match.index).trim();
      if (before) parts.push(renderMarkdown(before));

      // Parse card JSON
      try {
        var card = JSON.parse(match[1]);
        var cardHtml = '<div class="ia-card ' + UID + '-card">';
        if (card.title) cardHtml += '<div class="ia-card-title">' + escapeHtml(card.title) + '</div>';
        if (card.text) cardHtml += '<div class="ia-card-body">' + renderMarkdown(card.text) + '</div>';
        if (card.link && card.linkLabel) {
          cardHtml += '<a class="ia-card-link" href="' + escapeHtml(card.link) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(card.linkLabel) + '</a>';
        }
        if (card.cta) {
          cardHtml += '<button class="ia-card-cta" data-cta="' + escapeHtml(card.cta) + '">' + escapeHtml(card.cta) + '</button>';
        }
        cardHtml += '</div>';
        parts.push(cardHtml);
      } catch (e) {
        // Malformed JSON — render as text
        parts.push(renderMarkdown(match[0]));
      }
      lastIndex = match.index + match[0].length;
    }

    // Remaining text after last card
    var after = text.substring(lastIndex).trim();
    if (after) parts.push(renderMarkdown(after));

    return parts.join('');
  }

  /**
   * Apply card rendering to a message element + bind CTA click handlers.
   */
  function renderCardsInElement(el, text) {
    if (text.indexOf('[CARD:') === -1) {
      el.innerHTML = renderMarkdown(text);
      return;
    }
    el.innerHTML = renderWithCards(text);
    // Bind CTA buttons
    var ctaBtns = el.querySelectorAll('.ia-card-cta');
    for (var i = 0; i < ctaBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          sendMessage(btn.getAttribute('data-cta'));
        });
      })(ctaBtns[i]);
    }
  }

  // ── Unique ID for multiple widgets ──────────────────────────────
  const UID = 'ia-' + Math.random().toString(36).substring(2, 8);

  // ── Resolve base URL for loading theme assets ───────────────────
  const SCRIPT_BASE = script.src.substring(0, script.src.lastIndexOf('/') + 1);

  // ── CSS ─────────────────────────────────────────────────────────
  const style = document.createElement('style');

  // ── Card CSS (shared across base and themed modes) ──────────────
  var cardCss = [
    '.' + UID + '-card {',
    '  border: 1px solid var(--ia-card-border, #ddd); border-radius: 12px;',
    '  padding: 14px 16px; margin: 8px 0; background: var(--ia-card-bg, #fff);',
    '}',
    '.' + UID + '-card .ia-card-title {',
    '  font-weight: 700; font-size: 15px; margin-bottom: 8px;',
    '  color: var(--ia-card-title-color, #222);',
    '}',
    '.' + UID + '-card .ia-card-body {',
    '  font-size: 13px; line-height: 1.5; color: var(--ia-card-body-color, #444);',
    '}',
    '.' + UID + '-card .ia-card-cta {',
    '  display: inline-block; margin-top: 10px; padding: 8px 16px;',
    '  border-radius: 20px; border: 1px solid ' + COLOR + ';',
    '  background: ' + COLOR + '; color: #fff; font-size: 13px;',
    '  cursor: pointer; transition: opacity 0.15s;',
    '}',
    '.' + UID + '-card .ia-card-cta:hover { opacity: 0.85; }',
    '.' + UID + '-card .ia-card-link {',
    '  display: inline-block; margin-top: 10px; padding: 8px 16px;',
    '  border-radius: 20px; border: 1px solid ' + COLOR + ';',
    '  background: transparent; color: ' + COLOR + '; font-size: 13px;',
    '  text-decoration: none; transition: all 0.15s;',
    '}',
    '.' + UID + '-card .ia-card-link:hover { background: ' + COLOR + '; color: #fff; }',
  ].join('\n');

  if (THEME) {
    // Themed mode: minimal positioning CSS — theme handles all visual styling
    style.textContent = [
      '#' + UID + '-bubble {',
      '  position: fixed; bottom: 20px; ' + POSITION + ': 20px; z-index: 99999;',
      '  width: 60px; height: 60px; border-radius: 50%;',
      '  background: ' + COLOR + '; color: #fff; border: none; cursor: pointer;',
      '  box-shadow: 0 4px 12px rgba(0,0,0,0.2);',
      '  display: flex; align-items: center; justify-content: center;',
      '  font-size: 24px; transition: transform 0.2s;',
      '}',
      '#' + UID + '-bubble:hover { transform: scale(1.1); }',
      '#' + UID + '-panel {',
      '  position: fixed; bottom: 90px; ' + POSITION + ': 20px; z-index: 99999;',
      '  opacity: 0; transform: translateY(12px) scale(0.97);',
      '  pointer-events: none;',
      '  transition: opacity 200ms ease-in, transform 200ms ease-in;',
      '}',
      '#' + UID + '-panel.open {',
      '  opacity: 1; transform: translateY(0) scale(1);',
      '  pointer-events: auto;',
      '  transition: opacity 250ms ease-out, transform 250ms ease-out;',
      '}',
      '@media (max-width: 480px) {',
      '  #' + UID + '-bubble { bottom: 12px; ' + POSITION + ': 12px; }',
      '}',
    ].join('\n');
  } else {
    // Base mode: full backward-compatible inline CSS
    style.textContent = [
      '#' + UID + '-bubble {',
      '  position: fixed; bottom: 20px; ' + POSITION + ': 20px; z-index: 99999;',
      '  width: 60px; height: 60px; border-radius: 50%;',
      '  background: ' + COLOR + '; color: #fff; border: none; cursor: pointer;',
      '  box-shadow: 0 4px 12px rgba(0,0,0,0.2);',
      '  display: flex; align-items: center; justify-content: center;',
      '  font-size: 24px; transition: transform 0.2s;',
      '}',
      '#' + UID + '-bubble:hover { transform: scale(1.1); }',
      '#' + UID + '-panel {',
      '  position: fixed; bottom: 90px; ' + POSITION + ': 20px; z-index: 99999;',
      '  width: 380px; max-width: calc(100vw - 40px); height: 520px; max-height: calc(100vh - 120px);',
      '  background: #fff; border-radius: 16px;',
      '  box-shadow: 0 8px 32px rgba(0,0,0,0.15);',
      '  display: none; flex-direction: column; overflow: hidden;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '}',
      '#' + UID + '-panel.open { display: flex; }',
      '#' + UID + '-container { display: flex; flex-direction: column; flex: 1; min-height: 0; }',
      '#' + UID + '-main-chat { display: flex; flex-direction: column; flex: 1; min-height: 0; }',
      '#' + UID + '-header {',
      '  background: ' + COLOR + '; color: #fff; padding: 16px;',
      '  display: flex; justify-content: space-between; align-items: center;',
      '}',
      '#' + UID + '-header-text h3 { margin: 0; font-size: 16px; font-weight: 600; }',
      '#' + UID + '-header-text p { margin: 2px 0 0; font-size: 12px; opacity: 0.85; }',
      '#' + UID + '-close {',
      '  background: none; border: none; color: #fff; font-size: 20px;',
      '  cursor: pointer; padding: 4px 8px; border-radius: 4px;',
      '}',
      '#' + UID + '-close:hover { background: rgba(255,255,255,0.2); }',
      '#' + UID + '-messages {',
      '  flex: 1; overflow-y: auto; padding: 16px; display: flex;',
      '  flex-direction: column; gap: 12px;',
      '}',
      '#' + UID + '-welcome { display: none; }',
      '.' + UID + '-msg {',
      '  max-width: 85%; padding: 10px 14px; border-radius: 14px;',
      '  font-size: 14px; line-height: 1.5; word-wrap: break-word;',
      '}',
      '.' + UID + '-msg a { color: inherit; text-decoration: underline; }',
      '.' + UID + '-msg-user {',
      '  align-self: flex-end; background: ' + COLOR + '; color: #fff;',
      '  border-bottom-right-radius: 4px;',
      '}',
      '.' + UID + '-msg-assistant {',
      '  align-self: flex-start; background: #f0f0f0; color: #333;',
      '  border-bottom-left-radius: 4px;',
      '}',
      '.' + UID + '-chips {',
      '  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;',
      '}',
      '.' + UID + '-chip {',
      '  display: inline-block; padding: 6px 12px; border-radius: 16px;',
      '  border: 1px solid ' + COLOR + '; color: ' + COLOR + '; background: #fff;',
      '  font-size: 13px; cursor: pointer; transition: all 0.15s;',
      '}',
      '.' + UID + '-chip:hover { background: ' + COLOR + '; color: #fff; }',
      '.' + UID + '-typing {',
      '  align-self: flex-start; padding: 12px 16px; background: #f0f0f0;',
      '  border-radius: 14px; display: none; gap: 4px; align-items: center;',
      '}',
      '.' + UID + '-typing span {',
      '  width: 8px; height: 8px; background: #999; border-radius: 50%;',
      '  animation: ' + UID + '-bounce 1.2s infinite;',
      '}',
      '.' + UID + '-typing span:nth-child(2) { animation-delay: 0.2s; }',
      '.' + UID + '-typing span:nth-child(3) { animation-delay: 0.4s; }',
      '@keyframes ' + UID + '-bounce {',
      '  0%, 60%, 100% { transform: translateY(0); }',
      '  30% { transform: translateY(-6px); }',
      '}',
      '#' + UID + '-input-area {',
      '  display: flex; padding: 12px; border-top: 1px solid #eee; gap: 8px;',
      '}',
      '#' + UID + '-input {',
      '  flex: 1; border: 1px solid #ddd; border-radius: 20px; padding: 10px 16px;',
      '  font-size: 14px; outline: none; font-family: inherit;',
      '}',
      '#' + UID + '-input:focus { border-color: ' + COLOR + '; }',
      '#' + UID + '-send {',
      '  background: ' + COLOR + '; color: #fff; border: none; border-radius: 50%;',
      '  width: 40px; height: 40px; cursor: pointer; font-size: 18px;',
      '  display: flex; align-items: center; justify-content: center;',
      '}',
      '#' + UID + '-send:disabled { opacity: 0.5; cursor: default; }',
      '@media (max-width: 480px) {',
      '  #' + UID + '-panel { width: calc(100vw - 20px); height: calc(100vh - 100px); ' + POSITION + ': 10px; bottom: 80px; }',
      '  #' + UID + '-bubble { bottom: 12px; ' + POSITION + ': 12px; }',
      '}',
    ].join('\n');
  }
  style.textContent += '\n' + cardCss;
  document.head.appendChild(style);

  // ── DOM ─────────────────────────────────────────────────────────
  const isPopup = MODE === 'popup';

  // Bubble (popup only, hidden when open=true)
  let bubble;
  if (isPopup && !OPEN) {
    bubble = document.createElement('button');
    bubble.id = UID + '-bubble';
    bubble.className = 'ia-bubble';
    bubble.setAttribute('aria-label', S.open);
    bubble.innerHTML = '&#128172;'; // speech balloon
    document.body.appendChild(bubble);
  }

  // Panel
  const panel = document.createElement('div');
  panel.id = UID + '-panel';
  panel.className = 'ia-panel';
  if (THEME) panel.setAttribute('data-theme', THEME);

  if (!isPopup) {
    panel.classList.add('open');
    panel.style.position = 'relative';
    panel.style.bottom = 'auto';
    panel.style[POSITION] = 'auto';
    panel.style.width = '100%';
    panel.style.height = '100%';
  } else if (OPEN) {
    panel.classList.add('open');
  }

  panel.innerHTML = [
    '<div class="ia-app-container" id="' + UID + '-container">',
    '  <div class="ia-main-chat" id="' + UID + '-main-chat">',
    '    <div class="ia-header" id="' + UID + '-header">',
    '      <div class="ia-header-text" id="' + UID + '-header-text">',
    '        <h3>' + escapeHtml(TITLE) + '</h3>',
             SUBTITLE ? '<p>' + escapeHtml(SUBTITLE) + '</p>' : '',
    '      </div>',
             isPopup ? '<button class="ia-close" id="' + UID + '-close" aria-label="' + S.close + '">&times;</button>' : '',
    '    </div>',
    '    <div class="ia-messages" id="' + UID + '-messages">',
    '      <div class="ia-welcome" id="' + UID + '-welcome"></div>',
    '      <div class="ia-typing ' + UID + '-typing" id="' + UID + '-typing"><span></span><span></span><span></span></div>',
    '    </div>',
    '    <div class="ia-input-area" id="' + UID + '-input-area">',
    '      <input class="ia-input" id="' + UID + '-input" type="text" placeholder="' + escapeHtml(PLACEHOLDER) + '" maxlength="2000" autocomplete="off">',
    '      <button class="ia-send" id="' + UID + '-send" aria-label="' + S.send + '">&#10148;</button>',
    '    </div>',
    '  </div>',
    '</div>',
  ].join('\n');

  if (isPopup) {
    document.body.appendChild(panel);
  } else {
    // Embedded mode: render inside parent element
    const target = script.parentElement;
    target.appendChild(panel);
  }

  // ── DOM references ──────────────────────────────────────────────
  const containerEl  = document.getElementById(UID + '-container');
  const mainChatEl   = document.getElementById(UID + '-main-chat');
  const headerEl     = document.getElementById(UID + '-header');
  const headerTextEl = document.getElementById(UID + '-header-text');
  const messagesEl   = document.getElementById(UID + '-messages');
  const welcomeEl    = document.getElementById(UID + '-welcome');
  const typingEl     = document.getElementById(UID + '-typing');
  const inputEl      = document.getElementById(UID + '-input');
  const sendBtn      = document.getElementById(UID + '-send');
  const closeBtn     = document.getElementById(UID + '-close');

  // ── State ───────────────────────────────────────────────────────
  let isSending = false;

  // ── Functions ───────────────────────────────────────────────────
  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideWelcome() {
    if (welcomeEl && welcomeEl.children.length > 0) {
      welcomeEl.style.display = 'none';
    }
  }

  function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = 'ia-msg ia-msg-' + role + ' ' + UID + '-msg ' + UID + '-msg-' + role;
    div.setAttribute('data-time', Date.now());
    div.innerHTML = role === 'assistant' ? renderMarkdown(text) : escapeHtml(text);
    messagesEl.insertBefore(div, typingEl);
    scrollToBottom();
    return div;
  }

  function addChips(chips, container) {
    if (!chips || !chips.length) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'ia-chips ' + UID + '-chips';
    chips.forEach(function (chip) {
      const btn = document.createElement('button');
      btn.className = 'ia-chip ' + UID + '-chip';
      btn.textContent = chip;
      btn.addEventListener('click', function () { sendMessage(chip); });
      wrapper.appendChild(btn);
    });
    container ? container.after(wrapper) : messagesEl.insertBefore(wrapper, typingEl);
    scrollToBottom();
  }

  function showTyping() { typingEl.style.display = 'flex'; scrollToBottom(); }
  function hideTyping() { typingEl.style.display = 'none'; }

  async function sendMessage(text, opts) {
    if (isSending || !text.trim()) return;
    isSending = true;
    sendBtn.disabled = true;
    inputEl.value = '';

    // Hide welcome state on first user message
    hideWelcome();

    addMessage('user', text.trim());
    showTyping();

    try {
      const payload = {
        message: text.trim(),
        sessionId: sessionId,
        lang: LANG,
        stream: true,
      };
      if (PERSONA) payload.persona = PERSONA;
      if (opts) { Object.keys(opts).forEach(function (k) { payload[k] = opts[k]; }); }

      var fetchRes = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-correlation-id': sessionId,
          'x-infoagent-client': 'widget',
        },
        body: JSON.stringify(payload),
      });

      hideTyping();

      if (!fetchRes.ok) {
        addMessage('assistant', S.error);
        return;
      }

      var contentType = fetchRes.headers.get('content-type') || '';

      if (contentType.indexOf('text/event-stream') !== -1) {
        // ── SSE streaming path ──────────────────────────────
        var msgEl = addMessage('assistant', '');
        var fullText = '';
        var reader = fetchRes.body.getReader();
        var decoder = new TextDecoder();
        var sseBuffer = '';

        var gotDone = false;

        while (true) {
          var chunk = await reader.read();
          if (chunk.done) break;
          sseBuffer += decoder.decode(chunk.value, { stream: true });

          var sseLines = sseBuffer.split('\n');
          sseBuffer = sseLines.pop();

          for (var li = 0; li < sseLines.length; li++) {
            var sseLine = sseLines[li].trim();
            if (!sseLine || sseLine.indexOf('data: ') !== 0) continue;
            try {
              var evt = JSON.parse(sseLine.slice(6));
              if (evt.token) {
                fullText += evt.token;
                msgEl.innerHTML = renderMarkdown(fullText);
                scrollToBottom();
              }
              if (evt.done) {
                gotDone = true;
                // Strip SUGGESTED_ACTIONS tag from visible text
                fullText = fullText.replace(/\s*SUGGESTED_ACTIONS:.*$/s, '');
                renderCardsInElement(msgEl, fullText);
                addChips(evt.suggestedActions, msgEl);
              }
              if (evt.error) {
                msgEl.innerHTML = renderMarkdown(fullText || S.error);
              }
            } catch (e) { /* skip malformed SSE */ }
          }
        }

        // If stream ended without a done event, clean up partial text
        if (!gotDone && fullText) {
          fullText = fullText.replace(/\s*SUGGESTED_ACTIONS:.*$/s, '');
          renderCardsInElement(msgEl, fullText + '\n\n...');
          scrollToBottom();
        }
      } else {
        // ── JSON fallback path (non-streaming) ──────────────
        var data = await fetchRes.json();
        if (data.sessionId) sessionId = data.sessionId;
        var msgEl = addMessage('assistant', '');
        renderCardsInElement(msgEl, data.answer || S.error);
        addChips(data.suggestedActions, msgEl);
      }
    } catch (err) {
      hideTyping();
      addMessage('assistant', S.error);
    } finally {
      isSending = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  // ── Events ──────────────────────────────────────────────────────
  sendBtn.addEventListener('click', function () { sendMessage(inputEl.value); });
  inputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendMessage(inputEl.value); });

  if (isPopup) {
    if (bubble) {
      bubble.addEventListener('click', function () {
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) inputEl.focus();
      });
    }
    if (closeBtn) closeBtn.addEventListener('click', function () { panel.classList.remove('open'); });
  }

  // ── Welcome message + chips ─────────────────────────────────────
  // Base mode: render welcome as simple message bubble (backward compatible)
  // Themed mode: theme handles welcome rendering via the context hook
  if (!THEME) {
    if (WELCOME) {
      const msgEl = addMessage('assistant', WELCOME);
      addChips(welcomeChips, msgEl);
    } else if (welcomeChips.length) {
      addChips(welcomeChips);
    }
  }

  // ── Theme loading ─────────────────────────────────────────────
  if (THEME) {
    var themeCtx = {
      UID: UID,
      panel: panel,
      container: containerEl,
      mainChat: mainChatEl,
      header: headerEl,
      headerText: headerTextEl,
      messages: messagesEl,
      welcome: welcomeEl,
      inputArea: document.getElementById(UID + '-input-area'),
      typing: typingEl,
      input: inputEl,
      sendBtn: sendBtn,
      closeBtn: closeBtn,
      bubble: bubble,
      sendMessage: sendMessage,
      addMessage: addMessage,
      addChips: addChips,
      hideWelcome: hideWelcome,
      scrollToBottom: scrollToBottom,
      escapeHtml: escapeHtml,
      renderMarkdown: renderMarkdown,
      renderCardsInElement: renderCardsInElement,
      config: {
        TITLE: TITLE,
        SUBTITLE: SUBTITLE,
        WELCOME: WELCOME,
        welcomeChips: welcomeChips,
        COLOR: COLOR,
        POSITION: POSITION,
        LANG: LANG,
        PLACEHOLDER: PLACEHOLDER,
        PERSONA: PERSONA,
        MODE: MODE,
        API_URL: CHAT_URL,
        SCRIPT_BASE: SCRIPT_BASE,
      },
      strings: S,
    };

    // Load theme script dynamically
    var themeScript = document.createElement('script');
    themeScript.src = SCRIPT_BASE + 'theme-' + THEME + '.js';
    themeScript.onload = function () {
      if (window.__ia_themes && typeof window.__ia_themes[THEME] === 'function') {
        window.__ia_themes[THEME](themeCtx);
      }
    };
    themeScript.onerror = function () {
      console.warn('[infoagent] Theme "' + THEME + '" failed to load, falling back to base');
      // Fallback: render base welcome
      if (WELCOME) {
        var msgEl = addMessage('assistant', WELCOME);
        addChips(welcomeChips, msgEl);
      } else if (welcomeChips.length) {
        addChips(welcomeChips);
      }
    };
    document.head.appendChild(themeScript);
  }

  // ── postMessage listener for live color updates ──────────────────
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'setColor') return;
    var hex = e.data.color;
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;

    // Convert hex to HSL, derive hover and sidebar variants
    function hexToHsl(h) {
      var r = parseInt(h.slice(1,3),16)/255;
      var g = parseInt(h.slice(3,5),16)/255;
      var b = parseInt(h.slice(5,7),16)/255;
      var max = Math.max(r,g,b), min = Math.min(r,g,b);
      var hue, sat, lig = (max+min)/2;
      if (max === min) { hue = sat = 0; }
      else {
        var d = max - min;
        sat = lig > 0.5 ? d/(2-max-min) : d/(max+min);
        if (max === r) hue = ((g-b)/d + (g<b?6:0))/6;
        else if (max === g) hue = ((b-r)/d+2)/6;
        else hue = ((r-g)/d+4)/6;
      }
      return [Math.round(hue*360), Math.round(sat*100), Math.round(lig*100)];
    }

    var hsl = hexToHsl(hex);
    var hoverL = Math.max(0, hsl[2] - 10);
    var sidebarL = 12;

    panel.style.setProperty('--primary', hex);
    panel.style.setProperty('--primary-hover', 'hsl('+hsl[0]+','+hsl[1]+'%,'+hoverL+'%)');
    panel.style.setProperty('--user-msg-bg', hex);
    panel.style.setProperty('--sidebar-bg', 'hsl('+hsl[0]+','+Math.min(hsl[1],60)+'%,'+sidebarL+'%)');
  });

  } // end boot()

  // ── Bootstrap: local config or remote fetch ─────────────────────
  if (needsRemoteConfig) {
    var lang = script.getAttribute('data-lang') || 'it';
    fetch(CONFIG_URL + '?lang=' + encodeURIComponent(lang))
      .then(function (r) { return r.json(); })
      .then(function (remote) { boot(mergeConfig(remote)); })
      .catch(function () {
        console.warn('[infoagent] Failed to fetch widget-config, using defaults');
        boot(readLocalConfig());
      });
  } else {
    boot(readLocalConfig());
  }
})();
