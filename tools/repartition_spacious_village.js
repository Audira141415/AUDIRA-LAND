/**
 * Script untuk mempartisi ulang Desa Have-Not menjadi desa asri dengan:
 * - Ukuran kavling lebih luas (2x2 tiles = 16m x 16m)
 * - Jarak antar rumah longgar (step 4 tiles = 32m antar pusat kavling)
 * - Suasana pedesaan dengan pekarangan berkebun
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

// 1. Ambil seluruh bangunan Desa Have (tetap 496 bangunan di barat X < -16m)
const haveBuildings = rawData.filter(b => b.is_have);
console.log(`Desa Have tetap: ${haveBuildings.length} bangunan`);

// 2. Bangun daftar kavling luas untuk Desa Have-Not (Timur, X >= +18m / i >= 111)
// Step 4 tiles pada i dan j agar setiap kavling memiliki ruang 16m x 16m + pekarangan luas
const spaciousHavenotLots = [];

for (let j = 84; j <= 132; j += 4) {
    for (let i = 112; i <= 144; i += 4) {
        // Pastikan tidak berada di atas jalan protokol arteri
        if (roadI(i) !== 3 && roadJ(j) !== 3) {
            const worldX = (i - HALF) * T + (2 * T) / 2; // Center 2x2
            const worldZ = (j - HALF) * T + (2 * T) / 2;
            const dist = Math.hypot(worldX - 18.0, worldZ * 0.7);
            spaciousHavenotLots.push({ i, j, worldX, worldZ, dist });
        }
    }
}

// Urutkan dari yang paling dekat ke tepi timur sungai dan pusat kota
spaciousHavenotLots.sort((a, b) => a.dist - b.dist);
console.log(`Ditemukan ${spaciousHavenotLots.length} kavling pedesaan luas (16m x 16m) di Desa Have-Not.`);

// 3. Ambil seluruh bangunan/proyek Have-Not
const havenotBuildings = rawData.filter(b => !b.is_have);

// Daftar nama pedesaan asri untuk memperkaya atmosfer desa gotong royong
const villageCompoundTitles = [
    { title: 'Lumbung Padi & Silo Cadangan Pangan Desa', type: 'sawah', desc: 'Pusat penyimpanan gabah dan ketahanan pangan gotong royong warga desa.' },
    { title: 'Koperasi Tani & Pupuk Organik Gotong Royong', type: 'toko', desc: 'Distribusi bibit unggul, pupuk kompos alami, dan sarana pertanian.' },
    { title: 'Puskesmas Pembantu (Pustu) & Apotek Herbal', type: 'rs', desc: 'Pos kesehatan desa dengan tanaman obat keluarga (TOGA) di pekarangan.' },
    { title: 'Balai Latihan Kerja & Agribisnis Pemuda Desa', type: 'sekolah', desc: 'Sentra edukasi perkebunan organik, hidroponik, dan kerajinan bambu.' },
    { title: 'Bank Sampah Mandiri & Rumah Kompos Organik', type: 'lahan_material', desc: 'Pengolahan pupuk hijau dan budidaya maggot pakan ternak.' },
    { title: 'Pembangkit Listrik Tenaga Surya & Bio-Gas Desa', type: 'pln', desc: 'Energi mandiri ramah lingkungan untuk pengairan sawah dan pompa air.' },
    { title: 'Rumah Limasan Pak Mulyo (Pekarangan Cabai & Tomat)', type: 'rumah_limas', desc: 'Hunian kayu jati asri berpekarangan tanaman cabai, terong, dan kolam ikan.' },
    { title: 'Rumah Panggung Bu Siti (Kebun Sayur & Jagung Manis)', type: 'rumah', desc: 'Hunian panggung tradisional dengan kebun jagung dan pohon pisang raja.' },
    { title: 'Pondok Petani Pak Slamet (Kebun Singkong & Ubi)', type: 'rumah', desc: 'Gubuk santai di tengah kebun singkong dan pohon pepaya berbuah lebat.' },
    { title: 'Rumah Tingkat Desa (Pekarangan Bunga & Saung Bambu)', type: 'rumah2', desc: 'Hunian keluarga bertingkat dengan saung santai dan kandang ayam jago.' },
    { title: 'Sentra Bibit Buah & Kebun Mangga Harum Manis', type: 'kebun', desc: 'Pembibitan mangga, jambu air, dan alpukat mentega unggulan desa.' },
    { title: 'Peternakan Ayam Kampung & Bebek Petelur Asri', type: 'kebun', desc: 'Kandang ayam bambu tradisional dan kebun pakan hijau subur.' },
    { title: 'Kolam Budidaya Ikan Nila & Gurame Tirta Asri', type: 'taman', desc: 'Kolam air tawar beratap paranet dan pekarangan kangkung air.' },
    { title: 'Warung Kopi Saung Bambu & Pisang Goreng Desa', type: 'warung_kopi', desc: 'Tempat cangkrukan santai petani setelah mencangkul di kebun.' },
    { title: 'Pos Siskamling Ronda & Kentongan Jati Desa', type: 'pos_ronda', desc: 'Pos panggung kayu penjaga keamanan pekarangan dan ketentraman warga.' },
    { title: 'Pangkalan Ojek Tani & Gerobak Sayur Keliling', type: 'pangkalan', desc: 'Armada pengangkut hasil panen kebun menuju pasar desa.' },
    { title: 'Pasar Sayur Segar & Hasil Bumi Gotong Royong', type: 'pasar', desc: 'Pasar lelang komoditas tani langsung dari petani ke pembeli.' },
    { title: 'Saung Lesehan Agrowisata & Taman Bunga Marigold', type: 'saung_bambu', desc: 'Spot istirahat agrowisata dengan pemandangan kebun sayur bertingkat.' }
];

// Petakan bangunan Have-Not ke kavling pedesaan luas
const partitionedHavenot = havenotBuildings.map((b, idx) => {
    const lot = spaciousHavenotLots[idx % spaciousHavenotLots.length];
    const villageMeta = villageCompoundTitles[idx % villageCompoundTitles.length];

    // Ukuran kavling desa luas: 2x2 tiles (16m x 16m)
    const w = 2;
    const h = 2;
    const worldX = (lot.i - HALF) * T + (w * T) / 2;
    const worldZ = (lot.j - HALF) * T + (h * T) / 2;

    const isVitalHeavyProject = (b.id && b.id.startsWith('vital-') && (b.type === 'sawah' || b.type === 'rs'));

    return {
        ...b,
        title: b.title || villageMeta.title,
        desc: villageMeta.desc || b.desc,
        grid_i: lot.i,
        grid_j: lot.j,
        width: w,
        height: h,
        worldX,
        worldZ,
        is_have: false,
        is_village_compound: true, // Flag khusus desa berkebun
        has_crane: isVitalHeavyProject, // Hanya proyek berat vital yang pakai derek
        zone: 'DESA_HAVENOT_TIMUR',
        status_label: b.stage === 'bangun' ? 'HAVE-NOT (Pembangunan Pekarangan)' : 'HAVE-NOT (Rancangan Kebun)',
        yard_features: {
            has_garden_beds: true,
            has_bamboo_fence: true,
            has_fruit_trees: true,
            has_water_well: idx % 3 === 0,
            has_chicken_coop: idx % 2 === 0,
            has_bamboo_gazebo: idx % 4 === 0
        }
    };
});

const finalDataset = [...haveBuildings, ...partitionedHavenot];
console.log(`Total bangunan akhir: ${finalDataset.length}`);
console.log(`- Desa Have (Barat, X < -16m): ${haveBuildings.length}`);
console.log(`- Desa Have-Not (Timur, X >= +18m): ${partitionedHavenot.length} (Kavling Luas 16m x 16m)`);

fs.writeFileSync(srcPath, JSON.stringify(finalDataset, null, 2), 'utf8');
fs.writeFileSync(destPublicPath, JSON.stringify(finalDataset, null, 2), 'utf8');
console.log('Berhasil memperbarui data live_buildings.json dengan format desa asri & kavling berkebun luas!');

