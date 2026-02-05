import express from "express";
import cors from "cors";
import multer from "multer";
import pg from "pg";
import bcrypt from "bcrypt";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";

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
// Cloudinary Config
// =======================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// =======================
// Cloud Storage Setup
// =======================
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    if (file.fieldname === "song") {
      return {
        folder: "songs",
        resource_type: "video", // Cloudinary treats audio as video
      };
    }
    if (file.fieldname === "cover") {
      return {
        folder: "covers",
        resource_type: "image",
      };
    }
  },
});

const upload = multer({ storage });

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

      // These are now FULL Cloudinary URLs
      const songUrl = songFile.path;
      const coverUrl = coverFile ? coverFile.path : null;

      await pool.query(
        "INSERT INTO songs (title, artist, file_url, cover_url) VALUES ($1, $2, $3, $4)",
        [title, artist, songUrl, coverUrl]
      );

      res.json({ message: "Song uploaded", songUrl, coverUrl });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

// Get all songs
app.get("/songs", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM songs ORDER BY uploaded_at DESC"
  );
  res.json(result.rows);
});

// =======================
// Start server
// =======================
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
