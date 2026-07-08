import SizeGuide from "../../model/sizeGuide.model.js";

const DEFAULT_SIZE_GUIDE = {
  key: "default",
  title: "Size Guide",
  intro: "Use this guide to compare body measurements before choosing a size.",
  sections: [
    {
      heading: "How to Measure",
      body: "Measure around the fullest part of your chest, waist, and hips. Keep the tape comfortably firm and parallel to the floor.",
      table: { headers: [], rows: [] },
      order: 0,
    },
    {
      heading: "Women",
      body: "General garment size reference.",
      table: {
        headers: ["Size", "Bust", "Waist", "Hip"],
        rows: [
          ["S", "34", "28", "36"],
          ["M", "36", "30", "38"],
          ["L", "38", "32", "40"],
          ["XL", "40", "34", "42"],
        ],
      },
      order: 1,
    },
    {
      heading: "Men",
      body: "General garment size reference.",
      table: {
        headers: ["Size", "Chest", "Waist", "Shoulder"],
        rows: [
          ["S", "38", "30", "17"],
          ["M", "40", "32", "18"],
          ["L", "42", "34", "19"],
          ["XL", "44", "36", "20"],
        ],
      },
      order: 2,
    },
  ],
};

const cleanStringArray = (value, limit) =>
  (Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, limit);

const normalizeSections = (sections) =>
  (Array.isArray(sections) ? sections : [])
    .slice(0, 20)
    .map((section, index) => {
      const headers = cleanStringArray(section?.table?.headers, 8);
      const rows = (Array.isArray(section?.table?.rows) ? section.table.rows : [])
        .slice(0, 30)
        .map((row) => cleanStringArray(row, 8));

      return {
        heading: String(section?.heading || "").trim().slice(0, 80),
        body: String(section?.body || "").trim().slice(0, 3000),
        table: { headers, rows },
        order: Number.isFinite(Number(section?.order)) ? Number(section.order) : index,
      };
    })
    .filter((section) => section.heading);

const ensureSizeGuide = async () => {
  const existing = await SizeGuide.findOne({ key: "default" });
  if (existing) return existing;
  return SizeGuide.create(DEFAULT_SIZE_GUIDE);
};

export const getSizeGuideAdmin = async (_req, res) => {
  const guide = await ensureSizeGuide();
  res.status(200).json({ status: true, data: guide });
};

export const updateSizeGuideAdmin = async (req, res) => {
  const payload = {
    title: String(req.body?.title || "Size Guide").trim().slice(0, 120),
    intro: String(req.body?.intro || "").trim().slice(0, 2000),
    sections: normalizeSections(req.body?.sections),
    updatedBy: req.admin?._id || null,
  };

  if (!payload.title) return res.status(400).json({ status: false, message: "Title is required." });
  if (!payload.sections.length) {
    return res.status(400).json({ status: false, message: "Add at least one size guide section." });
  }

  const guide = await SizeGuide.findOneAndUpdate(
    { key: "default" },
    { $set: payload, $setOnInsert: { key: "default" } },
    { new: true, upsert: true, runValidators: true },
  );

  res.status(200).json({ status: true, data: guide });
};
