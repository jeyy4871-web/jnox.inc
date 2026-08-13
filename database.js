const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'community_monitoring.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
db.run(`
CREATE TABLE IF NOT EXISTS posts (
id INTEGER PRIMARY KEY AUTOINCREMENT,
facebook_id TEXT UNIQUE,
message TEXT,
created_time DATETIME,
permalink_url TEXT,
image_url TEXT,
city_or_county TEXT,
lat REAL,
lng REAL,
archived INTEGER DEFAULT 0
)
`);

db.run(`ALTER TABLE posts ADD COLUMN lat REAL`, () => {});
db.run(`ALTER TABLE posts ADD COLUMN lng REAL`, () => {});
});

module.exports = db;
