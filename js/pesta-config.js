/* Pesta rumah: atur room sebelum taman.js jalan. /pesta.html?h=<username tuan rumah> */
(function () {
  'use strict';
  const h = (new URLSearchParams(location.search).get('h') || '').trim().toLowerCase().replace(/^@+/, '');
  const ok = /^(?!\.)(?!.*\.\.)[a-z0-9._]{1,30}(?<!\.)$/.test(h);
  const ROOM = { room: 'pesta:' + h, map: 'js/pesta-map.json', kind: 'pesta', host: h, theme: 'santai', party: null, tema: {}, skew: 0 };
  ROOM.ready = ok
    ? fetch('/api/pesta', { cache: 'no-store' }).then(r => r.json()).then(d => {
      ROOM.tema = d.tema;
      ROOM.skew = d.now - Date.now();
      ROOM.party = d.parties.find(p => p.host === h) || null;
      if (ROOM.party) ROOM.theme = ROOM.party.theme;
    }).catch(() => {})
    : Promise.resolve();
  window.ROOM = ROOM;
})();
