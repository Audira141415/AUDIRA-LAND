/**
 * Script untuk mempartisi bangunan ke dua sisi dengan pengurutan kedekatan sungai:
 * - KIRI (WEST, i <= 105): DESA HAVE (stage: 'jadi')
 * - KANAN (EAST, i >= 110): DESA HAVE-NOT (stage: 'bangun', 'sketsa', dan 6 proyek vital)
 * - TENGAH (i = 106..109): SUNGAI LUAS (32 METER)
 */

const fs = require('fs');
const path = require('path');

const srcPath = path.resolve('F:/AUDIRA-INTEGRASI-BLEDER-ROBLOX/AUDIRA-LAND/web/data/live_buildings.json');
const destPublicPath = path.resolve('F:/AUDIRA-INTEGRASI-BLEDER-ROBLOX/AUDIRA-LAND/web/public/data/live_buildings.json');

const rawData = JSON.parse(fs.readFileSync(srcPath, 'utf8'));

const T = 8.0;
const HALF = 108;
const PD = 43;

const roadI = a => {
    const t = a % PD;
    return t < 2 ? 3 : ((t - 2) % 7 === 6 ? 2 : 0);
};
const roadJ = a => {
    const t = a % PD;
    return t < 2 ? 3 : ((t - 2) % 3 === 2 ? 1 : 0);
};

// Lot yang valid: bukan jalan dan di luar koridor sungai (106..109)
const isLeftLot = (i, j) => i >= 84 && i <= 105 && j >= 86 && j <= 129 && roadI(i) === 0 && roadJ(j) === 0;
const isRightLot = (i, j) => i >= 110 && i <= 132 && j >= 86 && j <= 129 && roadI(i) === 0 && roadJ(j) === 0;

// Kumpulkan seluruh kavling kiri dan kanan
let leftLots = [];
for (let j = 86; j <= 129; j++) {
    for (let i = 84; i <= 105; i++) {
        if (isLeftLot(i, j)) {
            const worldX = (i - HALF) * T + T / 2;
            const worldZ = (j - HALF) * T + T / 2;
            // Jarak ke tepi barat sungai (X = -16) dan jalan utama tengah (Z = 0)
            const dist = Math.hypot(worldX - (-16.0), worldZ * 0.7);
            leftLots.push({ i, j, worldX, worldZ, dist });
        }
    }
}

let rightLots = [];
for (let j = 86; j <= 129; j++) {
    for (let i = 110; i <= 132; i++) {
        if (isRightLot(i, j)) {
            const worldX = (i - HALF) * T + T / 2;
            const worldZ = (j - HALF) * T + T / 2;
            // Jarak ke tepi timur sungai (X = +16) dan jalan utama tengah (Z = 0)
            const dist = Math.hypot(worldX - 16.0, worldZ * 0.7);
            rightLots.push({ i, j, worldX, worldZ, dist });
        }
    }
}

// Urutkan kavling dari yang paling dekat ke tepi sungai dan pusat kota
leftLots.sort((a, b) => a.dist - b.dist);
rightLots.sort((a, b) => a.dist - b.dist);

console.log(`Tersedia ${leftLots.length} kavling di DESA HAVE (Kiri)`);
console.log(`Tersedia ${rightLots.length} kavling di DESA HAVE-NOT (Kanan)`);

// Pisahkan bangunan yang ada
const haveBuildings = rawData.filter(b => b.stage === 'jadi');
const havenotBuildings = rawData.filter(b => b.stage === 'bangun' || b.stage === 'sketsa');

// Urutkan bangunan Have: fasilitas publik penting di depan / tepi sungai
const priorityTypes = ['balai_kota', 'istana', 'rs', 'pasar', 'sekolah', 'ibadah', 'bank', 'taman', 'warung_madura', 'warung_kopi', 'kafe'];
haveBuildings.sort((a, b) => {
    const pA = priorityTypes.includes(a.type) ? 0 : 1;
    const pB = priorityTypes.includes(b.type) ? 0 : 1;
    return pA - pB;
});

