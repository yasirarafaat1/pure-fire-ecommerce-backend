import mongoose from "mongoose";

const InvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true, immutable: true },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Orders",
      required: true,
      unique: true,
      index: true,
      immutable: true,
    },
    orderNumber: { type: Number, index: true, immutable: true },
    userId: { type: String, default: "", immutable: true },
    customerId: { type: String, default: "", immutable: true },
    issuedAt: { type: Date, required: true, immutable: true },
    deliveredAt: { type: Date, required: true, immutable: true },
    companySnapshot: { type: Object, required: true, immutable: true },
    customerSnapshot: { type: Object, required: true, immutable: true },
    orderSnapshot: { type: Object, required: true, immutable: true },
    items: { type: [Object], required: true, immutable: true },
    totals: { type: Object, required: true, immutable: true },
    pdfMeta: {
      downloadCount: { type: Number, default: 0 },
      lastDownloadedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

const Invoice = mongoose.model("Invoice", InvoiceSchema);
export default Invoice;
