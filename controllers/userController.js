// controllers/userController.js
import User from "../models/User.js";
import { generateToken } from "../utils/jwt.js";
import { broadcast } from "../wsServer.js";
import crypto from "crypto";
import { body, validationResult } from "express-validator";

export const validateLogin = [
  body("username").notEmpty().trim().escape(),
  body("password").notEmpty(),
];

// Helper to get device info
const getDeviceInfo = (userAgent) => {
  if (!userAgent) return "Unknown Device";

  if (userAgent.includes("Mobile")) return "Mobile Device";
  if (userAgent.includes("Tablet")) return "Tablet";
  if (userAgent.includes("Windows")) return "Windows PC";
  if (userAgent.includes("Mac")) return "Mac";
  if (userAgent.includes("Linux")) return "Linux";
  return "Desktop";
};

// CREATE USER
export const createUser = async (req, res) => {
  try {
    const {
      username,
      password,
      roles,
      firstName,
      lastName,
      email,
      contactNumber,
      departmentId,
      outletId,
      modules,
    } = req.body;

    if (!username || !password || !roles) {
      return res
        .status(400)
        .json({ message: "Username, password, and roles are required" });
    }

    const exists = await User.findOne({ username });
    if (exists) {
      return res.status(409).json({ message: "Username already exists" });
    }

    const user = await User.create({
      username,
      password,
      roles,
      firstName: firstName || "",
      lastName: lastName || "",
      email: email || "",
      contactNumber: contactNumber || "",
      departmentId: departmentId || null,
      outletId: outletId || null,
      modules:
        modules ||
        (roles === "superadmin"
          ? ["dashboard", "outlets", "promotions", "videoAds", "users"]
          : ["dashboard", "outlets", "promotions"]),
      status: "active",
    });

    // Populate department and outlet for response
    const populatedUser = await User.findById(user._id)
      .populate("departmentId", "name code")
      .populate("outletId", "name code");

    broadcast({
      type: "USER_UPDATED",
      action: "create",
      user: populatedUser,
    });

    res.status(201).json({
      message: "User created successfully",
      user: populatedUser,
    });
  } catch (err) {
    console.error("Create user error:", err);
    res.status(500).json({ message: err.message });
  }
};
// GET CURRENT USER (ME)
export const getCurrentUser = async (req, res) => {
  try {
    // req.user is set by the protect middleware
    const user = await User.findById(req.user._id)
      .select("-password -devices")
      .populate("departmentId", "name code")
      .populate("outletId", "name code");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      _id: user._id,
      username: user.username,
      roles: user.roles,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      contactNumber: user.contactNumber,
      departmentId: user.departmentId,
      outletId: user.outletId,
      modules: user.modules || [],
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (err) {
    console.error("Get current user error:", err);
    res.status(500).json({ message: err.message });
  }
};
// UPDATE USER
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      firstName,
      lastName,
      email,
      contactNumber,
      roles,
      status,
      departmentId,
      outletId,
      modules,
    } = req.body;

    // Build update object with only provided fields
    const updateData = {};

    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email;
    if (contactNumber !== undefined) updateData.contactNumber = contactNumber;
    if (roles !== undefined) updateData.roles = roles;
    if (status !== undefined) updateData.status = status;
    if (departmentId !== undefined)
      updateData.departmentId = departmentId || null;
    if (outletId !== undefined) updateData.outletId = outletId || null;
    if (modules !== undefined) updateData.modules = modules;

    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if username is being changed (usually shouldn't be allowed)
    if (req.body.username && req.body.username !== user.username) {
      const existingUser = await User.findOne({ username: req.body.username });
      if (existingUser) {
        return res.status(409).json({ message: "Username already exists" });
      }
      updateData.username = req.body.username;
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .select("-password -devices")
      .populate("departmentId", "name code")
      .populate("outletId", "name code");

    // Broadcast update to WebSocket clients
    broadcast({
      type: "USER_UPDATED",
      action: "update",
      user: updatedUser,
    });

    res.json({
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({ message: err.message });
  }
};

// GET ALL USERS
export const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password -devices")
      .populate("departmentId", "name code")
      .populate("outletId", "name code");
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET SINGLE USER
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password -devices")
      .populate("departmentId", "name code")
      .populate("outletId", "name code");

    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// RESET PASSWORD
export const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate a temporary password or send reset link logic here
    // For now, just return success
    res.json({
      message: "Password reset link sent successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ message: err.message });
  }
};

// LOGIN
export const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const { username, password } = req.body;
    const userAgent = req.headers["user-agent"];
    const ip = req.ip || req.connection.remoteAddress;

    console.log("Login attempt for username:", username);

    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      console.log("User not found:", username);
      return res.status(404).json({ message: "User not found" });
    }

    console.log("User found:", user.username);
    console.log("Stored password hash:", user.password);

    // Compare password
    const isPasswordValid = await user.comparePassword(password);
    console.log("Password valid:", isPasswordValid);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Generate new session ID
    const sessionId = crypto.randomBytes(32).toString("hex");
    const deviceInfo = getDeviceInfo(userAgent);

    // Update user session
    await user.updateSession(sessionId, deviceInfo, ip);

    // Generate JWT token
    const token = generateToken(user);

    res.json({
      message: "Login successful",
      token,
      sessionId,
      user: {
        id: user._id,
        username: user.username,
        roles: user.roles,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        departmentId: user.departmentId,
        outletId: user.outletId,
        modules: user.modules || [],
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: err.message });
  }
};

// LOGOUT
export const logout = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const user = await User.findById(req.user._id);

    if (user) {
      await user.clearSession(sessionId);
    }

    res.json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET SESSION INFO
export const getSessionInfo = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "sessionId devices lastLogin lastLoginIP",
    );
    res.json({
      currentSessionId: user.sessionId,
      devices: user.devices,
      lastLogin: user.lastLogin,
      lastLoginIP: user.lastLoginIP,
      user: {
        _id: user._id,
        username: user.username,
        roles: user.roles,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        departmentId: user.departmentId,
        outletId: user.outletId,
        modules: user.modules || [],
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE USER
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    broadcast({
      type: "USER_UPDATED",
      action: "delete",
      user: {
        id: user._id,
        username: user.username,
      },
    });
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE MANY USERS
export const deleteManyUsers = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No IDs provided" });
    }

    const result = await User.deleteMany({ _id: { $in: ids } });
    broadcast({
      type: "USER_UPDATED",
      action: "bulkDelete",
      deletedCount: result.deletedCount,
      userIds: ids,
    });
    return res.json({
      message: `${result.deletedCount} users deleted successfully`,
    });
  } catch (err) {
    console.error("Bulk delete user error:", err);
    return res.status(500).json({ message: "Bulk user delete failed" });
  }
};