// Petakan bangunan HAVE ke kavling kiri
const partitionedHave = haveBuildings.map((b, idx) => {
    const lot = leftLots[idx % leftLots.length];
    const w = b.width || 1;
    const h = b.height || 1;
    const worldX = (lot.i - HALF) * T + (w * T) / 2;
    const worldZ = (lot.j - HALF) * T + (h * T) / 2;

    return {
        ...b,
        grid_i: lot.i,
        grid_j: lot.j,
        worldX,
        worldZ,
        is_have: true,
        zone: 'DESA_HAVE_BARAT',
        status_label: 'HAVE (Sudah Ada)'
    };
});

// 6 Bangunan Fasilitas Vital HAVE-NOT
const vitalProjects = [
    {
        id: 'vital-lumbung-padi',
        type: 'sawah',
        title: 'Proyek Lumbung Padi & Cadangan Pangan',
        stage: 'bangun',
        progress: 0.35,
        width: 2,
        height: 2,
        desc: 'Silo penyimpanan beras dan cadangan logistik desa.'
    },
    {
        id: 'vital-koperasi-desa',
        type: 'toko',
        title: 'Proyek Koperasi Gotong Royong',
        stage: 'bangun',
        progress: 0.45,
        width: 1,
        height: 1,
        desc: 'Pusat simpan pinjam warga dan distribusi pupuk subsidi.'
    },
    {
        id: 'vital-pustu-medis',
        type: 'rs',
        title: 'Proyek Puskesmas Pembantu (Pustu)',
        stage: 'bangun',
        progress: 0.20,
        width: 2,
        height: 1,
        desc: 'Pos layanan kesehatan primer dan balai pengobatan warga.'
    },
    {
        id: 'vital-bank-sampah',
        type: 'lahan_material',
        title: 'Proyek Bank Sampah Mandiri',
        stage: 'bangun',
        progress: 0.50,
        width: 1,
        height: 1,
        desc: 'Pusat pemilahan sampah organik & bank daur ulang.'
    },
    {
        id: 'vital-blk-komputer',
        type: 'sekolah',
        title: 'Proyek Balai Latihan Kerja (BLK)',
        stage: 'sketsa',
        progress: 0.05,
        width: 2,
        height: 1,
        desc: 'Pusat pelatihan kejuruan & literasi digital warga.'
    },
    {
        id: 'vital-plts-surya',
        type: 'pln',
        title: 'Proyek PLTS Surya Mandiri',
        stage: 'sketsa',
        progress: 0.10,
        width: 1,
        height: 1,
        desc: 'Pembangkit Listrik Tenaga Surya ramah lingkungan desa.'
    }
];

// Gabungkan proyek havenot yang ada dengan 6 proyek vital
// Tempatkan 6 proyek vital di paling depan tepi sungai
const allHavenotList = [...vitalProjects, ...havenotBuildings.filter(x => !x.id.startsWith('vital-'))];

// Petakan bangunan HAVE-NOT ke kavling kanan (mulai dari tepi sungai terdekat)
const partitionedHavenot = allHavenotList.map((b, idx) => {
    const lot = rightLots[idx % rightLots.length];
    const w = b.width || 1;
    const h = b.height || 1;
    const worldX = (lot.i - HALF) * T + (w * T) / 2;
    const worldZ = (lot.j - HALF) * T + (h * T) / 2;

    return {
        ...b,
        grid_i: lot.i,
        grid_j: lot.j,
        worldX,
        worldZ,
        is_have: false,
        zone: 'DESA_HAVENOT_TIMUR',
        status_label: b.stage === 'bangun' ? 'HAVE-NOT (Dalam Konstruksi)' : 'HAVE-NOT (Sketsa Rancangan)'
    };
});

const finalDataset = [...partitionedHave, ...partitionedHavenot];
console.log(`Total bangunan akhir: ${finalDataset.length}`);
console.log(`- Desa Have (Kiri, X < -16m): ${partitionedHave.length}`);
console.log(`- Desa Have-Not (Kanan, X > +16m): ${partitionedHavenot.length}`);

// Simpan ke web/data dan web/public/data
fs.writeFileSync(srcPath, JSON.stringify(finalDataset, null, 2), 'utf8');
fs.writeFileSync(destPublicPath, JSON.stringify(finalDataset, null, 2), 'utf8');
console.log('Berhasil memperbarui data live_buildings.json dengan perataan tepi sungai!');
