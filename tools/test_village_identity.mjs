// Tes logika aturan main Desa Have / Have-Not (spek docs/SPEC_CIRI_KHAS_DESA.md).
// Jalankan: node tools/test_village_identity.mjs
import assert from 'node:assert/strict';

// Shim localStorage agar player_state.js bisa dimuat di Node
globalThis.window = globalThis.window || {};
const store = new Map();
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
};

const V = await import('../web/src/core/village_identity.js');
const { professionBonusFor } = await import('../web/src/core/professions.js');
const { playerState } = await import('../web/src/core/player_state.js');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok', name); };

// Kavling: tileI 100 = Have (barat), 115 = Have-Not (timur)
t('klaim Have 150 / Have-Not 60', () => {
    assert.equal(V.claimFeeFor({ tileI: 100 }), 150);
    assert.equal(V.claimFeeFor({ tileI: 115 }), 60);
    assert.equal(V.claimFeeFor({ snapX: -40 }), 150);
    assert.equal(V.claimFeeFor({ snapX: 40 }), 60);
});

const haveBld = { id: 'b1', type: 'kantor', grid_i: 100, is_public: true };
const hnPublic = { id: 'b2', type: 'pasar', grid_i: 115, is_public: true };
const wage = (village, b, prof = null, id = 'me', name = 'Aku') => V.computeWage({
    playerVillage: village, playerId: id, playerName: name, building: b,
    professionBonus: base => professionBonusFor(prof, b.type, base)
});

t('upah Have 42, pajak 10% = 4', () => {
    const w = wage('have', haveBld);
    assert.equal(w.base, 42); assert.equal(w.gross, 42); assert.equal(w.tax, 4); assert.equal(w.net, 38);
});
t('upah Have + bonus profesi programmer = 42 + 21', () => {
    const w = wage('have', haveBld, 'programmer');
    assert.equal(w.bonus, 21); assert.equal(w.gross, 63); assert.equal(w.tax, 6);
});
t('upah Have-Not 35 tanpa pajak, bonus pedagang +18', () => {
    const w = wage('have_not', hnPublic, 'pedagang');
    assert.equal(w.base, 35); assert.equal(w.bonus, 18); assert.equal(w.tax, 0); assert.equal(w.gotongRoyong, 0);
});

const hnNeighbor = { id: 'b3', type: 'rumah_limas', grid_i: 120, is_public: false, owner_id: 'other', owner_name: 'Tetangga' };
const hnMine = { ...hnNeighbor, id: 'b4', owner_id: 'me', owner_name: 'Aku' };
const haveNeighbor = { ...hnNeighbor, id: 'b5', grid_i: 90 };
t('gotong royong +10 hanya bangunan warga lain se-desa', () => {
    assert.equal(wage('have_not', hnNeighbor).gotongRoyong, 10);
    assert.equal(wage('have_not', hnNeighbor).net, 45);
    assert.equal(wage('have_not', hnMine).gotongRoyong, 0, 'milik sendiri');
    assert.equal(wage('have', hnNeighbor).gotongRoyong, 0, 'warga Have');
    assert.equal(wage('have_not', haveNeighbor).gotongRoyong, 0, 'bangunan di Desa Have');
    assert.equal(wage('have_not', hnPublic).gotongRoyong, 0, 'fasilitas publik');
    // data lama tanpa owner_id: pakai owner_name
    assert.equal(V.isGotongRoyong({ playerVillage: 'have_not', playerId: 'x', playerName: 'Aku', building: { grid_i: 120, owner_name: 'Aku' } }), false);
});

// Aturan sama dengan work_at_building (SQL): bangunan server (uuid) wajib owner_id
t('gotong royong: bangunan server tanpa owner_id = 0 (sama dengan SQL)', () => {
    const gr = b => V.isGotongRoyong({ playerVillage: 'have_not', playerId: 'me', playerName: 'Aku', building: b });
    const uuid = '0b6f3c1e-8a2d-4c5b-9e7f-1a2b3c4d5e6f';
    assert.equal(gr({ id: uuid, grid_i: 120, owner_name: 'Tetangga' }), false, 'server, hanya owner_name');
    assert.equal(gr({ id: uuid, grid_i: 120, owner_id: 'other', owner_name: 'Tetangga' }), true, 'server, owner_id lain');
    assert.equal(gr({ id: uuid, grid_i: 120, owner_id: 'me', owner_name: 'Aku' }), false, 'server, milik sendiri');
    assert.equal(gr({ id: 'bld-abc', grid_i: 120, owner_name: 'Tetangga' }), true, 'lokal, owner_name cukup');
});

