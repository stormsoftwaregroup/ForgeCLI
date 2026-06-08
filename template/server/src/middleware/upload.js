import multer from 'multer';

const ALLOWED_MIMETYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIMETYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed. Accepted: jpg, png, gif, webp, pdf, doc, docx'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

/**
 * Middleware for a single file upload.
 */
export function uploadSingle(fieldName) {
  return upload.single(fieldName);
}

/**
 * Middleware for multiple file uploads.
 */
export function uploadMultiple(fieldName, max = 5) {
  return upload.array(fieldName, max);
}
