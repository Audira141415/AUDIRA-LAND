/**
 * AUDIRA-LAND: State Manajemen Pemain, Warga & Ekonomi Kota (Player State & Economy)
 * Menyimpan profil warga, koin, profesi, peran, riwayat kerja, cooldown 10 menit,
 * batas harian 300 ₳, kas kota gotong royong, dan sinkronisasi ke Supabase / LocalStorage.
 */

import { registerPlayer, registerHome, workAtBuilding, harvestBuilding, setCrop as setCropServer, syncRpc, isServerId, setAuthCitizen } from '../api/client.js';
import { isCrop, getCrop } from './crops.js';
import { HOUSE_BUILD_MS, cleanIgUsername, getProfession, getVillage, professionBonusFor } from './professions.js';
import { homeKitFor, HOME_KITS } from './home_catalog.js';

/**
 * Tebak desa + profesi pemilik dari model rumah & kendaraan (pf_house + pf_vehicle unik per
 * Desa × Profesi di HOME_KITS). Dipakai untuk rumah warga lain yang profilnya tidak ada di browser ini.
 */
function kitOwnerOf(b) {
    if (!b || !b.pf_house) return null;
    let loose = null;
    for (const [village, profs] of Object.entries(HOME_KITS)) {
        for (const [professionId, k] of Object.entries(profs)) {
            if (k.house !== b.pf_house) continue;
            const hit = { village, professionId, houseLabel: k.houseLabel, vehicleLabel: k.vehicleLabel };
            if (!b.pf_vehicle || k.vehicle === b.pf_vehicle) return hit;
            loose = loose || hit;
        }
    }
    return loose;
}

/**
 * Salin hasil RPC register_home ke data rumah lokal & warga: model kit, kavling, dan jam bangun
 * dari server. server_id dipakai main.js agar baris server tidak dimuat dobel dengan cache lokal.
 */
function applyServerHome(home, citizen, res) {
    const b = res && res.success && res.building;
    if (!b) return;
    Object.assign(home, {
        server_id: b.id,
        pf_house: b.pf_house, pf_vehicle: b.pf_vehicle, vehicle_len: b.vehicle_len,
        grid_i: b.grid_i, grid_j: b.grid_j,
        build_started_at: b.build_started_at, build_finished_at: b.build_finished_at
    });
    if (res.house_label) home.title = `${res.house_label} ${home.owner || ''}`.trim();
    citizen.homeServerId = b.id;
    if (res.vehicle_label) citizen.vehicleLabel = res.vehicle_label;
    citizen.vehicleId = b.pf_vehicle || citizen.vehicleId;
}
import { computeWage, harvestStatus, identityOf, villageIdOf } from './village_identity.js';

class PlayerStateManager {
    constructor() {
        // Aturan kota dari Panel Pengelola (settings + city_controls di snapshot); server tetap penentu.
        this.rules = { cooldownMin: 10, dailyCap: 300, wageMult: 1 };
        this.storageKey = 'audira_land_player_profile';
        this.citizensListKey = 'audira_land_registered_citizens';
        this.newsStorageKey = 'audira_land_city_news';
        this.treasuryStorageKey = 'audira_land_city_treasury';
        this.listeners = new Set();
        this.newsListeners = new Set();

        // 1. Muat Profil Warga
        const loaded = this.loadState();
        this.state = loaded || {
            isRegistered: false,
            id: this.generateUUID(),
            username: 'Tamu Netizen',
            profession: 'Warga',
            coins: 250, // Modal awal 250 ₳ sesuai blueprint
            role: 'warga',
            avatarColor: '#5B3A24',
            claimedPlots: [],
            totalWorked: 0,
            lastWorkedAt: null,
            todayEarnedCoins: 0,
            todayDate: this.getTodayDateString(),
            createdAt: new Date().toISOString()
        };

        // Muat Daftar Seluruh Warga yang Terdaftar
        this.citizensList = this.loadCitizensList();
        if (this.state.isRegistered && !this.citizensList.some(c => c.username === this.state.username)) {
            this.citizensList.push({ ...this.state });
            this.saveCitizensList();
        }

        // Pastikan field-field Fase B ada jika memuat data lama
        if (this.state.todayEarnedCoins === undefined) this.state.todayEarnedCoins = 0;
        if (!this.state.todayDate) this.state.todayDate = this.getTodayDateString();
        if (this.state.totalWorked === undefined) this.state.totalWorked = 0;
        // Peran admin lama dari flag lokal (tombol "Jadi Admin") tidak berlaku lagi
        if (!this.state.role || this.state.role === 'super_admin') this.state.role = 'warga';
        if (!this.state.lastHarvest) this.state.lastHarvest = {};
        if (!this.state.lastRent) this.state.lastRent = {};
        if (!this.state.unlockedDistricts) this.state.unlockedDistricts = [];

        // 2. Muat Kas Kota (Default 50,000 ₳ sesuai seed.sql)
        this.cityTreasury = this.loadTreasury();

        // 3. Muat Riwayat Berita Kota
        this.newsList = this.loadNews();

        // Cek reset pergantian hari
        this.checkDailyReset();
        this.syncAuthCitizen();
    }

