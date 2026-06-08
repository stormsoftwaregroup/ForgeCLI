import api from './api';

export function getErrors(params = {}) {
  return api.get('/admin/errors', { params }).then((r) => r.data);
}

export function getErrorById(id) {
  return api.get(`/admin/errors/${id}`).then((r) => r.data);
}

export function getErrorCount() {
  return api.get('/admin/errors', { params: { limit: 1 } }).then((r) => r.data.total);
}

export function cleanupErrors() {
  return api.delete('/admin/errors/cleanup').then((r) => r.data);
}
