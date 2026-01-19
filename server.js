import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";

dotenv.config();

const { Pool } = pkg;
const app = express();

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET;

// ======================
// Middleware
// ======================
app.use(cors());
app.use(express.json());

// ======================
// Database
// ======================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ======================
// File Upload Setup
// ======================
const uploadDir = "uploads";

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

// Serve uploaded files
app.use("/uploads", express.static(uploadDir));

// ======================
// Health Check
// ======================
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// ======================
// AUTH ROUTES
// ======================
app.post("/auth/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2)",
      [username, hash]
    );
    res.json({ message: "User registered" });
  } catch {
    res.status(400).json({ error: "Username already exists" });
  }
});

app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE username = $1",
    [username]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });
});

// ======================
// SONG UPLOAD (GLOBAL)
// ======================
app.post("/songs/upload", upload.single("song"), async (req, res) => {
  const { title, artist } = req.body;

  if (!req.file || !title) {
    return res.status(400).json({ error: "Missing song or title" });
  }

  const fileUrl = `/uploads/${req.file.filename}`;

  await pool.query(
    "INSERT INTO songs (title, artist, file_url) VALUES ($1, $2, $3)",
    [title, artist, fileUrl]
  );

  res.json({ message: "Song uploaded" });
});

// ======================
// GET ALL SONGS
// ======================
app.get("/songs", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM songs ORDER BY uploaded_at DESC"
  );
  res.json(result.rows);
});

// ======================
// Server Start
// ======================
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
