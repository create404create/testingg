const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middlewares/auth');
const adminController = require('../controllers/adminController');

// Admin only routes
router.use(protect, admin);

router.get('/users', adminController.getAllUsers);
router.get('/files', adminController.getAllFiles);
router.get('/stats', adminController.getSystemStats);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);
router.delete('/files/:id', adminController.adminDeleteFile);

module.exports = router;
