import PDFDocument from "pdfkit";
import Invoice from "../model/invoice.model.js";
import Orders from "../model/orders.model.js";
import StoreSetting from "../model/storeSetting.model.js";
import { getNextSequence } from "../model/counter.model.js";

const toNumber = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const rupeesFromPaise = (value) => toNumber(value) / 100;

const normalizeCurrency = (value) => {
  const currency = String(value || "INR").trim();
  return currency === "₹" ? "INR" : currency || "INR";
};

export const formatInvoiceMoney = (value, currency = "INR") =>
  `${normalizeCurrency(currency)} ${toNumber(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const formatInvoiceDate = (value) => {
  if (!value) return "-";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-IN");
};

const normalizeStatus = (value) => String(value || "").trim().toUpperCase();

const deliveredDateFromOrder = (order) => {
  const timeline = Array.isArray(order.timeline) ? order.timeline : [];

  const delivered = [...timeline]
    .reverse()
    .find((entry) => normalizeStatus(entry.status) === "DELIVERED");

  return delivered?.createdAt || order.updatedAt || new Date();
};

const validateCompanySnapshot = (settings) => {
  const businessName = String(settings?.storeName || "").trim();
  const address = String(settings?.address || "").trim();
  const email = String(settings?.supportEmail || "").trim();
  const phone = String(settings?.supportPhone || "").trim();
  const gstin = String(settings?.gstin || settings?.gstNumber || "").trim();

  const gstPercentage =
    settings?.gstPercentage === null ||
    settings?.gstPercentage === undefined ||
    settings?.gstPercentage === ""
      ? null
      : toNumber(settings.gstPercentage);

  const missing = [];

  if (!businessName) missing.push("business name");
  if (!address) missing.push("address");
  if (!email && !phone) missing.push("email or phone");
  if (!gstin) missing.push("GSTIN");

  if (missing.length) {
    const error = new Error(`Invoice company fields missing: ${missing.join(", ")}`);
    error.statusCode = 422;
    throw error;
  }

  return {
    businessName,
    legalName: businessName,
    address,
    city: "",
    state: "",
    postalCode: "",
    country: "India",
    email,
    phone,
    gstin,
    gstPercentage,
  };
};

const productName = (item) =>
  item?.product?.title ||
  item?.product?.name ||
  item?.name ||
  `Product #${item?.product_id || ""}`;

const itemSku = (item) => item?.product?.sku || item?.sku || "";

const buildAddress = (order) =>
  [order.address_line1, order.city, order.state, order.pinCode, order.country]
    .filter(Boolean)
    .join(", ");

export const generateInvoiceNumber = async () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const dateKey = `${yyyy}${mm}${dd}`;

  const seq = await getNextSequence(`invoice_${dateKey}`);

  return `INV-${dateKey}-${String(seq).padStart(6, "0")}`;
};

