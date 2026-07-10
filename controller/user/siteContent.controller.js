import NavStrip from "../../model/navStrip.model.js";
import NavStripSetting from "../../model/navStripSetting.model.js";
import SizeGuide from "../../model/sizeGuide.model.js";

const DEFAULT_SIZE_GUIDE = {
  title: "Size Guide",
  intro: "Use this guide to compare measurements before choosing a size.",
  sections: [
    {
      heading: "How to Measure",
      body: "Measure around the fullest part of your chest, waist, and hips. Keep the tape comfortably firm and parallel to the floor.",
      table: { headers: [], rows: [] },
      order: 0,
    },
  ],
};

export const getPublicNavStrip = async (_req, res) => {
  const [items, settings] = await Promise.all([
    NavStrip.find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .select("text textHtml hoverText href timer order createdAt")
      .lean(),
    NavStripSetting.findOne({ key: "default" }).lean(),
  ]);

  const durationSeconds = Math.min(10, Math.max(1, Number(settings?.durationSeconds || 4)));

  res.status(200).json({ status: true, data: items, settings: { durationSeconds } });
};

export const getPublicSizeGuide = async (_req, res) => {
  const guide = await SizeGuide.findOne({ key: "default" }).lean();
  const data = guide
    ? {
        title: guide.title,
        intro: guide.intro,
        sections: [...(guide.sections || [])].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
        updatedAt: guide.updatedAt,
      }
    : DEFAULT_SIZE_GUIDE;

  res.status(200).json({ status: true, data });
};
