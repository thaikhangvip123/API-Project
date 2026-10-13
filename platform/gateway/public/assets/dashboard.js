import { apiRequest } from './api-client.js';

const CHECK_INTERVAL_MS = 30000;
const PUBLIC_SERVICES = [
  { name: 'Gateway', type: 'Edge routing', path: '/health', validate: (body) => typeof body === 'string' && body.trim() === 'gateway ok' },
  { name: 'Authentication', type: 'REST + JWT', path: '/api/auth/health', service: 'auth-service' },
  { name: 'Users', type: 'REST + PostgreSQL', path: '/api/users/health', service: 'user-service' },
  { name: 'GraphQL', type: 'Unified query', path: '/graphql', method: 'POST', body: { query: '{ __typename }' }, validate: (body) => body?.data?.__typename === 'Query' && !body.errors },
  { name: 'WebSocket', type: 'Realtime chat', path: '/ws/health', service: 'websocket-service' },
  { name: 'Webhook', type: 'Signed events', path: '/webhook/health', service: 'webhook-service' },
  { name: 'SOAP', type: 'XML service', path: '/soap/health', service: 'soap-service' },
  { name: 'WebRTC', type: 'Peer signaling', path: '/webrtc/health', service: 'webrtc-signaling' }
];
const GRPC_SERVICE = { name: 'gRPC', type: 'Via GraphQL', detail: 'Internal only', status: 'Internal only' };

let refreshTimer;
let refreshing = false;

export function initializeDashboard() {
  const refreshButton = document.querySelector('#refresh-status');
  renderCheckingState();
  refreshButton.addEventListener('click', refreshDashboard);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  refreshDashboard();
  scheduleRefresh();
}

async function refreshDashboard() {
  if (refreshing) return;
  refreshing = true;

  const button = document.querySelector('#refresh-status');
  button.disabled = true;
  button.classList.add('is-loading');
  setSummary('Đang kiểm tra hệ thống…', '');

  const results = await Promise.allSettled(PUBLIC_SERVICES.map(checkService));
  const services = results.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    return { ...PUBLIC_SERVICES[index], status: 'Unavailable', detail: 'Không thể kết nối' };
  });

  const userStatus = services.find((service) => service.name === 'Users');
  const postgresStatus = {
    name: 'PostgreSQL',
    type: 'Via User health',
    status: userStatus.status,
    detail: userStatus.status === 'Healthy' ? 'Healthy gián tiếp' : `User: ${userStatus.detail}`
  };
  renderServices([...services, GRPC_SERVICE, postgresStatus]);
  const healthyCount = services.filter((service) => service.status === 'Healthy').length;
  const overall = healthyCount === services.length ? 'Tất cả public service đang hoạt động' : `${healthyCount}/${services.length} public service healthy`;
  setSummary(overall, `Cập nhật lúc ${new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date())}`);

  button.disabled = false;
  button.classList.remove('is-loading');
  refreshing = false;
}

async function checkService(service) {
  try {
    const result = await apiRequest(service.path, {
      method: service.method,
      body: service.body,
      timeoutMs: 5000
    });
    const valid = service.validate
      ? service.validate(result.body)
      : result.body?.status === 'ok' && result.body?.service === service.service;
    if (!valid) {
      return { ...service, status: 'Degraded', detail: 'Response không hợp lệ' };
    }
    return { ...service, status: 'Healthy', detail: `${result.durationMs} ms` };
  } catch (error) {
    const status = error.status > 0 ? 'Degraded' : 'Unavailable';
    const detail = error.status > 0 ? `HTTP ${error.status}` : 'Không thể kết nối';
    return { ...service, status, detail };
  }
}

function renderCheckingState() {
  renderServices([
    ...PUBLIC_SERVICES.map((service) => ({ ...service, status: 'Checking', detail: 'Đang kiểm tra' })),
    GRPC_SERVICE,
    { name: 'PostgreSQL', type: 'Via User health', status: 'Checking', detail: 'Đang kiểm tra' }
  ]);
}

function renderServices(services) {
  const grid = document.querySelector('#service-grid');
  grid.replaceChildren(...services.map(createServiceCard));
}

function createServiceCard(service) {
  const article = document.createElement('article');
  article.className = 'service-card';

  const header = document.createElement('div');
  const icon = document.createElement('span');
  icon.className = `service-icon status-${slugify(service.status)}`;
  icon.textContent = service.name.slice(0, 2).toUpperCase();

  const title = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = service.name;
  const type = document.createElement('small');
  type.textContent = service.type;
  title.append(name, type);
  header.append(icon, title);

  const footer = document.createElement('div');
  const badge = document.createElement('span');
  badge.className = `status-badge ${slugify(service.status)}`;
  badge.textContent = service.status;
  const detail = document.createElement('span');
  detail.className = 'service-detail';
  detail.textContent = service.detail;
  footer.append(badge, detail);

  article.append(header, footer);
  return article;
}

function setSummary(summary, updated) {
  document.querySelector('#status-summary').textContent = summary;
  document.querySelector('#status-updated').textContent = updated;
}

function handleVisibilityChange() {
  window.clearTimeout(refreshTimer);
  if (!document.hidden) {
    refreshDashboard();
    scheduleRefresh();
  }
}

function scheduleRefresh() {
  window.clearTimeout(refreshTimer);
  if (!document.hidden) {
    refreshTimer = window.setTimeout(async () => {
      await refreshDashboard();
      scheduleRefresh();
    }, CHECK_INTERVAL_MS);
  }
}

function slugify(value) {
  return value.toLowerCase().replaceAll(' ', '-');
}
