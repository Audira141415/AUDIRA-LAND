// AUDIRA LAND · Pantai Nyiur: room realtime nongkrong di pantai.
// Mesin yang sama dengan Taman (server/taman.mjs), peta js/pantai-map.json, maks 60 orang.
// Klien: /pantai.html -> WebSocket /ws/taman?room=pantai
import { readFileSync } from 'node:fs';
import { createTaman } from './taman.mjs';

const CAP = 60;
const MAP_URL = new URL('../js/pantai-map.json', import.meta.url);

export function createPantai({ store, itemsOf, badgeOf, map } = {}) {
  if (!store) throw new Error('createPantai butuh store');
  const peta = map || JSON.parse(readFileSync(MAP_URL, 'utf8'));
  const room = createTaman({ store, map: peta, cap: CAP, label: 'Pantai', itemsOf, badgeOf });
  return {
    handle: room.handle,
    count: room.count,
    kick: room.kick,
    mute: room.mute,
    setItems: room.setItems,
    setBadge: room.setBadge,
  };
}