export const buildInvoiceSnapshot = async (order) => {
  const settings = await StoreSetting.findOne({ key: "default" }).lean();
  const companySnapshot = validateCompanySnapshot(settings);
  const deliveredAt = deliveredDateFromOrder(order);
  const currency = normalizeCurrency(order.currency || "INR");

  const items = (order.items || []).map((item) => {
    const quantity = toNumber(item.quantity) || 1;
    const unitPrice = toNumber(item.price);
    const mrp = toNumber(item?.product?.price);

    const discount = Math.max(0, mrp > unitPrice ? (mrp - unitPrice) * quantity : 0);

    const rawGstRate = item.gstRate ?? item.gst_rate ?? item.taxRate ?? item.tax_rate;
    const needsStoreGst = rawGstRate === undefined || rawGstRate === null || rawGstRate === "";

    const gstRate =
      needsStoreGst && companySnapshot.gstPercentage === null
        ? null
        : needsStoreGst
          ? toNumber(companySnapshot.gstPercentage)
          : toNumber(rawGstRate);

    const grossLineTotal = unitPrice * quantity;

    const savedGstAmount = item.gstAmount ?? item.gst_amount ?? item.taxAmount ?? item.tax_amount;

    const gstAmount =
      savedGstAmount === undefined || savedGstAmount === null || savedGstAmount === ""
        ? toNumber(gstRate) > 0
          ? (grossLineTotal * toNumber(gstRate)) / (100 + toNumber(gstRate))
          : 0
        : toNumber(savedGstAmount);

    return {
      productName: productName(item),
      sku: itemSku(item),
      variant: [item.color, item.size].filter(Boolean).join(" / "),
      color: item.color || "",
      size: item.size || "",
      quantity,
      unitPrice,
      discount,
      gstRate,
      gstRateSource: needsStoreGst ? "store" : "item",
      gstRateMissing: needsStoreGst && companySnapshot.gstPercentage === null,
      gstAmount,
      lineTotal: grossLineTotal,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const discount = items.reduce((sum, item) => sum + item.discount, 0);
  const gstTotal = items.reduce((sum, item) => sum + item.gstAmount, 0);
  const grandTotal = rupeesFromPaise(order.amount) || subtotal;
  const shippingCharge = Math.max(0, grandTotal - subtotal + discount - gstTotal);

  return {
    orderId: order._id,
    orderNumber: order.order_id,
    userId: order.user_email || "",
    customerId: order.user_email || "",
    issuedAt: new Date(),
    deliveredAt,

    companySnapshot,

    customerSnapshot: {
      name: order.FullName || "",
      email: order.user_email || "",
      phone: order.phone1 || order.phone2 || "",
      billingAddress: buildAddress(order),
      shippingAddress: buildAddress(order),
    },

    orderSnapshot: {
      orderId: String(order._id || ""),
      orderNumber: order.order_id,
      orderDate: order.createdAt,
      deliveredDate: deliveredAt,
      paymentMethod: order.payment_method || "",
      paymentStatus: order.payment_status || "",
      transactionId:
        order.razorpay_payment_id ||
        order.payu_payment_id ||
        order.razorpay_order_id ||
        "",
      gatewayProvider:
        order.razorpay_payment_id || order.razorpay_order_id
          ? "Razorpay"
          : order.payu_payment_id
            ? "PayU"
            : "",
      paidAmount: rupeesFromPaise(order.amount),
      paymentDate: order.updatedAt || order.createdAt,
      currency,
    },

    items,

    totals: {
      subtotal,
      discount,
      shippingCharge,
      taxableAmount: Math.max(0, subtotal - discount - gstTotal),
      gstTotal,
      grandTotal,
    },

    pdfMeta: {
      downloadCount: 0,
      lastDownloadedAt: null,
    },
  };
};

export const ensureInvoiceForDeliveredOrder = async (orderId) => {
  const order = await Orders.findOne({
    $or: [
      { order_id: Number(orderId) || -1 },
      ...(String(orderId).match(/^[a-f\d]{24}$/i) ? [{ _id: orderId }] : []),
    ],
  }).populate("items.product", "name title sku price selling_price");

  if (!order) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }

  if (normalizeStatus(order.status) !== "DELIVERED") return null;

  const existing = await Invoice.findOne({ orderId: order._id });
  if (existing) return existing;

  const snapshot = await buildInvoiceSnapshot(order);

  try {
    return await Invoice.create({
      invoiceNumber: await generateInvoiceNumber(),
      ...snapshot,
    });
  } catch (error) {
    if (error?.code === 11000) {
      const duplicate = await Invoice.findOne({ orderId: order._id });
      if (duplicate) return duplicate;
    }

    throw error;
  }
};

export const validateInvoiceForPdf = (invoice) => {
  const company = invoice?.companySnapshot || {};
  const customer = invoice?.customerSnapshot || {};
  const order = invoice?.orderSnapshot || {};
  const totals = invoice?.totals || {};
  const missing = [];

  if (!invoice?.invoiceNumber) missing.push("invoice number");
  if (!invoice?.issuedAt) missing.push("invoice date");

  if (!company.businessName && !company.legalName) {
    missing.push("company name");
  }

  if (!company.address) missing.push("company address");
  if (!company.gstin) missing.push("company GSTIN");

  if (!customer.name && !customer.phone && !customer.email) {
    missing.push("customer name, phone, or email");
  }

  if (!order.orderId && !invoice?.orderNumber) {
    missing.push("order number");
  }

  if (!Array.isArray(invoice?.items) || !invoice.items.length) {
    missing.push("invoice items");
  }

  if ((invoice?.items || []).some((item) => item?.gstRateMissing)) {
    missing.push("GST percentage");
  }

  const grandTotal = Number(totals.grandTotal);

  if (!Number.isFinite(grandTotal) || grandTotal <= 0) {
    missing.push("grand total");
  }

  if (missing.length) {
    const error = new Error(`Invoice cannot be downloaded. Missing: ${missing.join(", ")}`);
    error.statusCode = 422;
    error.details = missing;
    throw error;
  }
};

export const generateInvoicePdf = (invoice) =>
  new Promise((resolve, reject) => {
    validateInvoiceForPdf(invoice);

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const company = invoice.companySnapshot || {};
    const customer = invoice.customerSnapshot || {};
    const order = invoice.orderSnapshot || {};
    const totals = invoice.totals || {};
    const currency = normalizeCurrency(order.currency || "INR");

    const leftX = doc.page.margins.left;
    const rightLimit = doc.page.width - doc.page.margins.right;
    const contentWidth = rightLimit - leftX;

    const headerGap = 20;
    const headerColumnWidth = (contentWidth - headerGap) / 2;
    const rightX = leftX + headerColumnWidth + headerGap;

    const bottomLimit = doc.page.height - doc.page.margins.bottom;

    const safe = (value) => {
      if (value === undefined || value === null || value === "") return "-";
      return String(value);
    };

    const discountAsNegative = (value) => {
      const amount = Math.abs(toNumber(value));
      return amount > 0 ? -amount : 0;
    };

    const drawFooter = () => {
      doc
        .font("Helvetica")
        .fontSize(9)
        .text("Thank you for shopping with us.", leftX, 735, {
          align: "center",
          width: contentWidth,
        });

      doc.text("This is a computer-generated invoice.", leftX, 750, {
        align: "center",
        width: contentWidth,
      });
    };

    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .text(company.businessName || company.legalName || "-", leftX, 42, {
        width: headerColumnWidth,
        lineGap: 2,
      });

    doc.font("Helvetica").fontSize(9);

    [
      company.address,
      [company.city, company.state, company.postalCode].filter(Boolean).join(", "),
      company.country,
      company.email,
      company.phone,
      company.gstin ? `GSTIN: ${company.gstin}` : "",
    ]
      .filter(Boolean)
      .forEach((line) => {
        doc.text(line, {
          width: headerColumnWidth,
          lineGap: 2,
        });
      });

    const companyEndY = doc.y;

    doc.font("Helvetica-Bold").fontSize(30).text("INVOICE", rightX, 42, {
      align: "right",
      width: headerColumnWidth,
    });

    const metaRows = [
      ["Invoice No", invoice.invoiceNumber],
      ["Invoice Date", formatInvoiceDate(invoice.issuedAt)],
      ["Order ID", invoice.orderNumber || String(invoice.orderId || "")],
      ["Order Date", formatInvoiceDate(order.orderDate)],
    ];

    let metaY = 92;

    metaRows.forEach(([label, value]) => {
      doc.font("Helvetica-Bold").fontSize(9).text(`${label}:`, rightX, metaY, {
        width: 85,
      });

      doc.font("Helvetica").fontSize(9).text(safe(value), rightX + 85, metaY, {
        width: headerColumnWidth - 85,
        align: "right",
      });

      metaY += 16;
    });

    let y = Math.max(companyEndY, metaY) + 34;

    const drawInfoSection = (title, x, width, lines) => {
      let localY = y;

      doc.font("Helvetica-Bold").fontSize(10).text(title, x, localY, {
        width,
      });

      localY += 18;

      doc.font("Helvetica").fontSize(9);

      lines.forEach((line) => {
        const text = safe(line);
        const height = doc.heightOfString(text, {
          width,
          lineGap: 2,
        });

        doc.text(text, x, localY, {
          width,
          lineGap: 2,
        });

        localY += Math.max(14, height + 4);
      });

      return localY;
    };

    const shipToEndY = drawInfoSection("Ship To", leftX, headerColumnWidth, [
      customer.name,
      customer.email,
      customer.phone,
      customer.shippingAddress,
    ]);

    const paymentEndY = drawInfoSection("Payment Details", rightX, headerColumnWidth, [
      `Payment Method: ${safe(order.paymentMethod)}`,
      `Payment Status: ${safe(order.paymentStatus)}`,
      `Transaction ID: ${safe(order.transactionId)}`,
    ]);

    y = Math.max(shipToEndY, paymentEndY) + 34;

    const columns = [
      { label: "#", width: 22, align: "left" },
      { label: "Description", width: 104, align: "left" },
      { label: "SKU", width: 52, align: "left" },
      { label: "Variant", width: 50, align: "left" },
      { label: "Qty", width: 28, align: "right" },
      { label: "Rate", width: 50, align: "right" },
      { label: "Discount", width: 55, align: "right" },
      { label: "GST %", width: 38, align: "right" },
      { label: "GST Amount", width: 58, align: "right" },
      { label: "Amount", width: 58, align: "right" },
    ];

    const getColumnX = (columnIndex) =>
      leftX + columns.slice(0, columnIndex).reduce((sum, column) => sum + column.width, 0);

    const drawTableHeader = () => {
      doc.moveTo(leftX, y - 8).lineTo(rightLimit, y - 8).stroke();

      doc.font("Helvetica-Bold").fontSize(8);

      columns.forEach((column, index) => {
        doc.text(column.label, getColumnX(index), y, {
          width: column.width,
          align: column.align,
        });
      });

      doc.moveTo(leftX, y + 15).lineTo(rightLimit, y + 15).stroke();

      y += 26;
    };

    const ensureSpace = (height) => {
      if (y + height <= bottomLimit - 55) return;

      doc.addPage();
      y = 55;
      drawTableHeader();
    };

    drawTableHeader();

    doc.font("Helvetica").fontSize(8);

    (invoice.items || []).forEach((item, index) => {
      const rowValues = [
        index + 1,
        safe(item.productName),
        safe(item.sku),
        safe(item.variant),
        safe(item.quantity),
        formatInvoiceMoney(item.unitPrice, currency),
        formatInvoiceMoney(item.discount, currency),
        item.gstRate === undefined || item.gstRate === null
          ? "-"
          : toNumber(item.gstRate).toFixed(2),
        formatInvoiceMoney(item.gstAmount, currency),
        formatInvoiceMoney(item.lineTotal, currency),
      ];

      const rowTextHeights = rowValues.map((value, columnIndex) =>
        doc.heightOfString(String(value), {
          width: columns[columnIndex].width,
          lineGap: 2,
        }),
      );

      const rowHeight = Math.max(24, Math.max(...rowTextHeights) + 10);

      ensureSpace(rowHeight);

      columns.forEach((column, columnIndex) => {
        doc.text(String(rowValues[columnIndex]), getColumnX(columnIndex), y + 5, {
          width: column.width,
          align: column.align,
          lineGap: 2,
        });
      });

      y += rowHeight;

      doc.moveTo(leftX, y).lineTo(rightLimit, y).strokeColor("#e5e7eb").stroke();
      doc.strokeColor("black");
    });

    y += 18;

    const totalRows = [
      ["Subtotal", totals.subtotal],
      ["Discount", discountAsNegative(totals.discount)],
      ["Shipping", totals.shippingCharge],
      ["GST", totals.gstTotal],
      ["Grand Total", totals.grandTotal],
    ];

    if (y + totalRows.length * 20 > bottomLimit - 70) {
      doc.addPage();
      y = 60;
    }

    const totalLabelX = 345;
    const totalValueX = 465;

    totalRows.forEach(([label, value], index) => {
      const isGrandTotal = index === totalRows.length - 1;

      if (isGrandTotal) {
        doc.moveTo(totalLabelX, y - 4).lineTo(rightLimit, y - 4).stroke();
      }

      doc
        .font(isGrandTotal ? "Helvetica-Bold" : "Helvetica")
        .fontSize(isGrandTotal ? 11 : 10);

      doc.text(label, totalLabelX, y, {
        width: 110,
        align: "right",
      });

      doc.text(formatInvoiceMoney(value, currency), totalValueX, y, {
        width: rightLimit - totalValueX,
        align: "right",
      });

      y += 18;
    });

    drawFooter();
    doc.end();
  });