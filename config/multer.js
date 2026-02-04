const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// File filter
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'text/plain',           // .txt
        'application/pdf',      // .pdf
        'image/jpeg',           // .jpg, .jpeg
        'image/png',            // .png
        'image/gif',            // .gif
        'application/msword',   // .doc
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only .txt, .pdf, .jpg, .png, .gif, .doc, .docx allowed'), false);
    }
};

// Storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Create user-specific folder if needed
        const userDir = path.join(uploadDir, req.user?.id || 'anonymous');
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
        cb(null, userDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

// Multer instance
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default
    }
});

module.exports = upload;