// SQL (supabase/schema.sql) harus menyalin angka klien persis: biaya katalog & tipe Have-Not
const { readFileSync } = await import('node:fs');
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const sql = read('../supabase/schema.sql');
const fnBody = name => {
    const m = sql.match(new RegExp(`function public\\.${name}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`));
    assert.ok(m, `fungsi SQL ${name} ada`);
    return m[1];
};
t('SQL building_catalog = biaya buildingCatalog claim_modal.js', () => {
    const modal = read('../web/src/ui/claim_modal.js');
    const client = {};
    for (const m of modal.matchAll(/id:\s*'([a-z0-9_]+)'[\s\S]*?cost:\s*(\d+)/g)) client[m[1]] = Number(m[2]);
    const server = {};
    for (const m of fnBody('building_catalog').matchAll(/\('([a-z0-9_]+)',\s*(\d+),\s*\d+\)/g)) server[m[1]] = Number(m[2]);
    assert.ok(Object.keys(client).length >= 20, 'katalog klien terbaca');
    assert.deepEqual(server, client);
});
const { HAVE_NOT_ALLOWED } = await import('../web/src/core/village_rules.js');
t('SQL allowed_in_have_not = HAVE_NOT_ALLOWED; klaim memakai katalog + cek Have-Not', () => {
    const server = [...fnBody('allowed_in_have_not').matchAll(/'([a-z0-9_]+)'/g)].map(m => m[1]).sort();
    assert.deepEqual(server, [...HAVE_NOT_ALLOWED].sort());
    const claim = fnBody('claim_plot_and_build');
    assert.match(claim, /building_catalog\(p_type\)/);
    assert.match(claim, /'have_not' and not public\.allowed_in_have_not\(p_type\)/);
    assert.doesNotMatch(claim, /v_build_cost int := 100/);
});

t('panen 15 ₳ tiap 24 jam, hanya sawah/kebun_sayur Have-Not', () => {
    const sawah = { id: 's1', type: 'sawah', grid_i: 120 };
    const now = Date.parse('2026-11-13T00:00:00Z');
    assert.deepEqual(V.harvestStatus(sawah, null, now).ready, true);
    assert.equal(V.harvestStatus(sawah, null, now).amount, 15);
    assert.equal(V.harvestStatus(sawah, new Date(now - 23 * 3600e3).toISOString(), now).ready, false);
    assert.equal(V.harvestStatus(sawah, new Date(now - 24 * 3600e3).toISOString(), now).ready, true);
    assert.equal(V.harvestStatus({ ...sawah, grid_i: 90 }, null, now).eligible, false, 'sawah di Have');
    assert.equal(V.harvestStatus({ ...sawah, type: 'rumah' }, null, now).eligible, false);
});

// Alur lengkap lewat playerState (offline)
playerState.state = { ...playerState.state, isRegistered: true, id: 'me', username: 'Aku', village: 'have_not',
    professionId: 'petani', coins: 100, todayEarnedCoins: 0, lastWorkedAt: null, lastHarvest: {} };
const treasury0 = playerState.cityTreasury;

const sawahMine = { id: 'starter-s', type: 'sawah', grid_i: 120, owner_id: 'me', owner_name: 'Aku', title: 'Sawahku' };
const h1 = await playerState.harvest(sawahMine);
assert.equal(h1.success, true); assert.equal(playerState.state.coins, 115);
const h2 = await playerState.harvest(sawahMine);
assert.equal(h2.success, false); assert.equal(h2.reason, 'cooldown'); assert.equal(playerState.state.coins, 115);
const hOther = await playerState.harvest({ ...sawahMine, id: 'starter-x', owner_id: 'other', owner_name: 'Lain' });
assert.equal(hOther.success, false, 'sawah orang lain');
console.log('  ok panen alur playerState');

const w1 = await playerState.executeWork({ ...hnNeighbor, id: 'starter-n' });
assert.equal(w1.success, true); assert.equal(w1.reward, 45); assert.equal(w1.taxAmount, 0);
assert.equal(playerState.cityTreasury, treasury0, 'Have-Not tanpa pajak');
console.log('  ok kerja gotong royong +45');

// Bangunan server milik sendiri: owner_id = id akun Supabase (serverId), bukan id lokal
{
    const sid = '9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f';
    const prevSid = playerState.state.serverId;
    playerState.state.serverId = sid;
    const ownServer = { id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', type: 'rumah_limas', grid_i: 120, is_public: false, owner_id: sid, owner_name: 'Aku' };
    assert.equal(playerState.isMyId(sid), true);
    assert.equal(playerState.wageAt(ownServer).gotongRoyong, 0, 'milik sendiri (serverId) bukan gotong royong');
    assert.equal(V.isGotongRoyong({ playerVillage: 'have_not', playerId: playerState.myIdFor(ownServer), playerName: 'Aku', building: ownServer }), false, 'jalur hud.js');
    assert.equal(playerState.wageAt({ ...ownServer, owner_id: 'aaaaaaaa-0000-4000-8000-000000000000' }).gotongRoyong, 10, 'tetangga server');
    playerState.state.serverId = prevSid;
    console.log('  ok gotong royong: milik sendiri via serverId = 0');
}

playerState.state.village = 'have'; playerState.state.professionId = null; playerState.state.lastWorkedAt = null;
const w2 = await playerState.executeWork({ ...haveBld, id: 'starter-h' });
assert.equal(w2.reward, 38); assert.equal(w2.taxAmount, 4); assert.equal(playerState.cityTreasury, treasury0 + 4);
console.log('  ok kerja Have: 42 − pajak 4 = 38, kas +4');

console.log(`SEMUA LOLOS (${n + 4} tes)`);
