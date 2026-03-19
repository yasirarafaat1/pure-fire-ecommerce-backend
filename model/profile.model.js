import mongoose from "mongoose";

const ProfileSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, trim: true },
    name: { type: String, default: "" },
    gender: { type: String, default: "" },
  },
  { timestamps: true }
);

const Profile = mongoose.model("Profile", ProfileSchema);
export default Profile;
