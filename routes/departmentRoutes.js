// routes/departmentRoutes.js
import express from "express";
import {
  getDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "../controllers/departmentController.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, adminOnly, getDepartments);
router.get("/:id", protect, adminOnly, getDepartmentById);
router.post("/", protect, adminOnly, createDepartment);
router.put("/:id", protect, adminOnly, updateDepartment);
router.delete("/:id", protect, adminOnly, deleteDepartment);

export default router;
