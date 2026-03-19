import multer from "multer";

const storage = multer.memoryStorage();

// allow larger uploads to accommodate product video
export const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB per file
});
