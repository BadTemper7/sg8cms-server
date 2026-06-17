// controllers/departmentController.js
import Department from "../models/Department.js";

// Get all departments
export const getDepartments = async (req, res) => {
  try {
    const departments = await Department.find().sort({ name: 1 });
    res.json(departments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get single department
export const getDepartmentById = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    if (!department)
      return res.status(404).json({ message: "Department not found" });
    res.json(department);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Create department
export const createDepartment = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Department name is required" });
    }

    // Check for existing department with same name (case insensitive)
    const existingDept = await Department.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
    });

    if (existingDept) {
      return res.status(409).json({ message: "Department already exists" });
    }

    const department = await Department.create({
      name: name.trim(),
      description: description || "",
      status: "active",
    });

    res.status(201).json(department);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update department
export const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;

    // If name is being changed, check for duplicates
    if (name) {
      const existingDept = await Department.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
        _id: { $ne: id },
      });

      if (existingDept) {
        return res
          .status(409)
          .json({ message: "Department name already exists" });
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;

    const department = await Department.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!department)
      return res.status(404).json({ message: "Department not found" });
    res.json(department);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete department
export const deleteDepartment = async (req, res) => {
  try {
    // Check if department has users before deleting
    const User = mongoose.model("User");
    const usersWithDepartment = await User.findOne({
      departmentId: req.params.id,
    });

    if (usersWithDepartment) {
      return res.status(400).json({
        message:
          "Cannot delete department that has users assigned. Please reassign or remove users first.",
      });
    }

    const department = await Department.findByIdAndDelete(req.params.id);
    if (!department)
      return res.status(404).json({ message: "Department not found" });
    res.json({ message: "Department deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
