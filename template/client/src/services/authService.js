import api from './api';

export async function register(data) {
  const res = await api.post('/auth/register', data);
  return res.data;
}

export async function login(data) {
  const res = await api.post('/auth/login', data);
  return res.data;
}

export async function refresh() {
  const res = await api.post('/auth/refresh');
  return res.data;
}

export async function logout() {
  await api.post('/auth/logout');
}

export async function getProfile() {
  const res = await api.get('/auth/me');
  return res.data;
}
