import Invoice from "../../model/invoice.model.js";
import Orders from "../../model/orders.model.js";
import { generateInvoicePdf } from "../../services/invoice.service.js";

export const downloadOrderInvoice = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await Orders.findOne({
      $or: [
        { order_id: Number(orderId) || -1 },
        ...(String(orderId).match(/^[a-f\d]{24}$/i) ? [{ _id: orderId }] : []),
      ],
      user_email: req.user?.email,
    }).lean();
    if (!order || String(order.status || "").toUpperCase() !== "DELIVERED") {
      return res.status(404).json({ status: false, message: "Invoice is not available yet. Please contact support." });
    }
    const invoice = await Invoice.findOne({ orderId: order._id }).lean();
    if (!invoice) {
      return res.status(404).json({ status: false, message: "Invoice is not available yet. Please contact support." });
    }
    const pdf = await generateInvoicePdf(invoice);
    await Invoice.updateOne(
      { _id: invoice._id },
      { $inc: { "pdfMeta.downloadCount": 1 }, $set: { "pdfMeta.lastDownloadedAt": new Date() } }
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    return res.send(pdf);
  } catch (error) {
    console.error("downloadOrderInvoice error:", error);
    return res.status(500).json({ status: false, message: "Invoice is not available yet. Please contact support." });
  }
};
