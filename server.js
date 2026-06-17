import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// ============================================
// SET GLOBAL TIMEZONE TO UTC+8 (Philippine Time)
// ============================================
process.env.TZ = "Asia/Manila";

// ============================================

import connectDB from "./config/db.js";
import noteRoutes from "./routes/noteRoutes.js";
import announcementRoutes from "./routes/announcementRoutes.js";
import bannerRoutes from "./routes/bannerRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import outletRoutes from "./routes/outletRoutes.js";
import terminalRoutes from "./routes/terminalRoutes.js";
import videoRoutes from "./routes/videoRoutes.js";
import outletVideoAssignmentRoutes from "./routes/outletVideoAssignmentRoutes.js";
import playbackRoutes from "./routes/playbackRoutes.js";
import terminalDetailsRoutes from "./routes/terminalDetailsRoutes.js";
import departmentRoutes from "./routes/departmentRoutes.js";
import promotionDocumentRoutes from "./routes/promotionDocumentRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import User from "./models/User.js";
import dns from "dns";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { startTerminalOfflineCheck } from "./cron/checkTerminalsOffline.js";
import { createWebSocketServer } from "./wsServer.js";
import http from "http";

dotenv.config();

const requiredEnvVars = ["JWT_SECRET", "MONGO_URI"];
const missingEnvVars = requiredEnvVars.filter(
  (varName) => !process.env[varName],
);

if (missingEnvVars.length > 0) {
  console.error(
    `❌ Missing required environment variables: ${missingEnvVars.join(", ")}`,
  );
  process.exit(1);
}

if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET === "your_super_secret_jwt_key_change_this"
) {
  console.error("❌ JWT_SECRET is not set or still using default value!");
  process.exit(1);
}

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// Serve uploaded outlet videos as static files
const VIDEO_STATIC_DIR = path.resolve(__dirname, "videos/outlet");
if (!fs.existsSync(VIDEO_STATIC_DIR)) {
  fs.mkdirSync(VIDEO_STATIC_DIR, { recursive: true });
}
app.use("/videos/outlet", express.static(VIDEO_STATIC_DIR));

// Serve Electron launcher update files
const LAUNCHER_UPDATES_DIR = path.resolve(__dirname, "launcher-updates");

if (!fs.existsSync(LAUNCHER_UPDATES_DIR)) {
  fs.mkdirSync(LAUNCHER_UPDATES_DIR, { recursive: true });
}

// Optional health/listing endpoint for checking the update folder in browser.
// Electron updater uses /launcher-updates/latest.yml, not this folder route.
app.get("/launcher-updates", (req, res) => {
  res.redirect("/launcher-updates/");
});

app.get("/launcher-updates/", (req, res) => {
  const files = fs.existsSync(LAUNCHER_UPDATES_DIR)
    ? fs.readdirSync(LAUNCHER_UPDATES_DIR)
    : [];

  res.json({
    ok: true,
    message: "Launcher update folder is available",
    folder: LAUNCHER_UPDATES_DIR,
    files,
    requiredFiles: [
      "latest.yml",
      "SG8-Launcher-Setup-1.0.1.exe",
      "SG8-Launcher-Setup-1.0.1.exe.blockmap",
    ],
  });
});

app.use(
  "/launcher-updates",
  express.static(LAUNCHER_UPDATES_DIR, {
    setHeaders(res, filePath) {
      if (filePath.endsWith("latest.yml")) {
        res.setHeader("Content-Type", "text/yaml");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }

      if (filePath.endsWith(".exe")) {
        res.setHeader("Content-Type", "application/octet-stream");
      }

      if (filePath.endsWith(".blockmap")) {
        res.setHeader("Content-Type", "application/octet-stream");
      }
    },
  }),
);

// Serve RestrictPC download files
const RESTRICT_PC_DIR = path.resolve(__dirname, "restrict-pc");

if (!fs.existsSync(RESTRICT_PC_DIR)) {
  fs.mkdirSync(RESTRICT_PC_DIR, { recursive: true });
}

app.get("/restrict-pc", (req, res) => {
  res.redirect("/restrict-pc/");
});

app.get("/restrict-pc/", (req, res) => {
  const files = fs.existsSync(RESTRICT_PC_DIR)
    ? fs.readdirSync(RESTRICT_PC_DIR)
    : [];

  res.json({
    ok: true,
    message: "RestrictPC download folder is available",
    folder: RESTRICT_PC_DIR,
    files,
    downloadUrl: "/restrict-pc/RestrictPC.zip",
    directDownloadUrl: "/restrict-pc/download",
  });
});

