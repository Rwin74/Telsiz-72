// hayalet.js - Telsiz-72 YATIRIMCI SUNUMU (PSYOPS) OPERASYONU
const crypto = require('crypto');

// Senin taarruz.js içindeki gerçek API adresin
const API_URL = "https://telsiz-72.vercel.app/api/sos";

async function hayaletSinyaliAtesle() {
    console.log("🚨 TELSİZ-72 KESKİN NİŞANCI OPERASYONU BAŞLIYOR... 🚨");
    console.log("Hedef Kilitlendi: Bartın Merkez...");

    // İNSANLARI ŞOK EDECEK O VERİ PAKETİ
    const payload = {
        id: crypto.randomUUID(), // Benzersiz bir kimlik fırlat
        l: 41.6358,              // Bartın Enlem
        g: 32.3375,              // Bartın Boylam
        s: 3,                    // Şarj %3 (Zaman daralıyor hissi)
        a: -18                   // TAHMİNİ DERİNLİK: -18 Metre! (Bodrum katının da altı)
    };

    console.log(`📦 Gönderilen Paket: Derinlik ${payload.a}m, Şarj %${payload.s}`);

    try {
        // Fetch API (Node 18+ ile dahili gelir)
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log("✅ HEDEF VURULDU! Sinyal başarıyla Vercel'e ulaştı.");
            console.log("🔥 Sunum Taktigi: Şimdi ekrana dön ve haritada beliren kırmızı pini göster!");
        } else {
            console.log("❌ Sinyal başarısız oldu. Vercel şu kodu döndü:", response.status);
        }
    } catch (error) {
        console.error("💥 Bağlantı Hatası. İnterneti kontrol et Komutan:", error.message);
    }
}

// Operasyonu Başlat
hayaletSinyaliAtesle();