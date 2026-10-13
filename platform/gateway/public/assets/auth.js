import { ApiError, apiRequest } from './api-client.js';

let currentToken = '';
let tokenVisible = false;

export function initializeAuth() {
  const tabs = [document.querySelector('#register-tab'), document.querySelector('#login-tab')];
  tabs.forEach((tab) => tab.addEventListener('click', () => selectTab(tab, tabs)));
  tabs.forEach((tab) => tab.addEventListener('keydown', (event) => handleTabKey(event, tabs)));

  document.querySelector('#register-form').addEventListener('submit', handleRegister);
  document.querySelector('#login-form').addEventListener('submit', handleLogin);
  document.querySelector('#toggle-token').addEventListener('click', toggleToken);
  document.querySelector('#copy-token').addEventListener('click', copyToken);
  document.querySelector('#clear-token').addEventListener('click', clearToken);
  document.querySelector('#verify-token').addEventListener('click', verifyToken);
}

async function handleRegister(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const body = {
    email: String(data.get('email') || '').trim(),
    password: String(data.get('password') || '')
  };
  const name = String(data.get('name') || '').trim();
  if (name) body.name = name;
  await submitAuth(form, '/api/auth/register', body);
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  await submitAuth(form, '/api/auth/login', {
    email: String(data.get('email') || '').trim(),
    password: String(data.get('password') || '')
  });
}

async function submitAuth(form, path, body) {
  setFormLoading(form, true);
  showResponse('Đang gửi request…', '', false);
  try {
    const response = await apiRequest(path, { method: 'POST', body });
    acceptToken(response.body);
    showResponse(`HTTP ${response.status} · ${response.durationMs} ms`, sanitizeAuthResponse(response.body), true);
    form.reset();
  } catch (error) {
    showAuthError(error);
  } finally {
    setFormLoading(form, false);
  }
}

async function verifyToken() {
  const button = document.querySelector('#verify-token');
  button.disabled = true;
  showResponse('Đang xác minh token…', '', false);
  try {
    const response = await apiRequest('/api/auth/verify', {
      headers: { Authorization: `Bearer ${currentToken}` }
    });
    showResponse(`HTTP ${response.status} · ${response.durationMs} ms`, response.body, true);
  } catch (error) {
    showAuthError(error);
  } finally {
    button.disabled = !currentToken;
  }
}

function acceptToken(result) {
  if (!result || typeof result.token !== 'string') {
    throw new ApiError('Auth service không trả về token hợp lệ.', { code: 'invalid_response' });
  }
  currentToken = result.token;
  tokenVisible = false;
  document.querySelector('#token-empty').hidden = true;
  document.querySelector('#token-result').hidden = false;
  document.querySelector('#token-expiry').textContent = `Expires in ${result.expiresIn || 'unknown'}`;
  document.querySelector('#toggle-token').textContent = 'Hiện token';
  document.querySelector('#toggle-token').setAttribute('aria-pressed', 'false');
  document.querySelector('#verify-token').disabled = false;
  renderToken();
}

function clearToken() {
  currentToken = '';
  tokenVisible = false;
  document.querySelector('#token-value').textContent = '';
  document.querySelector('#token-result').hidden = true;
  document.querySelector('#token-empty').hidden = false;
  document.querySelector('#auth-response').hidden = true;
}

function toggleToken() {
  tokenVisible = !tokenVisible;
  const button = document.querySelector('#toggle-token');
  button.textContent = tokenVisible ? 'Ẩn token' : 'Hiện token';
  button.setAttribute('aria-pressed', String(tokenVisible));
  renderToken();
}

async function copyToken() {
  const button = document.querySelector('#copy-token');
  try {
    await navigator.clipboard.writeText(currentToken);
    button.textContent = 'Đã copy';
  } catch {
    button.textContent = 'Copy thất bại';
  }
  window.setTimeout(() => { button.textContent = 'Copy'; }, 1600);
}

function renderToken() {
  const tokenElement = document.querySelector('#token-value');
  tokenElement.textContent = tokenVisible ? currentToken : maskToken(currentToken);
}

function maskToken(token) {
  if (token.length < 24) return '••••••••••••';
  return `${token.slice(0, 10)}${'•'.repeat(28)}${token.slice(-8)}`;
}

function sanitizeAuthResponse(body) {
  if (!body || typeof body !== 'object') return body;
  const { token, ...safeBody } = body;
  if (token) safeBody.token = '[hidden — use the token controls above]';
  return safeBody;
}

function showAuthError(error) {
  const status = error.status ? `HTTP ${error.status}` : 'REQUEST ERROR';
  showResponse(status, { error: error.message }, false);
}

function showResponse(status, body, success) {
  const container = document.querySelector('#auth-response');
  container.hidden = false;
  container.classList.toggle('is-success', success);
  document.querySelector('#auth-response-status').textContent = status;
  document.querySelector('#auth-response-body').textContent = body === '' ? '' : JSON.stringify(body, null, 2);
}

function setFormLoading(form, loading) {
  form.querySelectorAll('input, button').forEach((control) => { control.disabled = loading; });
  const button = form.querySelector('.submit-button');
  button.classList.toggle('is-loading', loading);
  button.setAttribute('aria-busy', String(loading));
}

function selectTab(selected, tabs) {
  tabs.forEach((tab) => {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    document.querySelector(`#${tab.getAttribute('aria-controls')}`).hidden = !active;
  });
}

function handleTabKey(event, tabs) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const direction = event.key === 'ArrowRight' ? 1 : -1;
  const nextIndex = (tabs.indexOf(event.currentTarget) + direction + tabs.length) % tabs.length;
  selectTab(tabs[nextIndex], tabs);
  tabs[nextIndex].focus();
}