app.get("/restrict-pc/download", (req, res) => {
  const filePath = path.join(RESTRICT_PC_DIR, "RestrictPC.zip");

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      ok: false,
      message: "RestrictPC.zip not found",
      expectedPath: filePath,
    });
  }

  return res.download(filePath, "RestrictPC.zip");
});

app.use(
  "/restrict-pc",
  express.static(RESTRICT_PC_DIR, {
    setHeaders(res, filePath) {
      if (filePath.endsWith(".zip")) {
        res.setHeader("Content-Type", "application/zip");
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="RestrictPC.zip"',
        );
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
    },
  }),
);
async function ensureSuperAdmin() {
  try {
    const existing = await User.findOne({ username: "cms_admin" });
    if (!existing) {
      const superAdmin = new User({
        firstName: "Super",
        lastName: "Admin",
        username: "cms_admin",
        email: "cms_admin@gmail.com",
        contactNumber: "09760233563",
        password: "!CmsAdmin",
        roles: "superadmin",
        status: "active",
      });

      await superAdmin.save();
      console.log("✅ Superadmin user created");
    } else {
      console.log("✅ Superadmin user already exists");

      const isHashed = existing.password.startsWith("$2");
      if (!isHashed) {
        console.log("Updating password hash for existing user...");
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash("!CmsAdmin", salt);
        existing.password = hashedPassword;
        await existing.save();
        console.log("Password hash updated!");
      }
    }
  } catch (error) {
    console.error("❌ Error creating superadmin:", error.message);
  }
}

// Routes
app.get("/api/health", (req, res) => {
  res.json({ message: "Backend is running" });
});

// app.use("/api/users/login", loginLimiter);
app.use("/api/notes", noteRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/users", userRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/outlets", outletRoutes);
app.use("/api/terminals", terminalRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/assignments", outletVideoAssignmentRoutes);
app.use("/api/playback", playbackRoutes);
app.use("/api/terminals", terminalDetailsRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/promotions", promotionDocumentRoutes);
app.use("/api/upload", uploadRoutes);

// Serve frontend in production
// if (process.env.NODE_ENV === "production") {
//   const frontendPath = path.join(__dirname, "../frontend/build");
//   app.use(express.static(frontendPath));

//   app.get("*", (req, res) => {
//     res.sendFile(path.join(frontendPath, "index.html"));
//   });
// }

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
createWebSocketServer(server);

async function migrateUserModules() {
  try {
    console.log("🔄 Checking for users without modules field...");

    // Find all users without modules field or with empty modules
    const usersToUpdate = await User.find({
      $or: [{ modules: { $exists: false } }, { modules: { $size: 0 } }],
    });

    if (usersToUpdate.length === 0) {
      console.log("✅ All users already have modules assigned");
      return;
    }

    console.log(`📝 Found ${usersToUpdate.length} users without modules`);

    // Define default modules based on role
    const defaultModules = {
      superadmin: ["dashboard", "outlets", "promotions", "videoAds", "users"],
      admin: ["dashboard", "outlets", "promotions"],
    };

    let updatedCount = 0;

    for (const user of usersToUpdate) {
      let modulesToAssign;

      // Superadmin gets all modules
      if (user.roles === "superadmin") {
        modulesToAssign = defaultModules.superadmin;
      } else {
        // Regular admin gets default modules
        modulesToAssign = defaultModules.admin;
      }

      user.modules = modulesToAssign;
      await user.save();
      updatedCount++;

      console.log(`  ✓ Assigned modules to ${user.username} (${user.roles})`);
    }

    console.log(
      `✅ Migration complete! Updated ${updatedCount} users with module assignments`,
    );
  } catch (error) {
    console.error("❌ Error during module migration:", error.message);
  }
}

ensureSuperAdmin()
  .then(async () => {
    await migrateUserModules();
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`\n🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`🔗 API URL: http://localhost:${PORT}/api`);
      console.log(`❤️  Health check: http://localhost:${PORT}/api/health\n`);
      console.log(`🕐 Server is using timezone: ${process.env.TZ}\n`);
      console.log(
        `⬆️  Launcher updates: http://localhost:${PORT}/launcher-updates/latest.yml\n`,
      );

      // startTerminalOfflineCheck();
    });
  })
  .catch((error) => {
    console.error("Failed to ensure superadmin:", error);
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`\n🚀 Server running on port ${PORT}`);
      console.log(
        `⬆️  Launcher updates: http://localhost:${PORT}/launcher-updates/latest.yml\n`,
      );
      // startTerminalOfflineCheck();
    });
  });
