import mongoose from "mongoose";
const announcementSchema = new mongoose.Schema(
  {
    expiry: { type: Date },
    status: {
      type: String,
      enum: ["active", "hide", "expired"],
      default: "active",
      required: true,
    },
    desc: { type: String, required: true },
  },
  { timestamps: true }
);
const Announcement = mongoose.model("Announcement", announcementSchema);

export default Announcement;
