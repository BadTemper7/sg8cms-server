import mongoose from "mongoose";

const outletVideoAssignmentSchema = new mongoose.Schema(
  {
    outletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Outlet",
      required: true,
      index: true,
    },
    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Video",
      required: true,
    },

    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },

    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

outletVideoAssignmentSchema.index({
  outletId: 1,
  active: 1,
  startAt: 1,
  endAt: 1,
});

export default mongoose.model(
  "OutletVideoAssignment",
  outletVideoAssignmentSchema,
);
