import InstagramReel from "../model/instagramReel.model.js";
import StoreSetting from "../model/storeSetting.model.js";

const META_FIELDS = [
  "id",
  "caption",
  "media_type",
  "media_product_type",
  "media_url",
  "thumbnail_url",
  "permalink",
  "timestamp",
  "username",
].join(",");

const cleanHandle = (value = "") => String(value || "").trim().replace(/^@+/, "");

const normalizeMetaError = (message = "") => {
  const lower = String(message).toLowerCase();
  if (lower.includes("expired")) return "Instagram token expired. Generate a new long-lived token.";
  if (lower.includes("permission") || lower.includes("oauth")) return "Invalid Instagram permissions or token.";
  if (lower.includes("rate")) return "Meta rate limit reached. Try again later.";
  return message || "Instagram sync failed.";
};

export const publicReel = (reel) => ({
  id: String(reel._id || reel.id || reel.instagramMediaId),
  instagramMediaId: reel.instagramMediaId,
  title: reel.title || "Instagram Reel",
  description: reel.description || "",
  videoUrl: reel.videoUrl || "",
  thumbnailUrl: reel.thumbnailUrl || "",
  permalink: reel.permalink || "",
  timestamp: reel.timestamp,
  date: reel.timestamp
    ? new Date(reel.timestamp).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "",
  username: reel.username || "",
});

export const listPublicInstagramReels = async ({ limit = 20 } = {}) => {
  const settings = await StoreSetting.findOne({ key: "default" }).lean();
  const instagram = settings?.instagramReels || {};
  const enabled = Boolean(instagram.enabled);
  const handle = cleanHandle(instagram.handle);
  if (!enabled) return { enabled: false, handle: "", reels: [] };

  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const reels = await InstagramReel.find({ videoUrl: { $ne: "" } })
    .sort({ timestamp: -1, createdAt: -1 })
    .limit(safeLimit)
    .lean();
  return {
    enabled: true,
    handle,
    reels: reels.map((reel) => publicReel({ ...reel, username: reel.username || handle })),
  };
};

export const testInstagramConnection = async () => {
  const settings = await StoreSetting.findOne({ key: "default" }).lean();
  const instagram = settings?.instagramReels || {};
  if (!instagram.igUserId) {
    const error = new Error("Instagram User ID / IG Business Account ID is required.");
    error.statusCode = 400;
    throw error;
  }
  if (!instagram.accessToken) {
    const error = new Error("Long-lived Instagram access token is required.");
    error.statusCode = 400;
    throw error;
  }

  const url = new URL(`https://graph.facebook.com/v20.0/${instagram.igUserId}`);
  url.searchParams.set("fields", "id,username");
  url.searchParams.set("access_token", instagram.accessToken);
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const error = new Error(normalizeMetaError(payload?.error?.message));
    error.statusCode = 400;
    throw error;
  }
  return {
    id: payload.id,
    username: payload.username || cleanHandle(instagram.handle),
  };
};

export const syncInstagramReels = async () => {
  const settings = await StoreSetting.findOne({ key: "default" });
  const instagram = settings?.instagramReels || {};
  if (!instagram.igUserId || !instagram.accessToken) {
    const message = !instagram.igUserId
      ? "Instagram User ID / IG Business Account ID is required."
      : "Long-lived Instagram access token is required.";
    await StoreSetting.updateOne(
      { key: "default" },
      {
        $set: {
          "instagramReels.lastSyncedAt": new Date(),
          "instagramReels.lastSyncStatus": "failed",
          "instagramReels.lastSyncError": message,
        },
      }
    );
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }

  // Meta setup note: Instagram account must be Business/Creator, connected to a Facebook Page,
  // backed by a Meta Developer app with media permissions and a long-lived server-side token.
  const url = new URL(`https://graph.facebook.com/v20.0/${instagram.igUserId}/media`);
  url.searchParams.set("fields", META_FIELDS);
  url.searchParams.set("limit", "50");
  url.searchParams.set("access_token", instagram.accessToken);

  try {
    const response = await fetch(url);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) {
      throw new Error(normalizeMetaError(payload?.error?.message));
    }

    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const reels = rows.filter((item) => {
      const productType = String(item.media_product_type || "").toUpperCase();
      const mediaType = String(item.media_type || "").toUpperCase();
      return productType === "REELS" && (!mediaType || mediaType === "VIDEO");
    });

    for (const item of reels) {
      const caption = String(item.caption || "").trim();
      await InstagramReel.findOneAndUpdate(
        { instagramMediaId: String(item.id) },
        {
          $set: {
            instagramMediaId: String(item.id),
            title: caption.split("\n")[0]?.trim() || "Instagram Reel",
            description: caption || "Instagram Reel",
            videoUrl: item.media_url || "",
            thumbnailUrl: item.thumbnail_url || "",
            permalink: item.permalink || "",
            timestamp: item.timestamp ? new Date(item.timestamp) : null,
            username: item.username || cleanHandle(instagram.handle),
          },
        },
        { upsert: true, new: true }
      );
    }

    await StoreSetting.updateOne(
      { key: "default" },
      {
        $set: {
          "instagramReels.lastSyncedAt": new Date(),
          "instagramReels.lastSyncStatus": "success",
          "instagramReels.lastSyncError": reels.length ? "" : "No reels found.",
        },
      }
    );
    return { synced: reels.length };
  } catch (error) {
    await StoreSetting.updateOne(
      { key: "default" },
      {
        $set: {
          "instagramReels.lastSyncedAt": new Date(),
          "instagramReels.lastSyncStatus": "failed",
          "instagramReels.lastSyncError": error.message,
        },
      }
    );
    error.statusCode = error.statusCode || 400;
    throw error;
  }
};
