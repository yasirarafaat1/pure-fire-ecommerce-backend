import mongoose from "mongoose";

const AdminNotificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["INFO", "SUCCESS", "WARNING", "ERROR"],
      default: "INFO",
    },
    target: { type: String, default: "ADMIN" },
    status: { type: String, enum: ["ACTIVE", "ARCHIVED"], default: "ACTIVE", index: true },
  },
  { timestamps: true }
);

const AdminNotification = mongoose.model("AdminNotification", AdminNotificationSchema);
export default AdminNotification;
