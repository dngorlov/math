// Хранилище: localStorage на устройстве + Telegram CloudStorage, чтобы серия была общей на телефоне и ПК.
import { tg, inTelegram } from './tg.js';

const PREFIX = 'matan.';
const cloudOK = () => inTelegram && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9');
const cloudKey = (k) => k.replace(/[^A-Za-z0-9_-]/g, '_');

export function load(key, def) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? def : JSON.parse(v);
  } catch (e) { return def; }
}

export function save(key, val, { cloud = false } = {}) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); } catch (e) { /* приватный режим */ }
  if (cloud && cloudOK()) {
    try { tg.CloudStorage.setItem(cloudKey(key), JSON.stringify(val), () => {}); } catch (e) { /* без облака */ }
  }
}

export function cloudLoad(key) {
  return new Promise((resolve) => {
    if (!cloudOK()) return resolve(null);
    try {
      tg.CloudStorage.getItem(cloudKey(key), (err, value) => {
        if (err || !value) return resolve(null);
        try { resolve(JSON.parse(value)); } catch (e) { resolve(null); }
      });
    } catch (e) { resolve(null); }
  });
}
