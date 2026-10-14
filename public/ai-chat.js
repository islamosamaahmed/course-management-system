const MAX_MESSAGE_LENGTH = 2000;

function getCsrfToken() {
  return window.__courseAppState?.csrf || '';
}

function buildAiRequestOptions(options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.method && !['GET', 'HEAD'].includes(options.method)) {
    headers['X-CSRF-Token'] = getCsrfToken();
  }
  return { credentials: 'same-origin', ...options, headers };
}

function markdownToHtml(text) {
  const escaped = String(text || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function formatMessageTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ar-EG', {
    hour: 'numeric', minute: '2-digit'
  }).format(date);
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const temporary = document.createElement('textarea');
  temporary.value = text;
  temporary.setAttribute('readonly', '');
  temporary.style.position = 'fixed';
  temporary.style.opacity = '0';
  document.body.appendChild(temporary);
  temporary.select();
  document.execCommand('copy');
  temporary.remove();
}

export function initializeAiChat() {
  const root = document.getElementById('ai-chat-root');
  if (!root || root.dataset.aiChatInitialized === 'true') return;
  root.dataset.aiChatInitialized = 'true';

  let floatingButton = root.querySelector('#ai-chat-button');
  if (!floatingButton) {
    floatingButton = document.createElement('button');
    floatingButton.id = 'ai-chat-button';
    floatingButton.className = 'ai-chat-button';
    floatingButton.type = 'button';
    floatingButton.setAttribute('aria-label', 'فتح مساعد S.T.C الذكي');
    floatingButton.setAttribute('aria-controls', 'ai-chat-modal');
    floatingButton.setAttribute('aria-expanded', 'false');
    floatingButton.innerHTML = `
      <svg class="ai-chat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <span class="ai-chat-label">اسأل المساعد</span>
    `;
    root.appendChild(floatingButton);
  }

  let modal = root.querySelector('#ai-chat-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ai-chat-modal';
    modal.className = 'ai-chat-modal';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'ai-chat-header');
    modal.innerHTML = `
      <div class="ai-chat-overlay"></div>
      <div class="ai-chat-dialog">
        <header class="ai-chat-header">
          <div class="ai-chat-header-content">
            <span class="ai-chat-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="m12 3 2.1 6.1L20 11l-5.9 2.1L12 19l-2.1-5.9L4 11l5.9-1.9L12 3Z"></path>
                <path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"></path>
              </svg>
            </span>
            <div class="ai-chat-heading">
              <h2 id="ai-chat-header" class="ai-chat-title">مساعد S.T.C</h2>
              <p class="ai-chat-subtitle"><span class="ai-chat-status-dot"></span>بياناتك محمية حسب صلاحيات حسابك</p>
            </div>
          </div>
          <button class="ai-chat-close-btn" type="button" aria-label="إغلاق المحادثة">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>

        <div class="ai-chat-messages" role="log" aria-live="polite" aria-label="رسائل المحادثة"></div>

        <footer class="ai-chat-footer">
          <button class="ai-chat-clear-btn" type="button">🗑️ مسح المحادثة</button>
        </footer>
      </div>
    `;
    root.appendChild(modal);
  }

  let isOpen = false;
  let isLoading = false;
  let historyLoaded = false;
  let historyLoading = false;
  let bootstrap = {
    greeting: 'أهلًا! كيف يمكنني مساعدتك؟',
    suggestedQuestions: ['محاضراتي النهارده إيه؟', 'عندي كام غياب؟'],
    allQuestions: ['محاضراتي النهارده إيه؟', 'عندي كام غياب؟']
  };
  let lastFocusedElement = null;

  const messagesContainer = modal.querySelector('.ai-chat-messages');
  const clearBtn = modal.querySelector('.ai-chat-clear-btn');
  const overlay = modal.querySelector('.ai-chat-overlay');
  const closeBtn = modal.querySelector('.ai-chat-close-btn');

  if (!messagesContainer || !clearBtn || !closeBtn) return;

  function scrollToLatest() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function appendSuggestions(container, suggestions, includeMenu = false, showStudentSearch = false) {
    if ((!Array.isArray(suggestions) || !suggestions.length) && !showStudentSearch) return;
    const suggestionContainer = document.createElement('div');
    suggestionContainer.className = 'ai-chat-suggestions';
    const options = (Array.isArray(suggestions) ? suggestions : []).map(option => typeof option === 'string'
      ? { label: option, message: option }
      : option).filter(option =>
      option && typeof option.label === 'string' && option.label.trim() &&
      typeof option.message === 'string' && option.message.trim());
    if (showStudentSearch) {
      const searchForm = document.createElement('form');
      searchForm.className = 'ai-chat-student-search';
      searchForm.dataset.aiChatStudentSearch = 'true';
      searchForm.setAttribute('role', 'search');

      const searchInput = document.createElement('input');
      searchInput.className = 'ai-chat-student-search-input';
      searchInput.type = 'search';
      searchInput.maxLength = 100;
      searchInput.autocomplete = 'off';
      searchInput.dir = 'auto';
      searchInput.placeholder = 'اكتب اسم الطالب أو كوده';
      searchInput.setAttribute('aria-label', 'البحث عن طالب بالاسم أو الكود');
      searchForm.appendChild(searchInput);

      const searchButton = document.createElement('button');
      searchButton.className = 'ai-chat-student-search-submit';
      searchButton.type = 'submit';
      searchButton.textContent = 'بحث';
      searchForm.appendChild(searchButton);
      suggestionContainer.appendChild(searchForm);
    }
    const optionButtons = [];
    for (const option of options) {
      const button = document.createElement('button');
      button.className = 'ai-chat-suggestion';
      button.type = 'button';
      button.textContent = option.label.trim();
      button.dataset.aiChatMessage = option.message.trim();
      button.disabled = isLoading;
      optionButtons.push(button);
    }
    optionButtons.forEach((button, index) => {
      if (index >= 4) {
        button.hidden = true;
        button.classList.add('ai-chat-option-overflow');
      }
      suggestionContainer.appendChild(button);
    });
    if (optionButtons.length > 4) {
      const moreButton = document.createElement('button');
      moreButton.className = 'ai-chat-suggestion ai-chat-more';
      moreButton.type = 'button';
      moreButton.textContent = 'عرض المزيد';
      moreButton.dataset.aiChatExpand = 'true';
      moreButton.disabled = isLoading;
      suggestionContainer.appendChild(moreButton);
    }
    if (includeMenu) {
      const menuButton = document.createElement('button');
      menuButton.className = 'ai-chat-suggestion ai-chat-main-menu';
      menuButton.type = 'button';
      menuButton.textContent = 'القائمة الرئيسية';
      menuButton.dataset.aiChatMenu = 'true';
      menuButton.disabled = isLoading;
      suggestionContainer.appendChild(menuButton);
    }
    if (suggestionContainer.childElementCount) container.appendChild(suggestionContainer);
  }

  function createMessageElement(type, text, createdAt) {
    const messageDiv = document.createElement('article');
    messageDiv.className = `ai-chat-message ai-chat-message-${type}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'ai-chat-message-content';
    if (type === 'ai') contentDiv.innerHTML = markdownToHtml(text);
    else contentDiv.textContent = text;
    messageDiv.appendChild(contentDiv);

    const timestamp = formatMessageTime(createdAt);
    if (timestamp || type === 'ai') {
      const meta = document.createElement('div');
      meta.className = 'ai-chat-message-meta';
      if (timestamp) {
        const time = document.createElement('time');
        time.textContent = timestamp;
        meta.appendChild(time);
      }
      if (type === 'ai') {
        const copyButton = document.createElement('button');
        copyButton.className = 'ai-chat-copy-btn';
        copyButton.type = 'button';
        copyButton.dataset.aiChatCopy = 'true';
        copyButton.setAttribute('aria-label', 'نسخ رد المساعد');
        copyButton.textContent = 'نسخ';
        meta.appendChild(copyButton);
      }
      messageDiv.appendChild(meta);
    }
    return messageDiv;
  }

  function renderWelcome() {
    messagesContainer.replaceChildren();
    const welcome = document.createElement('section');
    welcome.className = 'ai-chat-welcome';
    welcome.dataset.aiChatWelcome = 'true';
    const text = document.createElement('p');
    text.className = 'ai-chat-welcome-text';
    text.textContent = `👋 ${bootstrap.greeting}`;
    welcome.appendChild(text);
    appendSuggestions(welcome, bootstrap.allQuestions || bootstrap.suggestedQuestions);
    messagesContainer.appendChild(welcome);
  }

  function dismissWelcome() {
    messagesContainer.querySelector('[data-ai-chat-welcome]')?.remove();
  }

  function setBusy(value) {
    isLoading = value;
    modal.setAttribute('aria-busy', String(value));
    clearBtn.disabled = value;
    messagesContainer.querySelectorAll(
      '.ai-chat-suggestion, .ai-chat-student-search-input, .ai-chat-student-search-submit'
    ).forEach(control => {
      control.disabled = value;
    });
  }

  async function readJson(response) {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return {}; }
  }

  async function loadConversation() {
    if (historyLoaded || historyLoading) return;
    historyLoading = true;
    try {
      const [bootstrapResponse, historyResponse] = await Promise.all([
        fetch('/api/ai/chat/bootstrap', buildAiRequestOptions({ method: 'GET' })),
        fetch('/api/ai/chat/history', buildAiRequestOptions({ method: 'GET' }))
      ]);
      if (bootstrapResponse.ok) {
        const data = await readJson(bootstrapResponse);
        if (typeof data.greeting === 'string' && Array.isArray(data.suggestedQuestions)) {
          bootstrap = { ...data, allQuestions: Array.isArray(data.allQuestions) ? data.allQuestions : data.suggestedQuestions };
        }
      }
      if (historyResponse.ok) {
        const data = await readJson(historyResponse);
        if (Array.isArray(data.messages) && data.messages.length) {
          messagesContainer.replaceChildren();
          for (const message of data.messages) {
            messagesContainer.appendChild(createMessageElement('user', message.message, message.created_at));
            const answer = createMessageElement('ai', message.response, message.created_at);
            appendSuggestions(answer, message.suggestedQuestions, true,
              /اذكر اسم الطالب أو كوده/.test(message.response));
            messagesContainer.appendChild(answer);
          }
          scrollToLatest();
        } else {
          renderWelcome();
        }
      } else {
        renderWelcome();
      }
      historyLoaded = true;
    } catch (error) {
      console.error('Load AI chat history failed:', error);
      renderWelcome();
    } finally {
      historyLoading = false;
    }
  }

  function openModal() {
    isOpen = true;
    lastFocusedElement = document.activeElement;
    modal.hidden = false;
    floatingButton.classList.add('active');
    floatingButton.setAttribute('aria-expanded', 'true');
    closeBtn.focus();
    void loadConversation();
  }

  function closeModal() {
    isOpen = false;
    modal.hidden = true;
    floatingButton.classList.remove('active');
    floatingButton.setAttribute('aria-expanded', 'false');
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
  }

  function showError(message, retryMessage) {
    const error = createMessageElement('error', message, new Date().toISOString());
    if (retryMessage) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'ai-chat-retry-btn';
      retry.dataset.aiChatRetry = retryMessage;
      retry.textContent = 'إعادة المحاولة';
      error.appendChild(retry);
    }
    messagesContainer.appendChild(error);
    scrollToLatest();
  }

  function showMainMenu() {
    const menu = createMessageElement('ai', 'اختار من الخيارات المتاحة لحسابك:', new Date().toISOString());
    appendSuggestions(menu, bootstrap.allQuestions || bootstrap.suggestedQuestions);
    messagesContainer.appendChild(menu);
    scrollToLatest();
  }

  async function sendMessage(messageOverride) {
    const messageText = String(messageOverride ?? '').trim();
    if (!messageText || isLoading) return;
    if (messageText.length > MAX_MESSAGE_LENGTH) {
      showError(`اكتب رسالة لا تتجاوز ${MAX_MESSAGE_LENGTH} حرف.`);
      return;
    }

    dismissWelcome();
    messagesContainer.appendChild(createMessageElement('user', messageText, new Date().toISOString()));
    setBusy(true);
    scrollToLatest();

    const loading = document.createElement('div');
    loading.className = 'ai-chat-message ai-chat-message-ai ai-chat-message-loading';
    loading.setAttribute('aria-label', 'المساعد يكتب ردًا');
    loading.innerHTML = '<div class="ai-chat-loading-dots" aria-hidden="true"><span></span><span></span><span></span></div>';
    messagesContainer.appendChild(loading);
    scrollToLatest();

    try {
      const response = await fetch('/api/ai/chat/message', buildAiRequestOptions({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText })
      }));
      const data = await readJson(response);
      if (!response.ok || typeof data.response !== 'string') {
        throw new Error(data.error || 'تعذر إرسال الرسالة. حاول مرة أخرى.');
      }
      loading.remove();
      const answer = createMessageElement('ai', data.response, data.created_at);
      appendSuggestions(answer, data.suggestedQuestions, true,
        /اذكر اسم الطالب أو كوده/.test(data.response));
      messagesContainer.appendChild(answer);
      scrollToLatest();
    } catch (error) {
      console.error('AI chat request failed:', error);
      loading.remove();
      showError(error instanceof Error ? error.message : 'تعذر إرسال الرسالة. حاول مرة أخرى.', messageText);
    } finally {
      setBusy(false);
    }
  }

  floatingButton.addEventListener('click', () => {
    if (isOpen) closeModal();
    else openModal();
  });
  closeBtn.addEventListener('click', closeModal);
  overlay?.addEventListener('click', closeModal);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen) closeModal();
  });

  messagesContainer.addEventListener('submit', event => {
    const searchForm = event.target.closest('[data-ai-chat-student-search]');
    if (!searchForm) return;
    event.preventDefault();
    if (isLoading) return;
    const searchInput = searchForm.querySelector('.ai-chat-student-search-input');
    const searchTerm = searchInput?.value.trim();
    if (!searchTerm) {
      searchInput?.focus();
      return;
    }
    void sendMessage(`ابحث عن طالب ${searchTerm}`);
  });

  messagesContainer.addEventListener('click', event => {
    const expand = event.target.closest('[data-ai-chat-expand]');
    if (expand) {
      if (isLoading) return;
      if (expand.dataset.aiChatExpand === 'false') {
        expand.parentElement.querySelectorAll('.ai-chat-option-overflow').forEach(button => {
          button.hidden = true;
        });
        expand.textContent = 'عرض المزيد';
        expand.dataset.aiChatExpand = 'true';
      } else {
        expand.parentElement.querySelectorAll('.ai-chat-option-overflow').forEach(button => {
          button.hidden = false;
        });
        expand.textContent = 'عرض أقل';
        expand.dataset.aiChatExpand = 'false';
      }
      return;
    }
    const menu = event.target.closest('[data-ai-chat-menu]');
    if (menu && !isLoading) {
      showMainMenu();
      return;
    }
    const suggestion = event.target.closest('.ai-chat-suggestion');
    if (suggestion?.dataset.aiChatMessage && !isLoading) {
      void sendMessage(suggestion.dataset.aiChatMessage);
      return;
    }
    const retry = event.target.closest('[data-ai-chat-retry]');
    if (retry && !isLoading) {
      retry.remove();
      void sendMessage(retry.dataset.aiChatRetry);
      return;
    }
    const copy = event.target.closest('[data-ai-chat-copy]');
    if (!copy) return;
    const content = copy.closest('.ai-chat-message')?.querySelector('.ai-chat-message-content')?.textContent || '';
    void copyToClipboard(content).then(() => {
      copy.textContent = 'تم النسخ';
      setTimeout(() => { copy.textContent = 'نسخ'; }, 1400);
    }).catch(() => {
      copy.textContent = 'تعذر النسخ';
      setTimeout(() => { copy.textContent = 'نسخ'; }, 1400);
    });
  });

  clearBtn.addEventListener('click', async () => {
    if (!confirm('هل تريد مسح جميع رسائل هذه المحادثة؟')) return;
    try {
      const response = await fetch('/api/ai/chat/history', buildAiRequestOptions({ method: 'DELETE' }));
      if (!response.ok) throw new Error();
      renderWelcome();
    } catch (error) {
      console.error('Clear AI chat history failed:', error);
      showError('تعذر مسح المحادثة. حاول مرة أخرى.');
    }
  });
  renderWelcome();
  renderWelcome();
}
