const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const { protect } = require('../middlewares/auth');
const upload = require('../config/multer');
const { validateFileUpload } = require('../middlewares/validation');

// All routes are protected
router.use(protect);

// Upload routes
router.post('/upload', upload.single('file'), validateFileUpload, fileController.uploadFile);
router.post('/upload-multiple', upload.array('files', 10), validateFileUpload, fileController.uploadMultipleFiles);

// File management routes
router.get('/', fileController.getUserFiles);
router.get('/stats', fileController.getUserStats);
router.get('/:id', fileController.getFile);
router.get('/download/:id', fileController.downloadFile);
router.put('/:id', fileController.updateFile);
router.delete('/:id', fileController.deleteFile);

// Admin cleanup (optional)
router.post('/cleanup', fileController.cleanupFiles);

module.exports = router;
