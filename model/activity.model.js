import mongoose from "mongoose";

const UserActivitySchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, trim: true },
    recent_searches: { type: [String], default: [] },
    recent_viewed: { type: [Number], default: [] },
    suggested_product_ids: { type: [Number], default: [] },
  },
  { timestamps: true }
);

const UserActivity = mongoose.model("UserActivity", UserActivitySchema);
export default UserActivity;
