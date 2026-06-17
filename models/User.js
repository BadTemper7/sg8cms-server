// models/User.js
import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
    },
    email: { type: String, default: "" },
    contactNumber: { type: String, default: "" },
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    roles: {
      type: String,
      enum: ["superadmin", "admin"],
      default: "admin",
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
    outletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Outlet",
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    modules: {
      type: [String],
      enum: ["dashboard", "outlets", "promotions", "videoAds", "users"],
      default: ["dashboard", "outlets", "promotions", "videoAds", "users"], // Super admin gets all
    },
    sessionId: { type: String, default: null },
    lastLogin: { type: Date, default: null },
    lastLoginIP: { type: String, default: null },
    devices: { type: Array, default: [] },
  },
  { timestamps: true },
);

// Hash password before save
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

// Password compare method
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    console.error("Password comparison error:", error);
    return false;
  }
};

// Update session for device
userSchema.methods.updateSession = async function (sessionId, deviceInfo, ip) {
  this.sessionId = sessionId;
  this.lastLogin = new Date();
  this.lastLoginIP = ip;

  if (!this.devices) this.devices = [];

  const existingDevice = this.devices.find((d) => d.sessionId === sessionId);

  if (existingDevice) {
    existingDevice.lastActive = new Date();
  } else {
    this.devices.push({
      sessionId,
      deviceInfo,
      ip,
      loginTime: new Date(),
      lastActive: new Date(),
    });
  }

  return this.save();
};

// Clear session
userSchema.methods.clearSession = async function (sessionId) {
  if (this.sessionId === sessionId) {
    this.sessionId = null;
  }

  if (this.devices) {
    this.devices = this.devices.filter((d) => d.sessionId !== sessionId);
  }

  return this.save();
};

const User = mongoose.model("User", userSchema);
export default User;
