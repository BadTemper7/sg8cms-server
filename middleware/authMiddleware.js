// middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from token
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if session is still valid
      const sessionId = req.headers["x-session-id"];
      if (user.sessionId !== sessionId) {
        return res.status(401).json({
          message:
            "Session expired. You have been logged out from another device.",
          code: "SESSION_EXPIRED",
        });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: "Not authorized" });
    }
  }

  if (!token) {
    res.status(401).json({ message: "Not authorized, no token" });
  }
};

export const adminOnly = (req, res, next) => {
  if (
    req.user &&
    (req.user.roles === "admin" || req.user.roles === "superadmin")
  ) {
    next();
  } else {
    res.status(403).json({ message: "Access denied. Admin only." });
  }
};

export const superadminOnly = (req, res, next) => {
  if (req.user && req.user.roles === "superadmin") {
    next();
  } else {
    res.status(403).json({ message: "Access denied. Superadmin only." });
  }
};
