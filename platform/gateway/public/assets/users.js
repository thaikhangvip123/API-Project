import { apiRequest } from './api-client.js';

let selectedUser = null;

export function initializeUsers() {
  document.querySelector('#refresh-users').addEventListener('click', loadUsers);
  document.querySelector('#create-user-form').addEventListener('submit', createUser);
  document.querySelector('#edit-user-form').addEventListener('submit', updateUser);
  document.querySelector('#delete-user').addEventListener('click', deleteUser);
  loadUsers();
}

async function loadUsers() {
  const button = document.querySelector('#refresh-users');
  setButtonLoading(button, true);
  setUserNotice('Đang tải danh sách…', 'neutral');
  try {
    const response = await apiRequest('/api/users');
    if (!Array.isArray(response.body)) throw new Error('User service trả về dữ liệu không hợp lệ.');
    renderUsers(response.body);
    setUserNotice(`${response.body.length} user · HTTP ${response.status} · ${response.durationMs} ms`, 'success');
    if (selectedUser && !response.body.some((user) => user.id === selectedUser.id)) clearSelection();
  } catch (error) {
    renderUsers([]);
    setUserNotice(error.message, 'error');
  } finally {
    setButtonLoading(button, false);
  }
}

async function createUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  setFormLoading(form, true);
  try {
    const response = await apiRequest('/api/users', {
      method: 'POST',
      body: {
        email: String(data.get('email') || '').trim(),
        name: String(data.get('name') || '').trim()
      }
    });
    form.reset();
    setUserNotice(`Đã tạo user #${response.body.id}.`, 'success');
    await loadUsers();
    await selectUser(response.body.id);
  } catch (error) {
    setUserNotice(error.message, 'error');
  } finally {
    setFormLoading(form, false);
  }
}

async function selectUser(id) {
  if (!Number.isSafeInteger(id) || id <= 0) return;
  setUserNotice(`Đang tải user #${id}…`, 'neutral');
  try {
    const response = await apiRequest(`/api/users/${id}`);
    selectedUser = response.body;
    document.querySelector('#edit-user-id').textContent = `#${selectedUser.id}`;
    document.querySelector('#edit-user-email').value = selectedUser.email;
    document.querySelector('#edit-user-name').value = selectedUser.name;
    document.querySelector('#edit-user-form').hidden = false;
    document.querySelector('#user-editor-empty').hidden = true;
    setUserNotice(`Đã chọn ${selectedUser.email}.`, 'success');
    highlightSelectedUser();
  } catch (error) {
    setUserNotice(error.message, 'error');
  }
}

async function updateUser(event) {
  event.preventDefault();
  if (!selectedUser) return;
  const form = event.currentTarget;
  const email = form.elements.email.value.trim();
  const name = form.elements.name.value.trim();
  const changes = {};
  if (email !== selectedUser.email) changes.email = email;
  if (name !== selectedUser.name) changes.name = name;
  if (Object.keys(changes).length === 0) {
    setUserNotice('Hãy thay đổi email hoặc tên trước khi lưu.', 'error');
    return;
  }

  setFormLoading(form, true);
  try {
    const response = await apiRequest(`/api/users/${selectedUser.id}`, { method: 'PUT', body: changes });
    selectedUser = response.body;
    setUserNotice(`Đã cập nhật user #${selectedUser.id}.`, 'success');
    await loadUsers();
    await selectUser(selectedUser.id);
  } catch (error) {
    setUserNotice(error.message, 'error');
  } finally {
    setFormLoading(form, false);
  }
}

async function deleteUser() {
  if (!selectedUser) return;
  const label = `#${selectedUser.id} (${selectedUser.email})`;
  if (!window.confirm(`Xóa vĩnh viễn user ${label}? Hành động này không thể hoàn tác.`)) return;

  const button = document.querySelector('#delete-user');
  setButtonLoading(button, true);
  try {
    await apiRequest(`/api/users/${selectedUser.id}`, { method: 'DELETE' });
    setUserNotice(`Đã xóa user ${label}.`, 'success');
    clearSelection();
    await loadUsers();
  } catch (error) {
    setUserNotice(error.message, 'error');
  } finally {
    setButtonLoading(button, false);
  }
}

function renderUsers(users) {
  const list = document.querySelector('#user-list');
  if (users.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Chưa có user. Tạo một bản ghi demo để bắt đầu.';
    list.replaceChildren(empty);
    return;
  }

  list.replaceChildren(...users.map((user) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'user-row';
    button.dataset.userId = String(user.id);
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => selectUser(user.id));

    const identity = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = user.name;
    const email = document.createElement('small');
    email.textContent = user.email;
    identity.append(name, email);

    const id = document.createElement('span');
    id.className = 'user-id';
    id.textContent = `#${user.id}`;
    button.append(identity, id);
    return button;
  }));
  highlightSelectedUser();
}

function highlightSelectedUser() {
  document.querySelectorAll('.user-row').forEach((row) => {
    const isSelected = Boolean(selectedUser && Number(row.dataset.userId) === selectedUser.id);
    row.classList.toggle('selected', isSelected);
    row.setAttribute('aria-pressed', String(isSelected));
  });
}

function clearSelection() {
  selectedUser = null;
  document.querySelector('#edit-user-form').hidden = true;
  document.querySelector('#user-editor-empty').hidden = false;
  highlightSelectedUser();
}

function setUserNotice(message, state) {
  const notice = document.querySelector('#users-notice');
  notice.textContent = message;
  notice.dataset.state = state;
}

function setFormLoading(form, loading) {
  form.querySelectorAll('input, button').forEach((control) => { control.disabled = loading; });
  form.setAttribute('aria-busy', String(loading));
}

function setButtonLoading(button, loading) {
  button.disabled = loading;
  button.setAttribute('aria-busy', String(loading));
}
