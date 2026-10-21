import { API_BASE_URL } from '../../core/config.js';
import { authorizedFetch } from '../../core/auth.js';
import { readChatStream } from './stream.js';

const styles = document.createElement('link');
styles.rel = 'stylesheet';
styles.href = 'src/features/chat/chat.css?v=stream-1';
document.head.append(styles);

const $ = selector => document.querySelector(selector);
const panel = $('#chat-panel');
const launcher = $('#chat-launcher');
const messages = $('#chat-messages');
const input = $('#chat-input');
const form = $('#chat-form');
const send = $('#chat-send');
const error = $('#chat-error');
const suggestions = $('#chat-suggestions');
const state = {
  language: localStorage.getItem('n-learny-language') === 'vi' ? 'vi' : 'en',
  courseId: null,
  courseName: null,
  history: [],
  pending: false,
  requestId: 0,
  controller: null,
};

const copy = {
  en: {
    context: 'Your study companion',
    subject: name => `Studying · ${name}`,
    welcome: 'Hi! I’m May. Ask me about a concept, a study plan, or the subject you’re viewing.',
    welcomeSubject: name => `Hi! I’m May. I can help you explore ${name} using the material you uploaded.`,
    suggestionOne: 'Help me make a study plan',
    suggestionTwo: 'Explain a difficult concept',
    subjectSuggestionOne: 'Summarize this subject',
    subjectSuggestionTwo: 'What should I review first?',
    placeholder: 'Ask May anything about studying...',
    send: 'Send message',
    close: 'Close chat',
    open: 'Open May chat',
    thinking: 'May is typing',
    failed: 'May couldn’t answer right now. Please try again.',
    limited: 'All AI keys are busy right now. Please try again shortly.',
    timeout: 'The reply took too long. Please try again.',
  },
  vi: {
    context: 'Bạn đồng hành học tập',
    subject: name => `Đang học · ${name}`,
    welcome: 'Chào bạn! Mình là May. Cứ hỏi mình về kiến thức, cách ôn tập hoặc môn học bạn đang xem nhé.',
    welcomeSubject: name => `Chào bạn! Mình là May. Mình có thể cùng bạn tìm hiểu ${name} dựa trên tài liệu đã tải lên.`,
    suggestionOne: 'Giúp mình lập kế hoạch ôn tập',
    suggestionTwo: 'Giải thích một khái niệm khó',
    subjectSuggestionOne: 'Tóm tắt môn học này',
    subjectSuggestionTwo: 'Mình nên ôn gì trước?',
    placeholder: 'Hỏi May điều bạn muốn biết...',
    send: 'Gửi tin nhắn',
    close: 'Đóng hội thoại',
    open: 'Mở chat với May',
    thinking: 'May đang gõ',
    failed: 'May chưa trả lời được lúc này. Bạn thử lại nhé.',
    limited: 'Các AI key đang bận. Bạn thử lại sau ít phút nhé.',
    timeout: 'Phản hồi hơi lâu. Bạn thử lại nhé.',
  },
};
const t = key => copy[state.language][key];

function scrollToLatest() {
  messages.scrollTop = messages.scrollHeight;
}

