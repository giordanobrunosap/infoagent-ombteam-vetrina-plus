(function () {
  'use strict';

  if (!window.__ia_themes) window.__ia_themes = {};

  window.__ia_themes.cadillac = function (ctx) {
    var panel      = ctx.panel;
    var container  = ctx.container;
    var mainChat   = ctx.mainChat;
    var header     = ctx.header;
    var messages   = ctx.messages;
    var welcome    = ctx.welcome;
    var inputArea  = ctx.inputArea;
    var sendMessage = ctx.sendMessage;
    var escapeHtml  = ctx.escapeHtml;
    var config     = ctx.config;
    var TITLE      = config.TITLE;
    var WELCOME    = config.WELCOME;
    var welcomeChips = config.welcomeChips;
    var SCRIPT_BASE  = config.SCRIPT_BASE;
    var LANG       = config.LANG || 'it';

    // ── Load Inter font ───────────────────────────────────────────
    var fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap';
    document.head.appendChild(fontLink);

    // ── Load Phosphor Icons ───────────────────────────────────────
    var phosphor = document.createElement('script');
    phosphor.src = 'https://unpkg.com/@phosphor-icons/web';
    document.head.appendChild(phosphor);

    // ── Load theme CSS ────────────────────────────────────────────
    var cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = SCRIPT_BASE + 'theme-cadillac.css';
    document.head.appendChild(cssLink);

    // ── Load theme locale and build UI ────────────────────────────
    var localeUrl = SCRIPT_BASE + 'locales/theme-' + LANG + '.json';
    var fallbackUrl = SCRIPT_BASE + 'locales/theme-it.json';

    function loadLocale(url, cb) {
      fetch(url).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      }).then(cb).catch(function () {
        if (url !== fallbackUrl) {
          fetch(fallbackUrl).then(function (r) { return r.json(); }).then(cb).catch(function () { cb({}); });
        } else {
          cb({});
        }
      });
    }

    loadLocale(localeUrl, function (T) {
      var h = T.header || {};
      var s = T.sidebar || {};
      var w = T.welcome || {};
      var d = T.disclaimer || '';
      var x = T.export || {};

      buildUI(h, s, w, d, x);
    });

    function buildUI(h, s, w, d, x) {

      // ── Rebuild header ──────────────────────────────────────────
      header.innerHTML = [
        '<div class="ia-bot-info">',
        '  <button class="ia-hamburger" aria-label="Menu"><i class="ph ph-list"></i></button>',
        '  <div class="ia-bot-avatar">',
        '    <i class="ph ph-robot"></i>',
        '  </div>',
        '  <div>',
        '    <div class="ia-bot-name">' + escapeHtml(TITLE) + '</div>',
        '    <div class="ia-bot-status">',
        '      <span class="ia-status-dot"></span> ' + escapeHtml(h.status || 'Online'),
        '    </div>',
        '  </div>',
        '</div>',
        '<div class="ia-header-actions">',
        '  <button class="ia-btn-icon ia-btn-context" title="' + escapeHtml(h.copy_title || '') + '">',
        '    <i class="ph ph-files"></i>',
        '  </button>',
        '  <button class="ia-btn-icon ia-btn-download" title="' + escapeHtml(h.download_title || '') + '">',
        '    <i class="ph ph-download-simple"></i>',
        '  </button>',
        config.MODE === 'popup'
          ? '  <button class="ia-btn-icon ia-close-btn" title="' + escapeHtml(h.close_title || '') + '"><i class="ph ph-x"></i></button>'
          : '',
        '</div>',
      ].join('\n');

      // Wire close button for popup mode
      if (config.MODE === 'popup') {
        var closeBtn = header.querySelector('.ia-close-btn');
        if (closeBtn) {
          closeBtn.addEventListener('click', function () {
            panel.classList.remove('open');
          });
        }
      }

      // ── Inject sidebar ──────────────────────────────────────────
      var sidebar = document.createElement('aside');
      sidebar.className = 'ia-sidebar';
      sidebar.innerHTML = [
        '<div class="ia-sidebar-brand">',
        '  <div class="ia-sidebar-brand-icon">',
        '    <i class="ph ph-robot"></i>',
        '  </div>',
        '  <div class="ia-sidebar-brand-text">',
        '    <span class="ia-sidebar-brand-name">' + escapeHtml(TITLE) + '</span>',
        '    <span class="ia-sidebar-brand-sub">' + escapeHtml(s.brand_sub || '') + '</span>',
        '  </div>',
        '</div>',
        '',
        '<div class="ia-sidebar-section">',
        '  <div class="ia-sidebar-label">' + escapeHtml(s.section_label || '') + '</div>',
        '  <nav class="ia-sidebar-nav">',
        '    <button class="ia-sidebar-item active" data-action="chat">',
        '      <i class="ph ph-chat-teardrop-text"></i>',
        '      <span>' + escapeHtml(s.chat_label || '') + '</span>',
        '    </button>',
        '    <button class="ia-sidebar-item" data-action="send" data-message="' + escapeHtml(s.contacts_msg || '') + '">',
        '      <i class="ph ph-phone"></i>',
        '      <span>' + escapeHtml(s.contacts_label || '') + '</span>',
        '    </button>',
        '    <button class="ia-sidebar-item" data-action="send" data-message="' + escapeHtml(s.recap_msg || '') + '" data-start-recap="true">',
        '      <i class="ph ph-envelope-simple"></i>',
        '      <span>' + escapeHtml(s.recap_label || '') + '</span>',
        '    </button>',
        '  </nav>',
        '</div>',
        '',
        '<div class="ia-sidebar-footer">',
        '  <i class="ph ph-shield-check"></i>',
        '  <span>' + escapeHtml(s.footer || '') + '</span>',
        '</div>',
      ].join('\n');

      // Insert sidebar before main-chat inside container
      container.insertBefore(sidebar, mainChat);

      // ── Mobile sidebar backdrop ───────────────────────────────
      var backdrop = document.createElement('div');
      backdrop.className = 'ia-sidebar-backdrop';
      container.appendChild(backdrop);

      function openMobileSidebar() {
        sidebar.classList.add('ia-sidebar-open');
        backdrop.classList.add('ia-sidebar-backdrop-visible');
      }

      function closeMobileSidebar() {
        sidebar.classList.remove('ia-sidebar-open');
        backdrop.classList.remove('ia-sidebar-backdrop-visible');
      }

      // Hamburger opens sidebar
      var hamburgerBtn = header.querySelector('.ia-hamburger');
      if (hamburgerBtn) {
        hamburgerBtn.addEventListener('click', function () {
          if (sidebar.classList.contains('ia-sidebar-open')) {
            closeMobileSidebar();
          } else {
            openMobileSidebar();
          }
        });
      }

      // Tap backdrop closes sidebar
      backdrop.addEventListener('click', closeMobileSidebar);

      // ── Sidebar click handlers ──────────────────────────────────
      sidebar.addEventListener('click', function (e) {
        var item = e.target.closest('.ia-sidebar-item');
        if (!item) return;

        // Update active state
        sidebar.querySelectorAll('.ia-sidebar-item').forEach(function (el) {
          el.classList.remove('active');
        });
        item.classList.add('active');

        // Close sidebar on mobile after selection
        closeMobileSidebar();

        var action = item.getAttribute('data-action');
        if (action === 'send') {
          var msg = item.getAttribute('data-message');
          if (msg) {
            var opts = { exitInterview: true };
            if (item.getAttribute('data-start-interview') === 'true') opts.startInterview = true;
            if (item.getAttribute('data-start-recap') === 'true') opts.startRecap = true;
            sendMessage(msg, opts);
          }
        } else if (action === 'chat') {
          // Reset: clear messages, show welcome again
          messages.querySelectorAll('.ia-msg, .ia-chips').forEach(function (el) {
            el.remove();
          });
          welcome.style.display = 'flex';
        }
      });

      // ── Build welcome state ─────────────────────────────────────
      var welcomeTitle = w.title || 'Come posso aiutarti?';
      var welcomeSub = WELCOME
        || (w.sub_fallback || '').replace('${TITLE}', TITLE);

      var chips = welcomeChips.length
        ? welcomeChips
        : (w.default_chips || []);

      var highlightKw = (w.highlight_keyword || '').toLowerCase();

      var chipsHtml = chips.map(function (chip) {
        var isHighlight = highlightKw && chip.toLowerCase().indexOf(highlightKw) !== -1;
        return '<button class="ia-welcome-chip' + (isHighlight ? ' ia-welcome-chip-highlight' : '') + '">'
          + escapeHtml(chip) + '</button>';
      }).join('');

      welcome.innerHTML = [
        '<div class="ia-welcome-icon">',
        '  <i class="ph ph-sparkle"></i>',
        '</div>',
        '<h2 class="ia-welcome-title">' + escapeHtml(welcomeTitle) + '</h2>',
        '<p class="ia-welcome-sub">' + escapeHtml(welcomeSub) + '</p>',
        '<div class="ia-welcome-chips">',
        '  ' + chipsHtml,
        '</div>',
      ].join('\n');
      welcome.style.display = 'flex';

      // Welcome chip click handlers
      welcome.querySelectorAll('.ia-welcome-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          var opts = {};
          if (chip.classList.contains('ia-welcome-chip-highlight')) opts.startInterview = true;
          sendMessage(chip.textContent, opts);
        });
      });

      // ── Add disclaimer after input area ─────────────────────────
      var disclaimer = document.createElement('div');
      disclaimer.className = 'ia-disclaimer';
      disclaimer.innerHTML = '<i class="ph ph-shield-check"></i> ' + escapeHtml(d);
      inputArea.after(disclaimer);

      // ── Toast helper ────────────────────────────────────────────
      function showToast(text) {
        var existing = mainChat.querySelector('.ia-toast');
        if (existing) existing.remove();
        var toast = document.createElement('div');
        toast.className = 'ia-toast';
        toast.textContent = text;
        mainChat.appendChild(toast);
        setTimeout(function () { toast.classList.add('ia-toast-visible'); }, 10);
        setTimeout(function () {
          toast.classList.remove('ia-toast-visible');
          setTimeout(function () { toast.remove(); }, 300);
        }, 2500);
      }

      // ── Collect messages from DOM ───────────────────────────────
      function collectMessages() {
        var msgs = [];
        messages.querySelectorAll('.ia-msg').forEach(function (el) {
          var isUser = el.classList.contains('ia-msg-user');
          var role = isUser ? (x.role_user || 'Utente') : (x.role_assistant || 'InfoAgent');
          var ts = parseInt(el.getAttribute('data-time'), 10);
          var date = ts ? new Date(ts) : new Date();
          var hh = String(date.getHours()).padStart(2, '0');
          var mm = String(date.getMinutes()).padStart(2, '0');
          msgs.push({ role: role, time: hh + ':' + mm, text: el.textContent.trim() });
        });
        return msgs;
      }

      // ── Format conversation as text ─────────────────────────────
      function formatConversation(msgs) {
        var now = new Date();
        var dd = String(now.getDate()).padStart(2, '0');
        var mo = String(now.getMonth() + 1).padStart(2, '0');
        var yyyy = now.getFullYear();
        var hh = String(now.getHours()).padStart(2, '0');
        var mm = String(now.getMinutes()).padStart(2, '0');
        var dateLine = dd + '/' + mo + '/' + yyyy + ' ' + hh + ':' + mm;

        var lines = [];
        lines.push('====================================');
        lines.push(TITLE + ' \u2014 ' + (x.header || 'Conversazione'));
        lines.push((x.date_label || 'Data:') + ' ' + dateLine);
        lines.push('====================================');
        lines.push('');

        msgs.forEach(function (m) {
          lines.push('[' + m.role + '] ' + m.time);
          lines.push(m.text);
          lines.push('');
        });

        lines.push('====================================');
        lines.push(x.footer || 'Esportato da Infoagent');
        lines.push('====================================');
        return lines.join('\n');
      }

      // ── Download button handler ─────────────────────────────────
      var downloadBtn = header.querySelector('.ia-btn-download');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', function () {
          var msgs = collectMessages();
          if (msgs.length === 0) {
            showToast(x.no_messages_download || 'Nessun messaggio da esportare');
            return;
          }
          var text = formatConversation(msgs);
          var now = new Date();
          var yyyy = now.getFullYear();
          var mo = String(now.getMonth() + 1).padStart(2, '0');
          var dd = String(now.getDate()).padStart(2, '0');
          var filename = (x.filename_prefix || 'conversazione-') + yyyy + '-' + mo + '-' + dd + '.txt';

          var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        });
      }

      // ── Context (clipboard) button handler ──────────────────────
      var contextBtn = header.querySelector('.ia-btn-context');
      if (contextBtn) {
        contextBtn.addEventListener('click', function () {
          var msgs = collectMessages();
          if (msgs.length === 0) {
            showToast(x.no_messages_copy || 'Nessun messaggio da copiare');
            return;
          }

          var now = new Date();
          var dd = String(now.getDate()).padStart(2, '0');
          var mo = String(now.getMonth() + 1).padStart(2, '0');
          var yyyy = now.getFullYear();
          var hh = String(now.getHours()).padStart(2, '0');
          var mm = String(now.getMinutes()).padStart(2, '0');
          var dateLine = dd + '/' + mo + '/' + yyyy + ' ' + hh + ':' + mm;

          var clipLines = [];
          clipLines.push((x.clipboard_header || 'Conversazione con') + ' ' + TITLE);
          clipLines.push((x.date_label || 'Data:') + ' ' + dateLine);
          clipLines.push((x.clipboard_count || 'Messaggi:') + ' ' + msgs.length);
          clipLines.push('---');
          msgs.forEach(function (m) {
            clipLines.push('[' + m.role + '] ' + m.time);
            clipLines.push(m.text);
            clipLines.push('');
          });
          var clipText = clipLines.join('\n');

          function showCopied() {
            showToast(x.copied_toast || '\u2713 Copiato negli appunti');
          }

          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(clipText).then(showCopied).catch(function () {
              fallbackCopy(clipText);
              showCopied();
            });
          } else {
            fallbackCopy(clipText);
            showCopied();
          }
        });
      }

      // ── Clipboard fallback for http ─────────────────────────────
      function fallbackCopy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* ignore */ }
        document.body.removeChild(ta);
      }

    } // end buildUI
  };
})();
