import multer from "multer";

const storage = multer.memoryStorage();

const productMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/webm",
]);

const imageMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const fileFilter = (allowed) => (_req, file, callback) => {
  if (!allowed.has(file.mimetype)) {
    return callback(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
  }
  callback(null, true);
};

export const productUpload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 40, fields: 100 },
  fileFilter: fileFilter(productMimeTypes),
});

export const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20 },
  fileFilter: fileFilter(imageMimeTypes),
});

export const upload = productUpload;