function addMessage(role, content) {
  const row = document.createElement('div');
  row.className = `chat-row chat-row-${role}`;
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble chat-bubble-${role}`;
  bubble.textContent = content;
  row.append(bubble);
  messages.append(row);
  scrollToLatest();
  return row;
}

function addTypingMessage() {
  const row = addMessage('assistant', '');
  row.classList.add('chat-typing');
  const bubble = row.querySelector('.chat-bubble');
  bubble.setAttribute('aria-label', t('thinking'));
  const label = document.createElement('span');
  label.textContent = t('thinking');
  const dots = document.createElement('span');
  dots.className = 'chat-typing-dots';
  for (let index = 0; index < 3; index += 1) {
    dots.append(document.createElement('span'));
  }
  bubble.append(label, dots);
  return row;
}

function clearError() {
  error.hidden = true;
  error.textContent = '';
}

function renderSuggestions() {
  suggestions.replaceChildren();
  const labels = state.courseId
    ? [t('subjectSuggestionOne'), t('subjectSuggestionTwo')]
    : [t('suggestionOne'), t('suggestionTwo')];
  labels.forEach(label => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.onclick = () => {
      input.value = label;
      submitMessage();
    };
    suggestions.append(button);
  });
  suggestions.hidden = state.history.length > 0 || state.pending;
}

function renderIntro() {
  messages.replaceChildren();
  addMessage('assistant', state.courseName ? t('welcomeSubject')(state.courseName) : t('welcome'));
  renderSuggestions();
}

function updateLanguage() {
  $('#chat-context').textContent = state.courseName ? t('subject')(state.courseName) : t('context');
  input.placeholder = t('placeholder');
  input.setAttribute('aria-label', t('placeholder'));
  $('#chat-close').setAttribute('aria-label', t('close'));
  launcher.setAttribute('aria-label', t('open'));
  send.setAttribute('aria-label', t('send'));
  send.title = t('send');
  const typingBubble = messages.querySelector('.chat-typing .chat-bubble');
  if (typingBubble) {
    typingBubble.setAttribute('aria-label', t('thinking'));
    typingBubble.querySelector('span').textContent = t('thinking');
  }
  if (!state.history.length && !state.pending) renderIntro();
}

function setOpen(open) {
  panel.hidden = !open;
  launcher.setAttribute('aria-expanded', String(open));
  launcher.classList.toggle('is-open', open);
  if (open) {
    input.focus();
    scrollToLatest();
  } else {
    launcher.focus();
  }
}

async function submitMessage() {
  const message = input.value.trim();
  if (!message || state.pending) return;
  clearError();
  input.value = '';
  const userRow = addMessage('user', message);
  const typingRow = addTypingMessage();
  state.pending = true;
  send.disabled = true;
  renderSuggestions();

  const requestId = ++state.requestId;
  const controller = new AbortController();
  state.controller = controller;
  let timeout;
  const refreshTimeout = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => controller.abort(), 60000);
  };
  refreshTimeout();
  let replyText = '';
  try {
    const response = await authorizedFetch(`${API_BASE_URL}/chat:stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify({
        message,
        history: state.history.slice(-10),
        course_id: state.courseId,
        language: state.language,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const requestError = new Error(data.detail || t('failed'));
      requestError.status = response.status;
      throw requestError;
    }
    await readChatStream(response, chunk => {
      if (requestId !== state.requestId) return;
      refreshTimeout();
      replyText += chunk;
      if (typingRow.classList.contains('chat-typing')) {
        typingRow.classList.remove('chat-typing');
        typingRow.classList.add('chat-streaming');
        typingRow.querySelector('.chat-bubble').removeAttribute('aria-label');
      }
      typingRow.querySelector('.chat-bubble').textContent = replyText;
      scrollToLatest();
    });
    if (requestId !== state.requestId) return;
    if (!replyText.trim()) throw new Error(t('failed'));
    typingRow.classList.remove('chat-streaming');
    state.history.push({ role: 'user', content: message }, { role: 'assistant', content: replyText.trim() });
    state.history = state.history.slice(-10);
  } catch (cause) {
    if (requestId !== state.requestId) return;
    controller.abort();
    typingRow.classList.remove('chat-typing', 'chat-streaming');
    if (replyText.trim()) {
      typingRow.querySelector('.chat-bubble').classList.add('chat-bubble-incomplete');
    } else {
      typingRow.remove();
      userRow.remove();
      input.value = message;
    }
    error.textContent = cause.name === 'AbortError' ? t('timeout') : cause.status === 429 || cause.code === 'rate_limited' ? t('limited') : t('failed');
    error.hidden = false;
    input.focus();
  } finally {
    clearTimeout(timeout);
    if (requestId === state.requestId) {
      state.pending = false;
      state.controller = null;
      send.disabled = false;
      renderSuggestions();
    }
  }
}

function resetConversation() {
  state.controller?.abort();
  state.requestId += 1;
  state.controller = null;
  state.pending = false;
  state.history = [];
  input.value = '';
  send.disabled = false;
  clearError();
  updateLanguage();
}

launcher.onclick = () => setOpen(panel.hidden);
$('#chat-close').onclick = () => setOpen(false);
form.onsubmit = event => {
  event.preventDefault();
  submitMessage();
};
input.onkeydown = event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submitMessage();
  }
};
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !panel.hidden) setOpen(false);
});
document.addEventListener('maystudy:language-changed', event => {
  state.language = event.detail.language === 'vi' ? 'vi' : 'en';
  updateLanguage();
});
document.addEventListener('maystudy:course-changed', event => {
  const nextId = event.detail.courseId ?? null;
  if (nextId !== state.courseId) {
    state.courseId = nextId;
    state.courseName = event.detail.courseName ?? null;
    resetConversation();
  } else if (state.courseName !== event.detail.courseName) {
    state.courseName = event.detail.courseName ?? null;
    updateLanguage();
  }
});
document.addEventListener('n-learny:signed-out', () => {
  setOpen(false);
  state.courseId = null;
  state.courseName = null;
  resetConversation();
});

updateLanguage();
