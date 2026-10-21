import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authorizedFetch, clearSession, getToken, saveSession } from '../src/core/auth.js';

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key),
};
const events = [];
globalThis.document = { dispatchEvent: event => events.push(event.type) };
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };

test('authorized requests send the saved bearer token', async () => {
  saveSession('session-secret');
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.get('Authorization'), 'Bearer session-secret');
    return { status: 200 };
  };
  await authorizedFetch('/v1/courses');
  assert.equal(getToken(), 'session-secret');
  clearSession();
});

test('a 401 invalidates the session and signals sign-out', async () => {
  saveSession('expired-session');
  globalThis.fetch = async () => ({ status: 401 });
  const response = await authorizedFetch('/v1/auth/me');
  assert.equal(response.status, 401);
  assert.equal(getToken(), null);
  assert.deepEqual(events, ['maystudy:session-expired']);
});

test('an older request cannot restore another account’s data', async () => {
  saveSession('first-session');
  globalThis.fetch = async () => {
    saveSession('second-session');
    return { status: 200 };
  };
  await assert.rejects(authorizedFetch('/v1/courses'), /Session changed/);
  clearSession();
});
