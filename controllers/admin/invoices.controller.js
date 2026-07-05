import { createRequire } from "module";
import Invoice from "../../model/invoice.model.js";
import {
  escapeRegex,
  paginationPayload,
  parsePagination,
} from "../../utils/adminQuery.js";
import {
  ensureInvoiceForDeliveredOrder,
  generateInvoicePdf,
  validateInvoiceForPdf,
} from "../../services/invoice.service.js";
import { fireAndForgetSheetSync, syncOrderToGoogleSheets } from "../../services/googleSheetsSync.service.js";

const require = createRequire(import.meta.url);
const archiver = require("archiver");

const invoiceFilename = (invoice) => `${invoice.invoiceNumber || "invoice"}.pdf`;

const sendPdf = async (res, invoice) => {
  validateInvoiceForPdf(invoice);
  const pdf = await generateInvoicePdf(invoice);
  await Invoice.updateOne(
    { _id: invoice._id },
    { $inc: { "pdfMeta.downloadCount": 1 }, $set: { "pdfMeta.lastDownloadedAt": new Date() } }
  );
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${invoiceFilename(invoice)}"`);
  return res.send(pdf);
};

const searchFilter = (query) => {
  const search = String(query.search || query.q || "").trim();
  if (!search) return {};
  const regex = new RegExp(escapeRegex(search), "i");
  return {
    $or: [
      { invoiceNumber: regex },
      { "customerSnapshot.name": regex },
      { "customerSnapshot.phone": regex },
      { "customerSnapshot.email": regex },
      { "orderSnapshot.transactionId": regex },
      ...(Number.isFinite(Number(search)) ? [{ orderNumber: Number(search) }] : []),
    ],
  };
};

export const listInvoices = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = searchFilter(req.query);
  const [data, total] = await Promise.all([
    Invoice.find(filter).sort({ issuedAt: -1 }).skip(skip).limit(limit).lean(),
    Invoice.countDocuments(filter),
  ]);
  return res.json({ data, pagination: paginationPayload({ page, limit, total }) });
};

export const getInvoice = async (req, res) => {
  const id = req.params.id;
  const invoice = await Invoice.findOne({
    $or: [
      { invoiceNumber: id },
      ...(String(id).match(/^[a-f\d]{24}$/i) ? [{ _id: id }] : []),
    ],
  }).lean();
  if (!invoice) return res.status(404).json({ status: false, message: "Invoice not found" });
  return res.json({ status: true, data: invoice });
};

export const downloadInvoice = async (req, res) => {
  const invoice = await Invoice.findOne({
    $or: [
      { invoiceNumber: req.params.id },
      ...(String(req.params.id).match(/^[a-f\d]{24}$/i) ? [{ _id: req.params.id }] : []),
    ],
  }).lean();
  if (!invoice) return res.status(404).json({ status: false, message: "Invoice not found" });
  return sendPdf(res, invoice);
};

export const ensureInvoiceForOrder = async (req, res) => {
  const invoice = await ensureInvoiceForDeliveredOrder(req.params.orderId);
  if (!invoice) {
    return res.status(404).json({ status: false, message: "Invoice is not available yet" });
  }
  fireAndForgetSheetSync(syncOrderToGoogleSheets(invoice.orderNumber), "order");
  return res.json({ status: true, data: invoice });
};

export const bulkDownloadInvoices = async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((id) => String(id)).filter(Boolean) : [];
  if (!ids.length) {
    return res.status(400).json({ status: false, message: "Select at least one invoice" });
  }
  if (ids.length > 50) {
    return res.status(400).json({ status: false, message: "Bulk download limit is 50 invoices" });
  }
  const objectIds = ids.filter((id) => id.match(/^[a-f\d]{24}$/i));
  const invoices = await Invoice.find({
    $or: [{ invoiceNumber: { $in: ids } }, { _id: { $in: objectIds } }],
  }).lean();
  if (!invoices.length) {
    return res.status(404).json({ status: false, message: "No invoices found" });
  }
  if (invoices.length !== ids.length) {
    const found = new Set(invoices.flatMap((invoice) => [String(invoice._id), invoice.invoiceNumber]));
    const missing = ids.filter((id) => !found.has(id));
    return res.status(422).json({
      status: false,
      message: `Bulk download blocked. Missing invoices: ${missing.join(", ")}`,
    });
  }
  const invalid = [];
  invoices.forEach((invoice) => {
    try {
      validateInvoiceForPdf(invoice);
    } catch (error) {
      invalid.push(`${invoice.invoiceNumber || invoice._id}: ${error.message}`);
    }
  });
  if (invalid.length) {
    return res.status(422).json({
      status: false,
      message: `Bulk download blocked. Fix invalid invoices first: ${invalid.join("; ")}`,
    });
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="invoices.zip"');
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (error) => {
    console.error("Invoice bulk archive error:", error);
    res.destroy(error);
  });
  archive.pipe(res);

  const downloadedIds = [];
  for (const invoice of invoices) {
    const pdf = await generateInvoicePdf(invoice);
    archive.append(pdf, { name: invoiceFilename(invoice) });
    downloadedIds.push(invoice._id);
  }
  if (downloadedIds.length) {
    await Invoice.updateMany(
      { _id: { $in: downloadedIds } },
      { $inc: { "pdfMeta.downloadCount": 1 }, $set: { "pdfMeta.lastDownloadedAt": new Date() } }
    );
  }
  return archive.finalize();
};
