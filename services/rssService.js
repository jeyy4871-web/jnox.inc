const Parser = require('rss-parser');
const parser = new Parser();
const db = require('../database');

const ZONES_GEO = {
 'fauquier': { lat: 38.7188, lng: -77.8080, name: 'Fauquier, VA' },
 'catlett': { lat: 38.6537, lng: -77.6394, name: 'Catlett, VA' },
 'culmore': { lat: 38.8601, lng: -77.1458, name: 'Culmore' },
 'columbia pike': { lat: 38.8550, lng: -77.1180, name: 'Columbia Pike' },
 'arlington': { lat: 38.8816, lng: -77.0910, name: 'Arlington' },
 'alexandria': { lat: 38.8048, lng: -77.0469, name: 'Alexandria' },
 'bailey\'s crossroads': { lat: 38.8498, lng: -77.1283, name: 'Bailey\'s Crossroads' },
 'falls church': { lat: 38.8823, lng: -77.1711, name: 'Falls Church' },
 'annandale': { lat: 38.8304, lng: -77.1964, name: 'Annandale' },
 'fairfax': { lat: 38.8462, lng: -77.3064, name: 'Fairfax' },
 'manassas': { lat: 38.7509, lng: -77.4753, name: 'Manassas' },
 'woodbridge': { lat: 38.6582, lng: -77.2497, name: 'Woodbridge' }
};

// Intenta geocodificar calles e intersecciones automáticamente sin costo
async function geocodeExactAddress(text) {
 if (!text) return null;
 
 // Buscar palabras clave de calles/rutas en Virginia
 const match = text.match(/(?:cuadra|block|street|st|avenue|ave|road|rd|lane|ln|drive|dr|route|rt)\s+[0-9a-zA-Z\s]+/i);
 if (match) {
 try {
 const query = encodeURIComponent(`${match[0]}, Virginia, USA`);
 const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}`, {
 headers: { 'User-Agent': 'JnoxIncApp/1.0' }
 });
 const data = await response.json();
 if (data && data.length > 0) {
 return {
 lat: parseFloat(data[0].lat),
 lng: parseFloat(data[0].lon),
 name: data[0].display_name.split(',')[0]
 };
 }
 } catch (e) {
 console.log('Búsqueda por calle fallida, usando zona general...');
 }
 }
 return null;
}

function geocodeTextFallback(text, url) {
 const combined = ((text || '') + ' ' + (url || '')).toLowerCase();

 for (const key in ZONES_GEO) {
 if (combined.includes(key)) {
 const jitterLat = (Math.random() - 0.5) * 0.003;
 const jitterLng = (Math.random() - 0.5) * 0.003;
 return {
 name: ZONES_GEO[key].name,
 lat: ZONES_GEO[key].lat + jitterLat,
 lng: ZONES_GEO[key].lng + jitterLng
 };
 }
 }
 return { lat: 38.8601, lng: -77.1458, name: 'Culmore / Zona General' };
}

async function fetchAndSavePosts() {
 const envUrls = process.env.RSS_FEED_URL || '';
 const urls = envUrls.split(',').map(u => u.trim()).filter(Boolean);

 if (urls.length === 0) return;

 let totalProcessed = 0;

 for (const url of urls) {
 try {
 const feed = await parser.parseURL(url);
 if (!feed.items || feed.items.length === 0) continue;

 for (const item of feed.items) {
 const postId = item.guid || item.id || item.link;
 let rawMessage = item.title || item.contentSnippet || item.content || '';
 
 if (item.content && item.content !== rawMessage) {
 rawMessage += ' ' + item.content;
 }
 
 let message = rawMessage.replace(/<[^>]*>?/gm, '').trim();

 if (message.includes("owner only shared it with a small group") || message.includes("When this happens")) {
 message = " Video / Publicación multimedia sin descripción escrita (Haz clic abajo para reproducir o investigar noticias locales de esta zona).";
 }

 const pubDate = item.isoDate || item.pubDate || new Date().toISOString();
 const link = item.link || '#';

 let mediaUrl = null;
 if (item.enclosure && item.enclosure.url) {
 mediaUrl = item.enclosure.url;
 } else if (item['media:content'] && item['media:content'].$ && item['media:content'].$.url) {
 mediaUrl = item['media:content'].$.url;
 }

 // Intento 1: Geocodificar la calle exacta automáticamente
 let geo = await geocodeExactAddress(message);
 
 // Intento 2: Fallback a zonas predefinidas de Northern Virginia
 if (!geo) {
 geo = geocodeTextFallback(message, link);
 }

 db.run(
 `INSERT OR IGNORE INTO posts (facebook_id, message, created_time, permalink_url, image_url, city_or_county, lat, lng)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
 [postId, message, pubDate, link, mediaUrl, geo.name, geo.lat, geo.lng]
 );
 totalProcessed++;
 }
 } catch (error) {
 console.error('[RSS Service] Error:', error.message);
 }
 }
 console.log(`[RSS Service] Sincronización automática exitosa. Total: ${totalProcessed} reportes.`);
}

function archiveOldPosts() {
 const query = "UPDATE posts SET archived = 1 WHERE created_time < datetime('now', '-30 days') AND archived = 0";
 db.run(query);
}

module.exports = { fetchAndSavePosts, archiveOldPosts };