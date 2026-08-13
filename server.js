const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const Parser = require('rss-parser');
const axios = require('axios');

const app = express();
const parser = new Parser();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Base de datos SQLite
const db = new sqlite3.Database('./database.sqlite', (err) => {
 if (err) console.error('Error abriendo DB:', err.message);
 else console.log(' Base de datos SQLite conectada.');
});

db.serialize(() => {
 db.run(`CREATE TABLE IF NOT EXISTS posts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 message TEXT,
 city_or_county TEXT,
 lat REAL,
 lng REAL,
 created_time TEXT,
 image_url TEXT,
 permalink_url TEXT
 )`);
});

// TUS 2 FUENTES RSS EXACTAS DE FETCHRSS
const MY_COMMUNITY_RSS = [
 { 
 name: 'Facebook Comunidad 1', 
 url: 'https://fetchrss.com/feed/1wuI7G8Vz8ME1wuZ4x8K02Ro.rss', 
 defaultZone: 'Culmore / Route 7', 
 lat: 38.8601, 
 lng: -77.1458 
 },
 { 
 name: 'Facebook Comunidad 2', 
 url: 'https://fetchrss.com/feed/1wuI7G8Vz8ME1wuI6rDi01Ss.rss', 
 defaultZone: 'Culmore / Columbia Pike', 
 lat: 38.8578, 
 lng: -77.0861 
 }
];

async function fetchMyCommunityFeeds() {
 console.log(' Consultando Feeds de FetchRSS con las URLs corregidas...');
 for (const source of MY_COMMUNITY_RSS) {
 try {
 const response = await axios.get(source.url, {
 headers: {
 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
 'Accept': 'application/rss+xml, application/xml, text/xml, */*'
 },
 timeout: 10000
 });

 const feed = await parser.parseString(response.data);

 for (const item of feed.items) {
 const message = (item.title ? item.title + ' - ' : '') + (item.contentSnippet || item.content || '').substring(0, 300);
 const created_time = new Date(item.pubDate || item.isoDate || Date.now()).toISOString();
 const permalink_url = item.link || item.guid || '#';

 db.get('SELECT id FROM posts WHERE permalink_url = ?', [permalink_url], (err, row) => {
 if (!row) {
 console.log(` [NUEVO POST RECIBIDO] (${source.name}): ${message.substring(0, 60)}...`);
 db.run(
 `INSERT INTO posts (message, city_or_county, lat, lng, created_time, permalink_url) VALUES (?, ?, ?, ?, ?, ?)`,
 [message, source.defaultZone, source.lat, source.lng, created_time, permalink_url]
 );
 }
 });
 }
 } catch (err) {
 console.log(` Error leyendo (${source.name}):`, err.message);
 }
 }
}

app.get('/api/posts', (req, res) => {
 db.all('SELECT * FROM posts ORDER BY created_time DESC', [], (err, rows) => {
 if (err) return res.status(500).json({ error: err.message });
 res.json(rows);
 });
});

app.post('/api/webhooks/incoming', (req, res) => {
 const { message, city_or_county, lat, lng, image_url, permalink_url } = req.body;
 if (!message) return res.status(400).json({ error: 'Mensaje requerido' });

 const zone = city_or_county || 'Culmore / Zona General';
 const latitude = lat || 38.8601;
 const longitude = lng || -77.1458;
 const created_time = new Date().toISOString();

 db.run(
 `INSERT INTO posts (message, city_or_county, lat, lng, created_time, image_url, permalink_url) VALUES (?, ?, ?, ?, ?, ?, ?)`,
 [message, zone, latitude, longitude, created_time, image_url || '', permalink_url || '#'],
 function (err) {
 if (err) return res.status(500).json({ error: err.message });
 res.json({ status: 'success', id: this.lastID });
 }
 );
});

setInterval(fetchMyCommunityFeeds, 180000);
fetchMyCommunityFeeds();

app.listen(PORT, () => {
 console.log(` Servidor monitoreando tus 2 Feeds en http://localhost:${PORT}`);
});