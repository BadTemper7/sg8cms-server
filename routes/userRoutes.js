// routes/userRoutes.js
import express from "express";
import {
  createUser,
  updateUser,
  login,
  logout,
  getUsers,
  getUserById,
  getCurrentUser, // Add this import
  deleteUser,
  deleteManyUsers,
  getSessionInfo,
} from "../controllers/userController.js";

import {
  protect,
  adminOnly,
  superadminOnly,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Public routes
router.post("/create", createUser);
router.post("/login", login);

// Protected routes
router.post("/logout", protect, logout);

// IMPORTANT: /me route MUST come before /:id to avoid conflict
router.get("/me", protect, getCurrentUser); // Add this route

router.get("/", protect, adminOnly, getUsers);
router.get("/session", protect, getSessionInfo);
router.get("/:id", protect, adminOnly, getUserById);

router.put("/:id", protect, adminOnly, updateUser);

router.delete("/:id", protect, superadminOnly, deleteUser);
router.post("/bulk-delete", protect, superadminOnly, deleteManyUsers);

export default router;
