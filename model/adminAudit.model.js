import mongoose from "mongoose";

const AdminAuditSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", index: true },
    adminEmail: { type: String, index: true, default: "" },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, default: "", index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  { timestamps: true }
);

AdminAuditSchema.index({ createdAt: -1 });

const AdminAudit = mongoose.model("AdminAudit", AdminAuditSchema);
export default AdminAudit;
