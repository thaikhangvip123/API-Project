import { apiRequest } from './api-client.js';

const LIST_QUERY = `{
  users {
    id
    email
    name
  }
}`;

const USER_QUERY = `query GetUser($id: Int!) {
  user(id: $id) {
    id
    email
    name
  }
}`;

export function initializeGraphql() {
  const query = document.querySelector('#graphql-query');
  query.value = LIST_QUERY;
  document.querySelector('#graphql-run').addEventListener('click', executeQuery);
  document.querySelector('#graphql-format').addEventListener('click', formatEditors);
  document.querySelector('#graphql-clear').addEventListener('click', clearEditors);
  document.querySelector('#graphql-list-query').addEventListener('click', () => setExample(LIST_QUERY, '{}'));
  document.querySelector('#graphql-user-query').addEventListener('click', () => setExample(USER_QUERY, '{\n  "id": 1\n}'));
}

async function executeQuery() {
  const button = document.querySelector('#graphql-run');
  const query = document.querySelector('#graphql-query').value.trim();
  if (!query) {
    showGraphqlResponse('VALIDATION', { error: 'GraphQL query không được để trống.' }, true);
    return;
  }

  let variables;
  try {
    variables = JSON.parse(document.querySelector('#graphql-variables').value || '{}');
    if (!variables || Array.isArray(variables) || typeof variables !== 'object') throw new Error();
  } catch {
    showGraphqlResponse('VALIDATION', { error: 'Variables phải là một JSON object hợp lệ.' }, true);
    return;
  }

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  showGraphqlResponse('RUNNING', { message: 'Đang thực thi query…' }, false);
  try {
    const response = await apiRequest('/graphql', { method: 'POST', body: { query, variables } });
    showGraphqlResponse(`HTTP ${response.status} · ${response.durationMs} ms`, response.body, Boolean(response.body?.errors));
  } catch (error) {
    showGraphqlResponse(error.status ? `HTTP ${error.status}` : 'REQUEST ERROR', error.body || { error: error.message }, true);
  } finally {
    button.disabled = false;
    button.setAttribute('aria-busy', 'false');
  }
}

function formatEditors() {
  const query = document.querySelector('#graphql-query');
  query.value = formatQuery(query.value);
  const variables = document.querySelector('#graphql-variables');
  try {
    variables.value = JSON.stringify(JSON.parse(variables.value || '{}'), null, 2);
  } catch {
    showGraphqlResponse('VALIDATION', { error: 'Không thể format variables vì JSON không hợp lệ.' }, true);
  }
}

function formatQuery(source) {
  return source
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function clearEditors() {
  document.querySelector('#graphql-query').value = '';
  document.querySelector('#graphql-variables').value = '{}';
  document.querySelector('#graphql-response').hidden = true;
}

function setExample(query, variables) {
  document.querySelector('#graphql-query').value = query;
  document.querySelector('#graphql-variables').value = variables;
}

function showGraphqlResponse(meta, body, hasErrors) {
  const container = document.querySelector('#graphql-response');
  container.hidden = false;
  container.classList.toggle('has-errors', hasErrors);
  document.querySelector('#graphql-meta').textContent = meta;
  document.querySelector('#graphql-body').textContent = JSON.stringify(body, null, 2);
}
