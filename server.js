import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import pg from "pg";
import bcrypt from "bcrypt";

const app = express();
const PORT = process.env.PORT || 10000;

// =======================
// Middleware
// =======================
app.use(cors());
app.use(express.json());

// =======================
// Database
// =======================
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// =======================
// File storage setup
// =======================
const uploadDir = "uploads";
const coverDir = "covers";

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(coverDir)) fs.mkdirSync(coverDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "cover") cb(null, coverDir);
    else cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// =======================
// Static file hosting
// =======================
app.use("/uploads", express.static(uploadDir));
app.use("/covers", express.static(coverDir));

// =======================
// Health check
// =======================
app.get("/health", (req, res) => {
  res.send("OK");
});

// =======================
// Auth routes
// =======================
app.post("/auth/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Missing fields" });

  const hash = await bcrypt.hash(password, 10);

  try {
    await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2)",
      [username, hash]
    );
    res.json({ message: "User registered" });
  } catch {
    res.status(400).json({ error: "Username already exists" });
  }
});

// =======================
// Songs
// =======================

// Upload song + cover
app.post(
  "/songs/upload",
  upload.fields([
    { name: "song", maxCount: 1 },
    { name: "cover", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { title, artist } = req.body;
      const songFile = req.files.song?.[0];
      const coverFile = req.files.cover?.[0];

      if (!songFile || !title)
        return res.status(400).json({ error: "Song and title required" });

      const songUrl = `/uploads/${songFile.filename}`;
      const coverUrl = coverFile ? `/covers/${coverFile.filename}` : null;

      await pool.query(
        "INSERT INTO songs (title, artist, file_url, cover_url) VALUES ($1, $2, $3, $4)",
        [title, artist, songUrl, coverUrl]
      );

      res.json({ message: "Song uploaded" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

// Get all songs
app.get("/songs", async (req, res) => {
  const result = await pool.query("SELECT * FROM songs ORDER BY uploaded_at DESC");
  res.json(result.rows);
});

// =======================
// Start server
// =======================
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
