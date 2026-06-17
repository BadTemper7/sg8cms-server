import express from "express";
import {
  createOutletVideoAssignment,
  listOutletVideoAssignments,
  getOutletVideoAssignment,
  updateOutletVideoAssignment,
  removeOutletVideoAssignment,
} from "../controllers/outletVideoAssignmentController.js";

const router = express.Router();

// create assignment under outlet

// list assignments (optional query: outletId, active)
router.get("/", listOutletVideoAssignments);

router.get("/:assignmentId", getOutletVideoAssignment);
router.post("/:outletId", createOutletVideoAssignment);
router.put("/:assignmentId", updateOutletVideoAssignment);
router.delete("/:assignmentId", removeOutletVideoAssignment);

export default router;
