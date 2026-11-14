import os
import json

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
buildings_json_path = os.path.join(SCRAPED_DIR, "all_extracted_buildings.json")

with open(buildings_json_path, "r", encoding="utf-8") as f:
    buildings = json.load(f)

icon_map = {
    "rumah": "🏠", "rumah2": "🏡", "kos": "🏢", "warung": "🏪", "kafe": "☕",
    "toko": "🛒", "bengkel": "🔧", "sawah": "🌾", "kantor": "🏢", "taman": "⛲",
    "lapangan": "⚽", "sekolah": "🏫", "rs": "🏥", "polisi": "👮", "penjara": "⛓️",
    "pasar": "🏬", "ibadah": "🕌", "pln": "⚡", "stadion": "🏟️", "istana": "🏛️",
    "tugu": "🗿", "mulyo": "🏡", "posko": "🔨", "bank": "🏦", "barak": "🪖",
    "waduk": "🌊", "apartemen": "🏢", "pabrik": "🏭", "pkl": "🍢", "ruko": "🏬",
    "kebun": "🥬", "terminal": "🚌", "pangkalan": "🛵", "proyek_gedung": "🏗️",
    "proyek_rumah": "🏗️", "lahan_material": "📦"
}

job_map = {
    "rumah": "Penjaga Rumah Warga", "rumah2": "Pengelola Rumah Hunian", "kos": "Pengelola Kos-kosan",
    "warung": "Pengelola Warung & Sembako", "kafe": "Barista Kafe Kopi", "toko": "Pramuniaga Toko Kelontong",
    "bengkel": "Mekanik Bengkel Kendaraan", "sawah": "Petani Penggarap Padi", "kantor": "Staf Eksekutif Perkantoran",
    "taman": "Petugas Kebersihan & Bunga Taman", "lapangan": "Pengelola Sarana Olahraga", "sekolah": "Guru Pengajar Warga",
    "rs": "Tenaga Medis & Perawat RS", "polisi": "Aparat Pengaman Kawasan", "penjara": "Petugas Lapas Keamanan",
    "pasar": "Pedagang Pasar Rakyat", "ibadah": "Pengurus Rumah Ibadah", "pln": "Teknisi Jaringan Listrik PLN",
    "stadion": "Pengelola Stadion Gelora", "istana": "Aparatur Pelayanan Balai Kota", "tugu": "Petugas Monumen Sejarah",
    "mulyo": "Staf Pelayanan Warga Mulyo", "posko": "Tukang Gotong Royong", "bank": "Teller & Pengelola Kas Daerah",
    "barak": "Prajurit Pengaman Wilayah", "waduk": "Operator Bendungan & Pengairan", "apartemen": "Pengelola Hunian Rusun",
    "pabrik": "Operator Mesin Pabrik", "pkl": "Pedagang Kuliner Kaki Lima", "ruko": "Pengelola Usaha Ruko",
    "kebun": "Petani Kebun & Sayuran", "terminal": "Sopir & Operator Terminal Angkot", "pangkalan": "Driver Ojek Transportasi",
    "proyek_gedung": "Pekerja Konstruksi Gedung", "proyek_rumah": "Tukang Bangunan Rumah", "lahan_material": "Logistik & Pergudangan Bahan"
}

meta_entries = []
for k in buildings.keys():
    name = buildings[k].split('n:"')[1].split('"')[0] if 'n:"' in buildings[k] else k
    icon = icon_map.get(k, "🏢")
    job = job_map.get(k, "Operator Fasilitas")
    desc = f"Fasilitas {name} di kawasan AUDIRA-LAND."
    if "Rumah" in name:
        desc = f"Bangunan hunian {name} asri dan nyaman untuk warga AUDIRA-LAND."
    elif "Warung" in name or "Toko" in name or "Kafe" in name:
        desc = f"Pusat usaha dan niaga {name} melayani kebutuhan warga 24 jam."
    elif "Kantor" in name or "Bank" in name or "Istana" in name:
        desc = f"Pusat administrasi, keuangan, dan tata kelola kawasan {name}."
    elif "Sekolah" in name or "Sakit" in name:
        desc = f"Layanan sosial dasar {name} penunjang kesejahteraan warga gotong royong."

    meta_entries.append(f"""            {k}: {{
                title: '{name}',
                desc: '{desc}',
                icon: '{icon}',
                jobTitle: '{job}',
                isWorkable: true
            }}""")

full_meta_str = ",\n".join(meta_entries)
print(f"Generated {len(meta_entries)} meta entries.")

out_meta = os.path.join(SCRAPED_DIR, "building_meta_entries.js")
with open(out_meta, "w", encoding="utf-8") as f:
    f.write(full_meta_str)


