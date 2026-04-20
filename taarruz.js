// taarruz.js - Telsiz-72 ULUSAL KRİZ SİMÜLASYONU (TÜRKİYE GENELİ)
const crypto = require('crypto');

const API_URL = "https://telsiz-72.vercel.app/api/sos";

// TÜRKİYE COĞRAFİ SINIRLARI (Yaklaşık Kutu)
const MIN_LAT = 36.0; // Güney (Hatay civarı)
const MAX_LAT = 42.0; // Kuzey (Sinop civarı)
const MIN_LNG = 26.0; // Batı (İzmir/Edirne civarı)
const MAX_LNG = 45.0; // Doğu (Iğdır civarı)

// DEVASA TEST AYARLARI
const TOTAL_REQUESTS = 10000; // 10 BİN SİNYAL!
const REQUESTS_PER_SECOND = 20; // Güvenli Sızma Hızı (Ban yememek için)

let sentCount = 0;
let successCount = 0;
let failCount = 0;

function generateMockPayload() {
    // Türkiye sınırları içinde tamamen rastgele bir nokta üretir
    const lat = MIN_LAT + Math.random() * (MAX_LAT - MIN_LAT);
    const lng = MIN_LNG + Math.random() * (MAX_LNG - MIN_LNG);
    
    return {
        id: crypto.randomUUID(),
        l: parseFloat(lat.toFixed(5)),
        g: parseFloat(lng.toFixed(5)),
        s: 1,
        a: 111 
    };
}

async function fireRequest() {
    if (sentCount >= TOTAL_REQUESTS) return;
    
    sentCount++;
    const payload = generateMockPayload();
    
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            successCount++;
            process.stdout.write(`\r🔥 TÜRKİYE GENELİ SIZMA: ${successCount}/${TOTAL_REQUESTS} | ❌ HATA: ${failCount} `);
        } else {
            failCount++;
        }
    } catch (error) {
        failCount++;
    }
}

console.log(`🦅 ATAKAN KOMUTAN: ULUSAL KRİZ TATBİKATI BAŞLIYOR!`);
console.log(`Hedef: TÜM TÜRKİYE HARİTASI (10.000 Sinyal)`);
console.log(`Hız: Saniyede 20 Füze (Yaklaşık 8.5 Dakika sürecek)...`);
console.log(`Lütfen Dashboard'u uzaklaştırın (Zoom Out) ve tüm ülkeyi ekrana alın!\n`);

const intervalTime = 1000 / REQUESTS_PER_SECOND;

const bombardment = setInterval(() => {
    fireRequest();
    
    if (sentCount >= TOTAL_REQUESTS) {
        clearInterval(bombardment);
        
        setTimeout(() => {
            console.log(`\n\n🛑 ULUSAL SİMÜLASYON TAMAMLANDI!`);
            console.log(`📊 Haritaya Çivilenen: ${successCount} Sinyal`);
            console.log(`📉 Reddedilen: ${failCount}`);
            console.log(`ZAFER SENİNDİR KOMUTAN! VİDEOYU ALMAYI UNUTMA!`);
            process.exit(0);
        }, 2000);
    }
}, intervalTime);