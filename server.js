// ===============================
// FILE: server.js (CommonJS)
// ===============================

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ===============================
// DATABASE
// ===============================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

// ===============================
// AUTH MIDDLEWARE
// ===============================
function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ===============================
// AUTH ROUTES
// ===============================
app.post("/auth/register", async (req, res) => {
  const { email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);

  try {
    await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1,$2)",
      [email, hash]
    );
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: "User exists" });
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE email=$1",
    [email]
  );

  if (!result.rows.length) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const user = result.rows[0];
  const match = await bcrypt.compare(password, user.password_hash);

  if (!match) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
  res.json({ token });
});

// ===============================
// SONG LIBRARY (GLOBAL)
// ===============================
app.get("/songs", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM songs ORDER BY created_at DESC"
  );
  res.json(result.rows);
});

app.post("/songs", auth, async (req, res) => {
  const { title, artist, album, mp3_url, cover_url } = req.body;

  await pool.query(
    `INSERT INTO songs
     (title, artist, album, mp3_url, cover_url, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [title, artist, album, mp3_url, cover_url, req.user.id]
  );

  res.json({ success: true });
});

// ===============================
// PLAYLISTS
// ===============================
app.get("/playlists", auth, async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM playlists WHERE user_id=$1",
    [req.user.id]
  );
  res.json(result.rows);
});

app.post("/playlists", auth, async (req, res) => {
  await pool.query(
    "INSERT INTO playlists (user_id, name) VALUES ($1,$2)",
    [req.user.id, req.body.name]
  );
  res.json({ success: true });
});

app.post("/playlists/:id/songs", auth, async (req, res) => {
  await pool.query(
    "INSERT INTO playlist_songs (playlist_id, song_id) VALUES ($1,$2)",
    [req.params.id, req.body.song_id]
  );
  res.json({ success: true });
});

app.delete("/playlists/:id/songs/:songId", auth, async (req, res) => {
  await pool.query(
    "DELETE FROM playlist_songs WHERE playlist_id=$1 AND song_id=$2",
    [req.params.id, req.params.songId]
  );
  res.json({ success: true });
});

// ===============================
// SERVER
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
