(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const welcomeTemplate = $('#welcome').cloneNode(true);
  const state = {
    csrf: '',
    chats: [],
    activeChatId: null,
    messages: [],
    busy: false,
    abortController: null,
    attachedText: '',
    attachedName: '',
    models: [],
    speechRecognition: null,
    recording: false,
    confirmResolve: null,
  };

  const DEFAULTS = {
    model: 'llama-3.3-70b-versatile',
    systemPrompt: '日本語で、正確・親切・実用的に回答してください。不明点は推測せず明確にしてください。',
    assistantMode: 'game_dev',
    gameEngine: 'auto',
    gameTask: 'auto',
    projectContext: '',
    autoRead: false,
    temperature: 0.7,
    reasoning: 'high',
    historyLimit: 40,
    maxTokens: 8192,
  };

  function toast(message, duration = 2600) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), duration);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
  }

  async function api(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && state.csrf) {
      headers.set('X-CSRF-Token', state.csrf);
    }
    const response = await fetch(path, { ...options, method, headers, credentials: 'same-origin' });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const message = typeof payload === 'object' && payload ? payload.detail : String(payload || '通信エラー');
      const error = new Error(message || `HTTP ${response.status}`);
      error.status = response.status;
      if (response.status === 401 && path !== '/api/login') showLogin();
      throw error;
    }
    return payload;
  }

  function showLogin() {
    $('#appShell').hidden = true;
    $('#loginScreen').hidden = false;
    $('#loginPassword').value = '';
    $('#loginError').textContent = '';
    $('#loginPassword').focus();
  }

  function showApp() {
    $('#loginScreen').hidden = true;
    $('#appShell').hidden = false;
    $('#userInput').focus();
  }

  async function bootstrap() {
    try {
      const data = await fetch('/api/bootstrap', { credentials: 'same-origin' }).then((r) => r.json());
      state.csrf = data.csrf || '';
      document.title = `${data.app_name || 'YM-CORE X'} — AI Workspace`;
      $('#setupNotice').hidden = data.auth_configured;
      if (data.authenticated) {
        showApp();
        await initializeWorkspace(data.api_configured);
      } else {
        showLogin();
      }
    } catch (error) {
      showLogin();
      $('#loginError').textContent = `サーバーに接続できません: ${error.message}`;
    }
  }

  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = $('#loginPassword').value;
    $('#loginError').textContent = '';
    const submit = $('#loginForm button[type="submit"]');
    submit.disabled = true;
    try {
      const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
      state.csrf = result.csrf;
      showApp();
      await initializeWorkspace();
    } catch (error) {
      $('#loginError').textContent = error.message;
    } finally {
      submit.disabled = false;
      $('#loginPassword').value = '';
    }
  });

  async function initializeWorkspace(apiConfigured) {
    applyTheme(localStorage.getItem('ymcore-theme') || 'dark');
    loadSettings();
    await Promise.allSettled([loadHealth(apiConfigured), loadChats()]);
    await loadModels(false);
    renderMessages();
  }

  async function loadHealth(apiConfigured) {
    try {
      const health = await api('/api/health');
      const connected = Boolean(health.api_key_configured || apiConfigured);
      $('#statusDot').className = `status-dot ${connected ? 'online' : 'offline'}`;
      $('#statusText').textContent = connected ? 'サーバー接続済み · AI利用可能' : 'サーバー接続済み · APIキー未設定';
      $('#apiKeyStatus').textContent = connected ? '● サーバーにAI APIキーが設定されています' : '● GROQ_API_KEY が未設定です';
      $('#serverFoot').textContent = connected ? '会話はこのサーバーに保存されます' : 'サーバーにAPIキーを設定するとAIを利用できます';
      if (!connected) toast('Renderの環境変数（ローカルでは .env）に GROQ_API_KEY を設定してください', 5000);
    } catch (error) {
      $('#statusDot').className = 'status-dot offline';
      $('#statusText').textContent = 'サーバー状態を確認できません';
      $('#apiKeyStatus').textContent = 'API接続状態を確認できません';
    }
  }

  function loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('ymcore-settings') || '{}'); } catch { saved = {}; }
    if (saved.model === 'openai/gpt-5.4-nano') saved.model = DEFAULTS.model;
    if (saved.model === 'llama-3.3-70b-versatile' || String(saved.model || '').startsWith('openai/gpt-6')) saved.model = DEFAULTS.model;
    const settings = { ...DEFAULTS, ...saved };
    $('#systemPrompt').value = settings.systemPrompt;
    $('#assistantMode').value = settings.assistantMode;
    $('#gameEngine').value = settings.gameEngine;
    $('#gameTask').value = settings.gameTask;
    $('#projectContext').value = settings.projectContext;
    $('#autoRead').checked = Boolean(settings.autoRead);
    updateModeUI(settings.assistantMode);
    $('#temperature').value = settings.temperature;
    $('#tempValue').textContent = Number(settings.temperature).toFixed(1);
    $('#reasoningSelect').value = settings.reasoning;
    $('#historyLimit').value = String(settings.historyLimit);
    $('#maxTokens').value = String(settings.maxTokens);
    $('#modelSelect').dataset.savedModel = settings.model;
  }

  function getSettings() {
    return {
      model: $('#modelSelect').value || DEFAULTS.model,
      systemPrompt: $('#systemPrompt').value.trim() || DEFAULTS.systemPrompt,
      assistantMode: $('#assistantMode').value,
      gameEngine: $('#gameEngine').value,
      gameTask: $('#gameTask').value,
      projectContext: $('#projectContext').value.trim(),
      autoRead: $('#autoRead').checked,
      temperature: Number($('#temperature').value),
      reasoning: $('#reasoningSelect').value,
      historyLimit: Number($('#historyLimit').value),
      maxTokens: Number($('#maxTokens').value),
    };
  }

  function updateModeUI(mode) {
    const gameMode = mode === 'game_dev';
    $('#gameBrainFields').hidden = !gameMode;
    $('#modePill').textContent = gameMode ? 'GAME DEV BRAIN' : 'GENERAL MODE';
  }

  function saveSettings() {
    localStorage.setItem('ymcore-settings', JSON.stringify(getSettings()));
    $('#modelPill').textContent = $('#modelSelect').value;
    updateModeUI($('#assistantMode').value);
    closeSettings();
    toast('設定を保存しました');
  }

  function resetSettings() {
    $('#systemPrompt').value = DEFAULTS.systemPrompt;
    $('#assistantMode').value = DEFAULTS.assistantMode;
    $('#gameEngine').value = DEFAULTS.gameEngine;
    $('#gameTask').value = DEFAULTS.gameTask;
    $('#projectContext').value = DEFAULTS.projectContext;
    $('#autoRead').checked = DEFAULTS.autoRead;
    updateModeUI(DEFAULTS.assistantMode);
    $('#temperature').value = DEFAULTS.temperature;
    $('#tempValue').textContent = DEFAULTS.temperature.toFixed(1);
    $('#reasoningSelect').value = DEFAULTS.reasoning;
    $('#historyLimit').value = String(DEFAULTS.historyLimit);
    $('#maxTokens').value = String(DEFAULTS.maxTokens);
    const option = [...$('#modelSelect').options].find((item) => item.value === DEFAULTS.model);
    if (option) $('#modelSelect').value = DEFAULTS.model;
    localStorage.setItem('ymcore-settings', JSON.stringify(getSettings()));
    toast('初期設定に戻しました');
  }

  async function loadModels(showToast = true) {
    const button = $('#refreshModelsBtn');
    if (button) button.disabled = true;
    try {
      const result = await api('/api/models');
      state.models = result.models || [];
      const select = $('#modelSelect');
      const preferred = select.dataset.savedModel || select.value || DEFAULTS.model;
      select.replaceChildren();
      for (const model of state.models) {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name === model.id ? model.id : `${model.name} · ${model.id}`;
        select.append(option);
      }
      if (!state.models.some((model) => model.id === preferred)) {
        const fallback = document.createElement('option');
        fallback.value = preferred;
        fallback.textContent = `${preferred} (保存済み)`;
        select.add(fallback);
      }
      select.value = preferred;
      $('#modelHelp').textContent = `${state.models.length} モデルを取得しました。`;
      $('#modelPill').textContent = select.value;
      if (showToast) toast('モデル一覧を更新しました');
    } catch (error) {
      $('#modelHelp').textContent = `モデル一覧の取得に失敗: ${error.message}`;
      if (showToast) toast(error.message, 4000);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function loadChats() {
    try {
      state.chats = await api('/api/chats');
      renderSidebar();
      if (state.activeChatId && state.chats.some((chat) => chat.id === state.activeChatId)) {
        await openChat(state.activeChatId, false);
      } else if (state.chats.length) {
        await openChat(state.chats[0].id, false);
      } else {
        state.activeChatId = null;
        state.messages = [];
        renderMessages();
      }
    } catch (error) {
      toast(`履歴を読み込めません: ${error.message}`, 4000);
    }
  }

  function renderSidebar() {
    const list = $('#historyList');
    list.replaceChildren();
    const query = $('#historySearch').value.trim().toLocaleLowerCase();
    const filtered = state.chats.filter((chat) => !query || chat.title.toLocaleLowerCase().includes(query));
    $('#chatCount').textContent = String(state.chats.length);
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-history';
      empty.textContent = query ? '一致する会話がありません。' : 'まだ会話はありません。\n新しいチャットから始めましょう。';
      list.append(empty);
      return;
    }
    for (const chat of filtered) {
      const item = document.createElement('div');
      item.className = `history-item${chat.id === state.activeChatId ? ' active' : ''}`;
      item.setAttribute('role', 'button');
      item.tabIndex = 0;
      const icon = document.createElement('span'); icon.className = 'h-icon'; icon.textContent = '✧';
      const title = document.createElement('span'); title.className = 'h-title'; title.textContent = chat.title;
      const count = document.createElement('span'); count.className = 'h-count'; count.textContent = String(chat.message_count || 0);
      const actions = document.createElement('span'); actions.className = 'h-actions';
      const rename = document.createElement('button'); rename.className = 'h-action'; rename.title = '名前を変更'; rename.textContent = '✎';
      rename.addEventListener('click', (event) => { event.stopPropagation(); renameChat(chat); });
      const remove = document.createElement('button'); remove.className = 'h-action delete'; remove.title = '削除'; remove.textContent = '×';
      remove.addEventListener('click', (event) => { event.stopPropagation(); deleteChat(chat); });
      actions.append(rename, remove);
      item.append(icon, title, count, actions);
      item.addEventListener('click', () => openChat(chat.id));
      item.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openChat(chat.id); } });
      list.append(item);
    }
  }

  async function openChat(chatId, closeMobile = true) {
    if (state.busy) {
      toast('回答中です。停止してからチャットを切り替えてください。');
      return;
    }
    try {
      state.activeChatId = chatId;
      state.messages = await api(`/api/chats/${encodeURIComponent(chatId)}/messages`);
      renderSidebar();
      renderMessages();
      if (closeMobile) toggleSidebar(false);
    } catch (error) {
      toast(error.message, 4000);
    }
  }

  function createNewChat() {
    if (state.busy) {
      toast('回答中です。停止してから新しいチャットを開始してください。');
      return;
    }
    state.activeChatId = null;
    state.messages = [];
    renderSidebar();
    renderMessages();
    toggleSidebar(false);
    $('#userInput').focus();
  }

  async function ensureChat() {
    if (state.activeChatId) return state.activeChatId;
    const chat = await api('/api/chats', { method: 'POST', body: JSON.stringify({ title: '新しいチャット' }) });
    state.activeChatId = chat.id;
    state.chats.unshift(chat);
    renderSidebar();
    return chat.id;
  }

  async function renameChat(chat) {
    const title = prompt('新しいチャット名を入力してください', chat.title);
    if (title === null) return;
    if (!title.trim()) { toast('タイトルを入力してください'); return; }
    try {
      await api(`/api/chats/${encodeURIComponent(chat.id)}`, { method: 'PATCH', body: JSON.stringify({ title: title.trim() }) });
      chat.title = title.trim();
      renderSidebar();
      toast('チャット名を変更しました');
    } catch (error) { toast(error.message); }
  }

  function showConfirm(title, text, okText = '削除する') {
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    $('#confirmOk').textContent = okText;
    $('#confirmBackdrop').hidden = false;
    $('#confirmDialog').hidden = false;
    return new Promise((resolve) => { state.confirmResolve = resolve; });
  }

  function closeConfirm(value) {
    $('#confirmBackdrop').hidden = true;
    $('#confirmDialog').hidden = true;
    if (state.confirmResolve) state.confirmResolve(value);
    state.confirmResolve = null;
  }

  $('#confirmCancel').addEventListener('click', () => closeConfirm(false));
  $('#confirmOk').addEventListener('click', () => closeConfirm(true));
  $('#confirmBackdrop').addEventListener('click', () => closeConfirm(false));

  async function deleteChat(chat) {
    const accepted = await showConfirm('チャットを削除しますか？', `「${chat.title}」と保存されている会話内容を完全に削除します。`, '削除する');
    if (!accepted) return;
    try {
      await api(`/api/chats/${encodeURIComponent(chat.id)}`, { method: 'DELETE' });
      state.chats = state.chats.filter((item) => item.id !== chat.id);
      if (state.activeChatId === chat.id) {
        state.activeChatId = null;
        state.messages = [];
        if (state.chats.length) await openChat(state.chats[0].id, false);
        else renderMessages();
      }
      renderSidebar();
      toast('チャットを削除しました');
    } catch (error) { toast(error.message); }
  }

  function renderMessages() {
    const feed = $('#messages');
    feed.replaceChildren();
    if (!state.messages.length) {
      const template = welcomeTemplate.cloneNode(true);
      template.hidden = false;
      template.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => {
        $('#userInput').value = button.dataset.prompt;
        resizeComposer();
        $('#userInput').focus();
      }));
      template.querySelectorAll('[data-game-prompt]').forEach((button) => button.addEventListener('click', () => {
        $('#assistantMode').value = 'game_dev';
        updateModeUI('game_dev');
        localStorage.setItem('ymcore-settings', JSON.stringify(getSettings()));
        $('#userInput').value = button.dataset.gamePrompt;
        resizeComposer();
        $('#userInput').focus();
        toast('Game Dev Brainを有効にしました');
      }));
      feed.append(template);
      return;
    }
    state.messages.forEach((message, index) => feed.append(buildMessage(message, index)));
    addCodeCopyButtons(feed);
    feed.scrollTop = feed.scrollHeight;
  }

  function markdownToHtml(content) {
    const raw = window.marked && typeof window.marked.parse === 'function'
      ? window.marked.parse(String(content || ''), { gfm: true, breaks: true })
      : `<p>${escapeHtml(content || '').replace(/\n/g, '<br>')}</p>`;
    return window.DOMPurify ? window.DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } }) : raw;
  }

  function buildMessage(message, index) {
    const isUser = message.role === 'user';
    const row = document.createElement('article');
    row.className = `message-row ${isUser ? 'user' : 'assistant'}`;
    const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = isUser ? 'YOU' : 'Y';
    const content = document.createElement('div'); content.className = 'message-content';
    const meta = document.createElement('div'); meta.className = 'message-meta';
    const author = document.createElement('span'); author.className = 'message-author'; author.textContent = isUser ? 'あなた' : 'YM-CORE X';
    const time = document.createElement('span'); time.textContent = message.created_at ? new Date(message.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : (message.pending ? '生成中...' : '');
    meta.append(author, time);
    const bubble = document.createElement('div'); bubble.className = 'bubble';
    if (message.pending && !message.content) {
      bubble.innerHTML = '<div class="typing-indicator"><i></i><i></i><i></i></div>';
    } else {
      bubble.innerHTML = markdownToHtml(message.content || '');
    }
    content.append(meta, bubble);
    if (!message.pending) {
      const actions = document.createElement('div'); actions.className = 'message-actions';
      const copy = document.createElement('button'); copy.className = 'action-btn'; copy.textContent = 'コピー'; copy.dataset.action = 'copy'; copy.dataset.index = String(index);
      actions.append(copy);
      if (!isUser) {
        const speak = document.createElement('button'); speak.className = 'action-btn'; speak.textContent = '読み上げ'; speak.dataset.action = 'speak'; speak.dataset.index = String(index);
        actions.append(speak);
        if (index === state.messages.length - 1 && !state.busy) {
          const regen = document.createElement('button'); regen.className = 'action-btn regen-btn'; regen.textContent = '再生成'; regen.dataset.action = 'regenerate'; regen.dataset.index = String(index);
          actions.append(regen);
        }
      }
      content.append(actions);
    }
    row.append(avatar, content);
    return row;
  }

  function addCodeCopyButtons(root) {
    root.querySelectorAll('.bubble pre').forEach((pre) => {
      if (pre.querySelector('.code-copy')) return;
      const button = document.createElement('button');
      button.className = 'code-copy';
      button.textContent = 'コードをコピー';
      button.addEventListener('click', async () => {
        const code = pre.querySelector('code')?.innerText || pre.innerText;
        try { await navigator.clipboard.writeText(code); button.textContent = 'コピー済み'; setTimeout(() => button.textContent = 'コードをコピー', 1300); }
        catch { toast('クリップボードを利用できません'); }
      });
      pre.append(button);
    });
  }

  $('#messages').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const index = Number(button.dataset.index);
    const message = state.messages[index];
    if (!message) return;
    if (button.dataset.action === 'copy') {
      try { await navigator.clipboard.writeText(message.content || ''); toast('メッセージをコピーしました'); }
      catch { toast('コピーできませんでした'); }
    } else if (button.dataset.action === 'speak') {
      speakText(message.content || '');
    } else if (button.dataset.action === 'regenerate') {
      regenerateLast();
    }
  });

  function setBusy(busy) {
    state.busy = busy;
    $('#sendBtn').hidden = busy;
    $('#stopBtn').hidden = !busy;
    $('#statusDot').className = `status-dot ${busy ? 'busy' : 'online'}`;
    $('#statusText').textContent = busy ? 'AIが回答を生成中...' : 'サーバー接続済み';
    $('#userInput').disabled = busy;
    $('#sendBtn').disabled = busy;
    renderSidebar();
  }

  async function sendMessage() {
    if (state.busy) return;
    let content = $('#userInput').value.trim();
    if (state.attachedText) {
      content += `${content ? '\n\n' : ''}【添付ファイル: ${state.attachedName}】\n${state.attachedText}`;
    }
    if (!content) return;
    $('#userInput').value = '';
    resizeComposer();
    clearAttachment();
    state.messages.push({ role: 'user', content, created_at: new Date().toISOString() });
    const assistant = { role: 'assistant', content: '', pending: true, created_at: new Date().toISOString() };
    state.messages.push(assistant);
    renderMessages();
    await runStream({ content }, assistant);
  }

  async function regenerateLast() {
    if (state.busy || !state.activeChatId) return;
    const lastAssistantIndex = state.messages.map((m) => m.role).lastIndexOf('assistant');
    if (lastAssistantIndex < 0) return;
    state.messages.splice(lastAssistantIndex, 1);
    const assistant = { role: 'assistant', content: '', pending: true, created_at: new Date().toISOString() };
    state.messages.push(assistant);
    renderMessages();
    await runStream({ regenerate: true }, assistant);
  }

  async function runStream(extra, assistantMessage) {
    setBusy(true);
    state.abortController = new AbortController();
    try {
      const chatId = await ensureChat();
      const settings = getSettings();
      const body = {
        ...extra,
        model: settings.model,
        system_prompt: settings.systemPrompt,
        assistant_mode: settings.assistantMode,
        game_engine: settings.gameEngine,
        game_task: settings.gameTask,
        project_context: settings.projectContext,
        temperature: settings.temperature,
        reasoning_effort: settings.reasoning,
        history_limit: settings.historyLimit,
        max_tokens: settings.maxTokens,
      };
      const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}/stream`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf, 'Accept': 'text/event-stream' },
        body: JSON.stringify(body),
        signal: state.abortController.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || `HTTP ${response.status}`);
      }
      if (!response.body) throw new Error('ストリーミング応答を受信できません');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sawDone = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const eventText of events) {
          const line = eventText.split('\n').find((entry) => entry.startsWith('data:'));
          if (!line) continue;
          let item;
          try { item = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (item.delta) {
            assistantMessage.content += item.delta;
            assistantMessage.pending = false;
            updateStreamingMessage(assistantMessage);
          }
          if (item.error) throw new Error(item.error);
          if (item.done) sawDone = true;
        }
      }
      if (!assistantMessage.content && !sawDone) throw new Error('AIから応答がありませんでした');
      assistantMessage.pending = false;
      assistantMessage.created_at = new Date().toISOString();
      renderMessages();
      await refreshChatMeta();
      if (assistantMessage.content && getSettings().autoRead && 'speechSynthesis' in window) speakText(assistantMessage.content);
    } catch (error) {
      assistantMessage.pending = false;
      if (error.name === 'AbortError') {
        if (assistantMessage.content) assistantMessage.content += '\n\n*（生成を停止しました。未完了の回答はサーバー履歴に保存されない場合があります。）*';
        else assistantMessage.content = '生成を停止しました。';
      } else {
        assistantMessage.content = assistantMessage.content ? `${assistantMessage.content}\n\n**エラー:** ${error.message}` : `**エラー:** ${error.message}`;
        toast(error.message, 4500);
      }
      renderMessages();
    } finally {
      state.abortController = null;
      setBusy(false);
      $('#userInput').disabled = false;
      $('#userInput').focus();
      if (state.activeChatId) {
        try { state.messages = await api(`/api/chats/${encodeURIComponent(state.activeChatId)}/messages`); } catch { /* Keep in-memory partial response. */ }
        await refreshChatMeta();
        renderMessages();
      }
    }
  }

  function updateStreamingMessage(message) {
    const lastRow = $('#messages .message-row:last-child');
    if (!lastRow) { renderMessages(); return; }
    const bubble = lastRow.querySelector('.bubble');
    if (bubble) {
      bubble.innerHTML = markdownToHtml(message.content);
      addCodeCopyButtons(lastRow);
      $('#messages').scrollTop = $('#messages').scrollHeight;
    } else renderMessages();
  }

  async function refreshChatMeta() {
    state.chats = await api('/api/chats');
    renderSidebar();
  }

  function stopGeneration() {
    if (state.abortController) state.abortController.abort();
  }

  function resizeComposer() {
    const textarea = $('#userInput');
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
    $('#charCount').textContent = `${textarea.value.length.toLocaleString()} / 40000`;
  }

  function applyTemplate(text) {
    $('#userInput').value = text;
    resizeComposer();
    $('#userInput').focus();
  }

  function clearAttachment() {
    state.attachedText = '';
    state.attachedName = '';
    $('#fileInput').value = '';
    $('#fileChip').hidden = true;
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (files.length > 12) { toast('一度に添付できるのは12ファイルまでです'); return; }
    const accepted = [];
    let totalBytes = 0;
    let totalChars = 0;
    for (const file of files) {
      if (file.size > 1024 * 1024) { toast(`${file.name}: 1ファイル1MBを超えるため除外しました`); continue; }
      totalBytes += file.size;
      if (totalBytes > 3 * 1024 * 1024) { toast('添付ファイル合計は3MBまでです'); break; }
      try {
        const text = await file.text();
        if (text.includes('\u0000')) { toast(`${file.name}: バイナリ形式のため除外しました`); continue; }
        const remaining = 160000 - totalChars;
        if (remaining <= 0) break;
        const clipped = text.slice(0, remaining);
        accepted.push(`===== FILE: ${file.name} =====\n${clipped}`);
        totalChars += clipped.length;
      } catch {
        toast(`${file.name}: 読み込めませんでした`);
      }
    }
    if (!accepted.length) return;
    state.attachedText = accepted.join('\n\n');
    state.attachedName = files.filter((file) => accepted.some((part) => part.startsWith(`===== FILE: ${file.name} =====`))).map((file) => file.name).join(', ');
    $('#fileName').textContent = `${accepted.length}ファイル · ${Math.ceil(totalBytes / 1024)} KB · ${state.attachedName}`;
    $('#fileChip').hidden = false;
    toast(`${accepted.length}ファイルを添付しました（最大160,000文字）`);
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ymcore-theme', theme);
    $('#themeBtn').textContent = theme === 'dark' ? '◐' : '☾';
  }

  function toggleSettings(open) {
    const shouldOpen = typeof open === 'boolean' ? open : $('#settingsPanel').hidden;
    $('#settingsPanel').hidden = !shouldOpen;
    $('#settingsBackdrop').hidden = !shouldOpen;
  }
  function closeSettings() { toggleSettings(false); }

  function toggleSidebar(open) {
    const shouldOpen = typeof open === 'boolean' ? open : !$('#sidebar').classList.contains('open');
    $('#sidebar').classList.toggle('open', shouldOpen);
    $('#mobileOverlay').classList.toggle('show', shouldOpen);
  }

  function exportCurrent(type) {
    if (!state.messages.length) { toast('保存する会話がありません'); return; }
    const chat = state.chats.find((item) => item.id === state.activeChatId);
    const title = chat?.title || 'YM-CORE X chat';
    let content;
    let mime;
    let extension;
    if (type === 'json') {
      content = JSON.stringify({ app: 'YM-CORE X', exported_at: new Date().toISOString(), title, messages: state.messages }, null, 2);
      mime = 'application/json'; extension = 'json';
    } else {
      content = `# ${title}\n\nExported: ${new Date().toLocaleString('ja-JP')}\n\n`;
      for (const message of state.messages) {
        content += `## ${message.role === 'user' ? 'あなた' : 'YM-CORE X'}\n\n${message.content}\n\n---\n\n`;
      }
      mime = 'text/markdown;charset=utf-8'; extension = 'md';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ym-core-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast(`${extension.toUpperCase()}で保存しました`);
  }

  function speakText(text) {
    if (!('speechSynthesis' in window)) { toast('このブラウザは音声読み上げに対応していません'); return; }
    window.speechSynthesis.cancel();
    const clean = String(text).replace(/```[\s\S]*?```/g, 'コードブロックを省略').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#*_~`>]/g, '').trim();
    if (!clean) return;
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'ja-JP';
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }

  function setupSpeechRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      $('#micBtn').addEventListener('click', () => toast('このブラウザは音声入力に対応していません'));
      return;
    }
    state.speechRecognition = new Recognition();
    state.speechRecognition.lang = 'ja-JP';
    state.speechRecognition.continuous = false;
    state.speechRecognition.interimResults = false;
    state.speechRecognition.onstart = () => { state.recording = true; $('#micBtn').classList.add('recording'); $('#micBtn').textContent = '● 録音中'; };
    state.speechRecognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      $('#userInput').value += ($('#userInput').value ? ' ' : '') + transcript;
      resizeComposer();
    };
    state.speechRecognition.onerror = () => toast('音声入力でエラーが発生しました');
    state.speechRecognition.onend = () => { state.recording = false; $('#micBtn').classList.remove('recording'); $('#micBtn').textContent = '⌁ 音声'; };
    $('#micBtn').addEventListener('click', () => {
      if (state.recording) state.speechRecognition.stop();
      else { try { state.speechRecognition.start(); } catch { toast('音声入力を開始できません'); } }
    });
  }

  $('#newChatBtn').addEventListener('click', createNewChat);
  $('#sendBtn').addEventListener('click', sendMessage);
  $('#stopBtn').addEventListener('click', stopGeneration);
  $('#userInput').addEventListener('input', resizeComposer);
  $('#userInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendMessage(); }
  });
  $('#historySearch').addEventListener('input', renderSidebar);
  $('#themeBtn').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('#settingsBtn').addEventListener('click', () => toggleSettings(true));
  $('#closeSettingsBtn').addEventListener('click', closeSettings);
  $('#settingsBackdrop').addEventListener('click', closeSettings);
  $('#saveSettingsBtn').addEventListener('click', saveSettings);
  $('#resetSettingsBtn').addEventListener('click', resetSettings);
  $('#refreshModelsBtn').addEventListener('click', () => loadModels(true));
  $('#modelSelect').addEventListener('change', () => { $('#modelPill').textContent = $('#modelSelect').value; });
  $('#temperature').addEventListener('input', () => { $('#tempValue').textContent = Number($('#temperature').value).toFixed(1); });
  $('#mobileMenuBtn').addEventListener('click', () => toggleSidebar());
  $('#mobileOverlay').addEventListener('click', () => toggleSidebar(false));
  $('#attachBtn').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (event) => handleFiles(event.target.files));
  $('#removeFileBtn').addEventListener('click', clearAttachment);
  $('#exportMdBtn').addEventListener('click', () => exportCurrent('md'));
  $('#exportJsonBtn').addEventListener('click', () => exportCurrent('json'));
  $('#logoutBtn').addEventListener('click', async () => {
    stopGeneration();
    try { await api('/api/logout', { method: 'POST', body: '{}' }); }
    catch { /* A new login screen still clears local UI state. */ }
    state.activeChatId = null; state.messages = []; state.chats = [];
    showLogin();
  });
  document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => applyTemplate(button.dataset.prompt)));
  document.querySelectorAll('[data-game-prompt]').forEach((button) => button.addEventListener('click', () => {
    $('#assistantMode').value = 'game_dev';
    updateModeUI('game_dev');
    localStorage.setItem('ymcore-settings', JSON.stringify(getSettings()));
    applyTemplate(button.dataset.gamePrompt);
    toast('Game Dev Brainを有効にしました');
  }));
  $('#assistantMode').addEventListener('change', () => updateModeUI($('#assistantMode').value));
  ['modelSelect', 'assistantMode', 'gameEngine', 'gameTask', 'projectContext', 'autoRead'].forEach((id) => {
    const eventName = id === 'projectContext' ? 'change' : 'change';
    $(`#${id}`).addEventListener(eventName, () => localStorage.setItem('ymcore-settings', JSON.stringify(getSettings())));
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      createNewChat();
    }
    if (event.key === 'Escape') {
      closeSettings();
      toggleSidebar(false);
      if (!$('#confirmDialog').hidden) closeConfirm(false);
    }
  });
  setupSpeechRecognition();
  bootstrap();
})();
