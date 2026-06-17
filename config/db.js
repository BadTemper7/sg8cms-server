// config/db.js (add this before connecting)
import mongoose from "mongoose";

const connectDB = async () => {
  try {
    // Set timezone handling for mongoose dates
    mongoose.set("toJSON", {
      transform: (doc, ret) => {
        if (ret.createdAt) {
          ret.createdAt = new Date(ret.createdAt).toLocaleString("en-US", {
            timeZone: "Asia/Manila",
          });
        }
        if (ret.updatedAt) {
          ret.updatedAt = new Date(ret.updatedAt).toLocaleString("en-US", {
            timeZone: "Asia/Manila",
          });
        }
        return ret;
      },
    });

    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Log the current timezone setting
    console.log(
      `🕐 MongoDB using system timezone: ${process.env.TZ || "system default"}`,
    );
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
