// scripts/fixPassword.js (run this once to fix existing user)
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

const fixPasswords = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Find all users
    const users = await User.find();

    for (const user of users) {
      // Check if password is already hashed (starts with $2b$ or $2a$)
      if (!user.password.startsWith("$2")) {
        console.log(`Fixing password for user: ${user.username}`);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(user.password, salt);
        user.password = hashedPassword;
        await user.save();
        console.log(`Fixed password for ${user.username}`);
      } else {
        console.log(`Password already hashed for ${user.username}`);
      }
    }

    console.log("Password fix completed");
    process.exit(0);
  } catch (error) {
    console.error("Error fixing passwords:", error);
    process.exit(1);
  }
};

fixPasswords();