    /** Beri tahu api/client.js warga mana yang aktif agar RPC memakai login (auth.uid()) warga itu. */
    syncAuthCitizen() {
        setAuthCitizen(this.state.serverId || null, this.citizensList.map(c => c.serverId));
    }

    generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'warga-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36);
    }

    getTodayDateString() {
        // Format YYYY-MM-DD
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    loadState() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.warn('[PlayerState] Gagal membaca localStorage:', e);
            return null;
        }
    }

    saveState() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.state));
            // Update juga di daftar warga
            if (this.state.isRegistered) {
                const idx = this.citizensList.findIndex(c => c.username === this.state.username);
                if (idx >= 0) {
                    this.citizensList[idx] = { ...this.state };
                } else {
                    this.citizensList.push({ ...this.state });
                }
                this.saveCitizensList();
            }
            this.syncAuthCitizen();
            this.notify();
        } catch (e) {
            console.warn('[PlayerState] Gagal menyimpan ke localStorage:', e);
        }
    }

    loadCitizensList() {
        try {
            const raw = localStorage.getItem(this.citizensListKey);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    saveCitizensList() {
        try {
            localStorage.setItem(this.citizensListKey, JSON.stringify(this.citizensList));
        } catch (e) {}
    }

    loadTreasury() {
        try {
            const raw = localStorage.getItem(this.treasuryStorageKey);
            return raw ? parseInt(raw, 10) : 50000;
        } catch (e) {
            return 50000;
        }
    }

    setCityTreasury(amount) {
        this.saveTreasury(amount);
        this.notify();
    }

    saveTreasury(amount) {
        this.cityTreasury = amount;
        try {
            localStorage.setItem(this.treasuryStorageKey, amount.toString());
        } catch (e) {}
        this.notify();
    }

    loadNews() {
        try {
            const raw = localStorage.getItem(this.newsStorageKey);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return [
            { id: 1, category: 'kota', message: 'Selamat datang di AUDIRA-LAND! Kota digital Desa Have & Desa Have-Not resmi beroperasi.' },
            { id: 2, category: 'ekonomi', message: 'Kas Perbendaharaan Kota tercatat 50.000 ₳ untuk subsidi fasilitas publik.' },
            { id: 3, category: 'pembangunan', message: 'Alun-Alun Merdeka (k12) ramai pengunjung di Warung Madura dan Balai Kota.' },
            { id: 4, category: 'warga', message: 'Pendaftaran KTP Digital terbuka untuk 6 Profesi Luhur Nusantara.' }
        ];
    }

    saveNews() {
        try {
            localStorage.setItem(this.newsStorageKey, JSON.stringify(this.newsList.slice(0, 30)));
            this.notifyNews();
        } catch (e) {}
    }

    /**
     * Memeriksa dan mereset akumulasi koin harian saat berganti hari
     */
    checkDailyReset() {
        const today = this.getTodayDateString();
        if (this.state.todayDate !== today) {
            this.state.todayDate = today;
            this.state.todayEarnedCoins = 0;
            this.saveState();
        }
    }

    /**
     * Menghitung sisa jeda waktu istirahat (Cooldown 10 Menit = 600.000 ms)
     */
    getWorkCooldownRemaining() {
        if (!this.state.lastWorkedAt) return 0;
        const elapsed = Date.now() - new Date(this.state.lastWorkedAt).getTime();
        const cooldownMs = this.rules.cooldownMin * 60 * 1000; // default 10 menit, diatur Pemkot
        return Math.max(0, cooldownMs - elapsed);
    }

    /**
     * Validasi apakah warga diizinkan bekerja
     */
    canWork(building = null) {
        this.checkDailyReset();

        // 1. Cek pendaftaran KTP
        if (!this.state.isRegistered) {
            return {
                allowed: false,
                reason: 'not_registered',
                message: 'Silakan daftarkan KTP Digital terlebih dahulu sebelum bekerja!'
            };
        }

        // 2. Cek Cooldown (10 Menit)
        const remaining = this.getWorkCooldownRemaining();
        if (remaining > 0) {
            const sec = Math.ceil(remaining / 1000);
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            return {
                allowed: false,
                reason: 'cooldown',
                remainingMs: remaining,
                timeString: timeStr,
                message: `Kamu baru saja bekerja. Istirahat sejenak! (${timeStr})`
            };
        }

        // 3. Cek Batas Harian (Daily Cap 300 ₳)
        const dailyCap = this.rules.dailyCap;
        if (this.state.todayEarnedCoins >= dailyCap) {
            return {
                allowed: false,
                reason: 'daily_cap',
                earned: this.state.todayEarnedCoins,
                cap: dailyCap,
                message: `Batas koin harianmu sudah penuh (${dailyCap}/${dailyCap} ₳). Kembali besok!`
            };
        }

        return {
            allowed: true,
            earnedToday: this.state.todayEarnedCoins,
            cap: dailyCap,
            wage: this.wageAt(building),
            potentialReward: Math.min(this.wageAt(building).net, dailyCap - this.state.todayEarnedCoins)
        };
    }

    /** Desa warga ini ('have' | 'have_not'); profil lama tanpa desa = 'have'. */
    getVillageId() {
        return this.state.village === 'have_not' ? 'have_not' : 'have';
    }

    /**
     * Profil pemilik sebuah bangunan untuk ditampilkan saat rumah diklik.
     * Diperkaya dari daftar warga terdaftar (profesi, desa, NIK, kendaraan); bila tak
     * ketemu, pakai field pemilik yang menempel di bangunan (owner_name/owner_color).
     */
    getCitizenProfile(building) {
        const b = building || {};
        const match = this.citizensList.find(c =>
            (b.owner_id && (c.id === b.owner_id || c.serverId === b.owner_id)) ||
            (!!b.owner_name && c.username === b.owner_name)
        ) || ((b.owner_id ? this.isMyId(b.owner_id) : this.state.username === b.owner_name) ? this.state : null);

        const src = match || {};
        const kit = kitOwnerOf(b);
        const village = src.village || kit?.village || (b.is_have ? 'have' : (b.zone === 'DESA' ? 'have_not' : 'have'));
        const vil = getVillage(village) || getVillage('have_not');
        const prof = getProfession(src.professionId || b.profession_id || kit?.professionId);
        const idStr = b.owner_id || src.serverId || src.id || '';
        const uname = src.username || b.owner_name || 'Warga';
        const ig = src.igUsername || (src.isInstagramCitizen && uname.startsWith('@') ? uname.slice(1) : null);
        return {
            username: uname,
            igUsername: ig,
            avatarColor: src.avatarColor || b.owner_color || '#5B3A24',
            avatarDataUrl: src.avatarDataUrl || b.avatar_data || null, // warga lokal: dari profil; warga lain: dari kolom server avatar_data (get_district_buildings)
            nik: src.nik || (idStr ? 'AUDIRA-2026-' + String(idStr).substring(0, 5).toUpperCase() : '—'),
            villageTitle: vil.title,
            villageId: vil.id,
            profession: prof ? `${prof.icon} ${prof.title}` : (src.profession || 'Warga'),
            houseTitle: b.title || (kit ? `${kit.houseLabel} ${uname}` : 'Rumah Warga'),
            houseLabel: src.houseLabel || kit?.houseLabel || null,
            vehicleLabel: src.vehicleLabel || kit?.vehicleLabel || null,
            createdAt: src.createdAt || null,
            coins: (typeof src.coins === 'number') ? src.coins : null,
            isMe: b.owner_id ? this.isMyId(b.owner_id) : this.state.username === b.owner_name
        };
    }

    /**
     * Id warga ini: id lokal (bangunan buatan browser) atau id akun Supabase `serverId`
     * (bangunan dari server, `owner_id` = auth.uid()). Keduanya dihitung "milik sendiri".
     */
    isMyId(id) {
        return !!id && (id === this.state.id || (!!this.state.serverId && id === this.state.serverId));
    }

    /** Id yang dibandingkan dengan owner_id bangunan ini (lihat isMyId). */
    myIdFor(building) {
        return building && this.isMyId(building.owner_id) ? building.owner_id : this.state.id;
    }

    /** Simpan id akun server dari hasil register_player (dipakai cek kepemilikan & gotong royong). */
    rememberServerPlayer(res) {
        const id = res && res.data && res.data.player && res.data.player.id;
        if (id && id !== this.state.serverId) {
            this.state.serverId = id;
            this.saveState();
        }
    }

    /**
     * Upah kerja di bangunan ini menurut aturan desa (village_identity.js):
     * upah dasar desa tempat kerja, bonus profesi +50%, gotong royong (Have-Not), pajak kota (Have).
     */
    wageAt(building) {
        const w = computeWage({
            playerVillage: this.getVillageId(),
            playerId: this.myIdFor(building),
            playerName: this.state.username,
            building,
            professionBonus: base => professionBonusFor(this.state.professionId, building && building.type, base)
        });
        const m = this.rules.wageMult;
        if (m !== 1) {
            const ratio = w.gross ? w.tax / w.gross : 0;
            w.gross = Math.round(w.gross * m);
            w.tax = Math.round(w.gross * ratio);
            w.net = w.gross - w.tax;
        }
        return w;
    }

    /** Status panen bangunan milik sendiri (sawah / kebun_sayur di Desa Have-Not). */
    getHarvestStatus(building) {
        const own = building && ((building.owner_id && this.isMyId(building.owner_id)) ||
            (!building.owner_id && building.owner_name === this.state.username));
        if (!own) return { eligible: false, ready: false, amount: 0, remainingMs: 0 };
        return harvestStatus(building, (this.state.lastHarvest || {})[building.id]);
    }

    /** Panen: 15 ₳ ke pemilik, sekali tiap 24 jam per bangunan. */
    async harvest(building) {
        const st = this.getHarvestStatus(building);
        if (!st.eligible) return { success: false, reason: 'not_eligible', message: 'Bangunan ini tidak bisa dipanen.' };
        if (!st.ready) {
            const h = Math.ceil(st.remainingMs / 3600000);
            return { success: false, reason: 'cooldown', remainingMs: st.remainingMs, message: `Belum waktunya panen. Kembali sekitar ${h} jam lagi.` };
        }
        // Server dulu (bangunan server saja): ditolak = saldo lokal tidak berubah
        let amount = st.amount;
        let serverCoins = null;
        if (isServerId(building.id)) {
            const r = await syncRpc(() => harvestBuilding(building.id));
            if (r.status === 'failed') {
                return { success: false, reason: 'server', message: r.message };
            }
            if (r.status === 'ok' && r.data) {
                amount = r.data.amount ?? amount;
                serverCoins = r.data.total_coins ?? null;
            }
        }
        this.state.lastHarvest = { ...(this.state.lastHarvest || {}), [building.id]: new Date().toISOString() };
        this.state.coins = serverCoins ?? (this.state.coins + amount);
        this.saveState();
        this.addNews('ekonomi', `🌾 ${this.state.username} memanen ${building.title || building.type} dan memperoleh +${amount} ₳.`);
        return { success: true, amount, totalCoins: this.state.coins };
    }

    /** Pemilik sawah ini? */
    ownsBuilding(building) {
        return !!(building && ((building.owner_id && this.isMyId(building.owner_id)) ||
            (!building.owner_id && building.owner_name === this.state.username)));
    }

    /**
     * Pilih tanaman sawah milik sendiri. Tanam ulang = jeda panen mulai dari awal.
     * @returns {Promise<{success:boolean, crop?:string, message?:string}>}
     */
    async setCrop(building, cropId) {
        if (!building || building.type !== 'sawah') return { success: false, message: 'Hanya sawah yang bisa dipilih tanamannya.' };
        if (!this.ownsBuilding(building)) return { success: false, message: 'Hanya pemilik sawah yang bisa menanam.' };
        if (!isCrop(cropId)) return { success: false, message: 'Tanaman tidak dikenal.' };
        if (building.crop === cropId) return { success: true, crop: cropId };
        // Server dulu (bangunan server saja): ditolak = tanaman lokal tidak berubah
        if (isServerId(building.id)) {
            const r = await syncRpc(() => setCropServer(building.id, cropId));
            if (r.status === 'failed') return { success: false, message: r.message };
        }
        building.crop = cropId;
        // Tanam ulang: reset jeda panen supaya tanaman baru tumbuh dari awal
        this.state.lastHarvest = { ...(this.state.lastHarvest || {}), [building.id]: new Date().toISOString() };
        this.saveState();
        const c = getCrop(cropId);
        this.addNews('ekonomi', `${c.icon} ${this.state.username} menanam ${c.name} di sawahnya.`);
        return { success: true, crop: cropId };
    }

    /**
     * Status sewa bangunan usaha milik sendiri (bukan rumah, bukan fasilitas publik).
     * Sewa pasif 12 ₳/jam sampai batas 288 ₳ (24 jam), dikumpulkan manual.
     */
    getRentStatus(building) {
        const b = building || {};
        const own = b.owner_id ? this.isMyId(b.owner_id) : b.owner_name === this.state.username;
        const isHouse = /^rumah/.test(b.type || '');
        if (!own || isHouse || b.is_public || b.stage === 'proyek') {
            return { eligible: false, ready: false, amount: 0, perHour: 0, cap: 0 };
        }
        const RATE = 12, CAP = 288, MIN = 10;
        const since = (this.state.lastRent || {})[b.id]
            ? new Date(this.state.lastRent[b.id]).getTime()
            : new Date(b.build_finished_at || b.build_started_at || Date.now()).getTime();
        const hrs = Math.max(0, (Date.now() - since) / 3600000);
        const amount = Math.min(CAP, Math.floor(hrs * RATE));
        return { eligible: true, ready: amount >= MIN, amount, perHour: RATE, cap: CAP };
    }

    /** Kumpulkan sewa bangunan usaha milik sendiri (min. 10 ₳). */
    collectRent(building) {
        const st = this.getRentStatus(building);
        if (!st.eligible) return { success: false, message: 'Bangunan ini tidak menghasilkan sewa.' };
        if (!st.ready) return { success: false, message: 'Sewa belum cukup terkumpul (min. 10 ₳). Tunggu beberapa saat lagi.' };
        this.state.lastRent = { ...(this.state.lastRent || {}), [building.id]: new Date().toISOString() };
        this.state.coins += st.amount;
        this.saveState();
        this.addNews('ekonomi', `🏪 ${this.state.username} menerima sewa ${st.amount} ₳ dari ${building.title || building.type}.`);
        return { success: true, amount: st.amount, totalCoins: this.state.coins };
    }

    /** Distrik yang sudah terbuka untuk warga (k12 selalu terbuka). */
    isDistrictUnlocked(key) {
        return key === 'k12' || (this.state.unlockedDistricts || []).includes(key);
    }

    /** Buka distrik baru secara gotong royong memakai Kas Kota. */
    unlockDistrict(key, cost) {
        if (this.isDistrictUnlocked(key)) return { success: false, message: 'Distrik ini sudah terbuka.' };
        if (this.cityTreasury < cost) return { success: false, message: `Kas Kota belum cukup (${this.cityTreasury}/${cost} ₳).` };
        this.saveTreasury(this.cityTreasury - cost);
        this.state.unlockedDistricts = [...(this.state.unlockedDistricts || []), key];
        this.saveState();
        this.addNews('pembangunan', `🗺️ Distrik ${key} dibuka gotong royong memakai Kas Kota (−${cost} ₳).`);
        return { success: true, treasury: this.cityTreasury };
    }

    /**
     * Eksekusi Bekerja di Bangunan (FASE B)
     */
    async executeWork(building) {
        const validation = this.canWork(building);
        if (!validation.allowed) {
            return { success: false, ...validation };
        }

        // Aturan desa (village_identity.js): upah dasar desa tempat kerja + bonus profesi
        // + gotong royong (Have-Not) − pajak kota 10% (Have). Dibatasi sisa batas harian.
        const wage = this.wageAt(building);
        const dailyCap = this.rules.dailyCap;
        const room = dailyCap - this.state.todayEarnedCoins;
        if (room <= 0) {
            return { success: false, reason: 'daily_cap', message: 'Batas harian penuh.' };
        }
        let reward = Math.min(wage.net, room);
        // Pajak ikut dipotong proporsional bila upah terpotong batas harian
        let taxAmount = reward < wage.net ? Math.round(reward * identityOf(wage.village).economy.cityTaxRate) : wage.tax;

        // 0. Server dulu (bangunan server saja). Ditolak = batal tanpa mengubah saldo;
        //    diterima = angka server (upah, pajak, saldo) jadi kebenaran.
        let serverCoins = null;
        if (isServerId(building.id)) {
            const r = await syncRpc(() => workAtBuilding(building.id));
            if (r.status === 'failed') {
                return { success: false, reason: 'server', message: r.message };
            }
            if (r.status === 'ok' && r.data) {
                reward = r.data.reward ?? reward;
                taxAmount = r.data.tax ?? taxAmount;
                serverCoins = r.data.total_coins ?? null;
            }
        }

        // 1. Mutasi State Lokal
        this.state.coins = serverCoins ?? (this.state.coins + reward);
        this.state.todayEarnedCoins += reward;
        this.state.totalWorked += 1;
        this.state.lastWorkedAt = new Date().toISOString();
        this.saveState();

        // 2. Setor Pajak ke Kas Kota
        const newTreasury = this.cityTreasury + taxAmount;
        this.saveTreasury(newTreasury);

        // 3. Siarkan Berita Kota Otomatis
        const bldName = building.title || building.name || building.type || 'Pusat Kota';
        this.addNews(
            'ekonomi',
            `💼 ${this.state.username} bekerja di ${bldName} dan memperoleh +${reward} ₳${wage.matched ? ` (bonus ${wage.profession.title})` : ''}` +
            (wage.gotongRoyong ? ` (bantu tetangga +${wage.gotongRoyong} ₳)` : '') +
            (taxAmount ? `. Pajak kota +${taxAmount} ₳ disetor ke Kas Kota!` : '.')
        );

        return {
            success: true,
            reward,
            bonus: wage.matched ? Math.min(wage.bonus, reward) : 0,
            matched: wage.matched,
            gotongRoyong: wage.gotongRoyong,
            village: wage.village,
            taxAmount,
            totalCoins: this.state.coins,
            treasury: newTreasury,
            todayEarned: this.state.todayEarnedCoins,
            dailyCap
        };
    }

    /**
     * Reset Jeda Kerja Khusus Debug / Pengujian Pengembang
     */
    resetCooldownForDev() {
        this.state.lastWorkedAt = null;
        this.saveState();
    }

    /**
     * Mendaftarkan Warga Baru
     */
    async register(username, profession, avatarColor) {
        this.state.username = username.trim();
        this.state.profession = profession;
        this.state.avatarColor = avatarColor || '#5B3A24';
        this.state.isRegistered = true;
        this.state.coins = Math.max(250, this.state.coins);

        this.saveState();

        this.addNews(
            'warga',
            `📜 ${this.state.username} resmi menjadi warga AUDIRA-LAND dengan profesi ${this.state.profession}!`
        );

        // Coba sinkronisasi ke PostgreSQL Supabase jika online
        try {
            const res = await registerPlayer(this.state.username, this.state.profession, this.state.avatarColor);
            this.rememberServerPlayer(res);
            if (res && res.data) {
                console.log('[PlayerState] Profil warga tersinkronisasi ke database Supabase.');
            }
        } catch (err) {
            console.warn('[PlayerState] Sinkronisasi offline (data tersimpan di browser):', err.message);
        }

        return this.state;
    }

    /**
     * Mendaftarkan warga baru tambahan (Multi-Citizen Gotong Royong)
     */

    /**
     * Mendaftarkan Warga Resmi via Instagram (@audira.id)
     * Alur: username IG -> pilih desa (have / have_not) -> pilih profesi -> rumah dibangun 5 menit.
     * @param {object} opts
     * @param {string} opts.igUsername
     * @param {string} opts.village      'have' | 'have_not'
     * @param {string} opts.professionId id dari PROFESSIONS
     * @param {string} [opts.avatarColor]
     * @param {(village: object) => ({gridI:number, gridJ:number, worldX:number, worldZ:number}|null)} opts.findLot
     *        pencari kavling kosong di sisi sungai desa terpilih (disediakan main.js)
     */
    async registerViaInstagram({ igUsername, village, professionId, avatarColor, avatarDataUrl, findLot }) {
        const clean = cleanIgUsername(igUsername);
        if (!clean) throw new Error('Username Instagram tidak valid (huruf, angka, titik, garis bawah).');
        const vil = getVillage(village);
        if (!vil) throw new Error('Pilih desa tempat tinggal dulu.');
        const prof = getProfession(professionId);
        if (!prof) throw new Error('Pilih profesi dulu.');
        if (prof.village !== vil.id) throw new Error(`Profesi ${prof.title} tidak tersedia di ${vil.title}.`);

        // Username yang sudah terdaftar: pakai warga lama, jangan buat rumah kedua
        const existing = this.citizensList.find(c => c.igUsername === clean);
        if (existing) {
            this.state = { ...existing };
            this.saveState();
            return { citizen: this.state, home: null, alreadyRegistered: true };
        }

        const lot = typeof findLot === 'function' ? findLot(vil) : null;
        if (!lot) throw new Error(`Kavling di ${vil.title} sedang penuh. Coba pilih desa lain.`);

        const now = Date.now();
        const homeId = `rumah-ig-${clean.replace(/\./g, '_')}`;
        // Rumah & kendaraan mengikuti Desa × Profesi (core/home_catalog.js)
        const kit = homeKitFor(vil.id, prof.id);
        const houseLabel = kit ? kit.houseLabel : vil.houseLabel;

        const newCitizen = {
            isRegistered: true,
            id: 'ig-' + clean + '-' + now.toString(36),
            username: '@' + clean,
            igUsername: clean,
            isInstagramCitizen: true,
            nik: `AUDIRA-IG-2026-${Math.floor(1000 + Math.random() * 9000)}`,
            village: vil.id,
            professionId: prof.id,
            profession: prof.title,
            coins: 500, // Bonus warga baru Instagram: 500 ₳
            role: 'warga',
            avatarColor: avatarColor || '#C8553D',
            avatarDataUrl: avatarDataUrl || null, // foto profil unggahan warga (lokal; lintas-perangkat butuh server)
            claimedPlots: [`plot_${lot.gridI}_${lot.gridJ}`],
            homeId,
            houseLabel,
            vehicleId: kit ? kit.vehicle : null,
            vehicleLabel: kit ? kit.vehicleLabel : null,
            totalWorked: 0,
            lastWorkedAt: null,
            todayEarnedCoins: 0,
            todayDate: this.getTodayDateString(),
            createdAt: new Date(now).toISOString(),
            assignedLot: lot
        };

        // Rumah awal: proyek konstruksi 5 menit (perancah + hitung mundur), lalu jadi otomatis
        const homeData = {
            id: homeId,
            type: vil.houseType,
            title: `${houseLabel} @${clean}`,
            pf_house: kit ? kit.house : null,
            pf_vehicle: kit ? kit.vehicle : null,
            vehicle_len: kit ? kit.vehicleLen : null,
            owner: `@${clean}`,
            owner_id: newCitizen.id,
            owner_name: newCitizen.username,
            owner_color: newCitizen.avatarColor,
            stage: 'proyek',
            width: 1,
            height: 1,
            desc: `Rumah ${prof.title.toLowerCase()} @${clean} di ${vil.title}.`,
            grid_i: lot.gridI,
            grid_j: lot.gridJ,
            worldX: lot.worldX,
            worldZ: lot.worldZ,
            is_have: vil.id === 'have',
            zone: vil.id === 'have' ? 'KOTA' : 'DESA',
            is_public: false,
            build_hours_total: HOUSE_BUILD_MS / 3600000,
            build_started_at: new Date(now).toISOString(),
            build_finished_at: new Date(now + HOUSE_BUILD_MS).toISOString()
        };

        this.state = newCitizen;
        this.saveState();

        this.addNews('warga', `🎉 Warga baru @${clean} (${prof.icon} ${prof.title}) pindah ke ${vil.title}! Rumahnya mulai dibangun.`);

        try {
            const reg = await registerPlayer(this.state.username, prof.id, this.state.avatarColor, vil.id, this.state.avatarDataUrl || null);
            this.rememberServerPlayer(reg);
            if (reg && reg.data && reg.data.success) {
                // Server menentukan rumah & kendaraan (home_kits) dan jam selesai bangun
                const res = await registerHome(lot.gridI, lot.gridJ);
                if (res && res.data && !res.data.success) console.warn('[Supabase] register_home ditolak:', res.data.error);
                applyServerHome(homeData, newCitizen, res && res.data);
                this.saveState();
            } else if (reg && reg.data && reg.data.error !== undefined) {
                console.warn('[Supabase] register_player ditolak:', reg.data.error || reg.error);
            } else if (reg && reg.error) {
                console.warn('[Supabase] register_player gagal:', reg.error.message || reg.error);
            }
        } catch (err) {
            console.warn('[Supabase] Pendaftaran ke server gagal:', err);
        }

        return { citizen: newCitizen, home: homeData, alreadyRegistered: false };
    }

    /**
     * Cari warga terdaftar di perangkat ini berdasarkan @username (IG atau nama warga biasa).
     * Hanya melihat citizensList lokal — tidak ada lookup server (auth server pakai sesi anonim,
     * bukan username), jadi warga dari perangkat lain tidak ditemukan di sini.
     */
    findCitizen(name) {
        const clean = cleanIgUsername(name);
        if (!clean) return null;
        const key = clean.toLowerCase();
        return this.citizensList.find(c =>
            (c.igUsername && c.igUsername.toLowerCase() === key) ||
            String(c.username || '').replace(/^@/, '').toLowerCase() === key
        ) || null;
    }

    /**
     * Masuk kembali sebagai warga yang sudah pernah daftar di perangkat ini (ganti akun / login ulang).
     * @returns {{success:boolean, citizen?:object, message?:string}}
     */
    loginByUsername(name) {
        const clean = cleanIgUsername(name);
        if (!clean) return { success: false, message: 'Username tidak valid (huruf, angka, titik, garis bawah).' };
        if (clean.toLowerCase() === String(this.state.username || '').replace(/^@/, '').toLowerCase()) {
            return { success: true, citizen: this.state, alreadyActive: true };
        }
        const c = this.findCitizen(clean);
        if (!c) {
            return { success: false, message: `Warga @${clean} belum terdaftar di perangkat ini. Daftar dulu, atau buka dari browser/HP tempat kamu mendaftar.` };
        }
        this.state = { ...c };
        this.saveState();
        this.addNews('warga', `🔑 @${clean} masuk kembali ke AUDIRA-LAND.`);
        return { success: true, citizen: this.state };
    }

    /** Daftar @username warga yang tersimpan di perangkat ini (untuk saran login). */
    knownUsernames() {
        return this.citizensList
            .filter(c => c.isRegistered)
            .map(c => c.igUsername || String(c.username || '').replace(/^@/, ''))
            .filter(Boolean);
    }

    /**
     * Mengurangi Koin (misal: Klaim Kavling 100 ₳)
     */
    deductCoins(amount) {
        if (this.state.coins < amount) {
            return false;
        }
        this.state.coins -= amount;
        this.saveState();
        return true;
    }

    /**
     * Menambah Koin
     */
    addCoins(amount) {
        this.state.coins += amount;
        this.saveState();
        return this.state.coins;
    }

    /**
     * Menambah Riwayat Kavling yang Dimiliki
     */
    addClaimedPlot(plotKey) {
        if (!this.state.claimedPlots.includes(plotKey)) {
            this.state.claimedPlots.push(plotKey);
            this.saveState();
        }
    }

    /**
     * Menambahkan Berita Kota Otomatis
     */
    addNews(category, message) {
        const item = {
            id: Date.now(),
            category,
            message,
            created_at: new Date().toISOString()
        };
        this.newsList.unshift(item);
        this.saveNews();
    }

    // =========================================================================
    // SUPER ADMIN: hanya dari server. admin_modal.js (chunk lazy) memanggil setAdminVerified(true)
    // setelah RPC admin_whoami memastikan players.role = 'walikota'. Tidak disimpan ke localStorage.
    // =========================================================================
    isSuperAdmin() {
        return this.adminVerified === true;
    }

    setAdminVerified(on) {
        this.adminVerified = !!on;
        this.notify();
    }

    adminBroadcast(message, category = 'pengumuman') {
        this.addNews(category, `📢 [SIARAN PEMKOT] ${message}`);
    }

    // Event Emitter untuk Pemain & Kas Kota
    onChange(callback) {
        this.listeners.add(callback);
        callback(this.state, this.cityTreasury);
        return () => this.listeners.delete(callback);
    }

    notify() {
        for (const cb of this.listeners) {
            try {
                cb(this.state, this.cityTreasury);
            } catch (err) {
                console.error('[PlayerState] Error listener:', err);
            }
        }
    }

    // Event Emitter untuk Ticker Berita
    onNewsChange(callback) {
        this.newsListeners.add(callback);
        callback(this.newsList);
        return () => this.newsListeners.delete(callback);
    }

    notifyNews() {
        for (const cb of this.newsListeners) {
            try {
                cb(this.newsList);
            } catch (err) {
                console.error('[PlayerState] Error news listener:', err);
            }
        }
    }
}

export const playerState = new PlayerStateManager();
