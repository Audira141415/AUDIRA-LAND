/**
 * AUDIRA-LAND: Rumah & kendaraan warga menurut Desa × Profesi (docs/SPEC_RUMAH_KENDARAAN_PROFESI.md).
 * house / vehicle = id model Polyfork (CC BY 4.0) di public/models/polyfork/<id>.glb.
 * vehicleLen = panjang kendaraan (meter) saat diparkir di kavling.
 */

const K = (house, houseLabel, vehicle, vehicleLabel, vehicleLen) => ({ house, houseLabel, vehicle, vehicleLabel, vehicleLen });

export const HOME_KITS = {
    have: {
        dokter: K('two-storey-family-house-c63c4a', 'Rumah Dokter 2 Lantai', 'ambulance-van-29919a', 'Ambulans', 4.8),
        perawat: K('split-level-house-40fe1a', 'Rumah Split-Level', 'motorcycle-and-sidecar-7d39b8', 'Motor Sespan', 2.4),
        polisi: K('colonial-house-d6f8fd', 'Rumah Dinas Polisi', 'police-cruiser-a2d25e', 'Mobil Patroli', 4.4),
        pemadam: K('brownstone-row-house-1b84fd', 'Rumah Bata Pemadam', 'fire-engine-7d476b', 'Mobil Damkar', 5.6),
        guru: K('two-story-house-40f6dc', 'Rumah Guru', 'family-minivan-924de0', 'Mobil Keluarga', 4.5),
        pedagang: K('three-storey-shophouse-2f6378', 'Ruko 3 Lantai', 'boxy-delivery-van-a3ceae', 'Van Barang', 4.6),
        koki: K('corner-restaurant-unit-d85304', 'Rumah Makan', 'food-truck-3c4e0e', 'Food Truck', 5.0),
        programmer: K('cast-iron-loft-b04b5a', 'Loft Kota', 'wheeled-city-coupe-5c381e', 'Mobil Kota', 4.0),
        seniman: K('gantry-loft-8da389', 'Loft Studio Seni', 'skate-team-tour-van-fb3c89', 'Van Seniman', 4.8)
    },
    have_not: {
        petani: K('thatched-cottage-0e63f5', 'Pondok Tani Jerami', 'ox-cart-9c857f', 'Gerobak Sapi', 4.2),
        nelayan: K('fisherman-shack-ea9b2b', 'Gubuk Nelayan', 'wooden-rowboat-916981', 'Perahu Dayung', 3.6),
        kuli: K('site-cabin-e9ee10', 'Bedeng Kuli', 'wooden-hand-cart-3ae5b5', 'Gerobak Dorong', 2.0),
        peternak: K('log-cabin-4fac3b', 'Rumah Kayu Peternak', 'three-wheeled-delivery-mini-744094', 'Motor Angkut Pakan', 3.2),
        pedagang_keliling: K('open-front-teahouse-c7dd18', 'Warung Rumahan', 'elote-cart-a8fb49', 'Gerobak Jajanan', 2.2),
        ojek: K('crossing-keeper-s-cottage-de49a4', 'Rumah Petak', 'touring-motorcycle-3b1ad3', 'Motor Ojek', 2.3),
        pengrajin: K('plate-cottage-9b52be', 'Pondok Pengrajin', 'flower-bicycle-284d0e', 'Sepeda Keranjang', 1.9),
        buruh: K('porch-front-cottage-620c29', 'Rumah Kontrakan', 'city-bicycle-5b67d1', 'Sepeda Ontel', 1.8)
    }
};

/** Kit rumah + kendaraan untuk kombinasi desa & profesi, atau null. */
export const homeKitFor = (villageId, professionId) => HOME_KITS[villageId]?.[professionId] || null;

/** Semua id model yang dipakai (untuk impor & preload). */
export const ALL_HOME_MODEL_IDS = [...new Set(Object.values(HOME_KITS)
    .flatMap(v => Object.values(v)).flatMap(k => [k.house, k.vehicle]))];

export const homeThumb = id => `public/thumbs/homes/${id}.webp`;
