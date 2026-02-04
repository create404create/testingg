const User = require('../models/User');
const File = require('../models/File');

// @desc    Get all users (Admin)
// @route   GET /api/admin/users
// @access  Private/Admin
const getAllUsers = async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '', role = '' } = req.query;
        
        const query = {};
        
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (role) {
            query.role = role;
        }

        const users = await User.find(query)
            .select('-password -__v')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ createdAt: -1 });

        const total = await User.countDocuments(query);

        res.status(200).json({
            success: true,
            count: users.length,
            total,
            pages: Math.ceil(total / limit),
            currentPage: page,
            users
        });
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// @desc    Get all files (Admin)
// @route   GET /api/admin/files
// @access  Private/Admin
const getAllFiles = async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '' } = req.query;
        
        const query = { deleted: false };
        
        if (search) {
            query.$or = [
                { originalName: { $regex: search, $options: 'i' } },
                { userEmail: { $regex: search, $options: 'i' } },
                { userName: { $regex: search, $options: 'i' } }
            ];
        }

        const files = await File.find(query)
            .populate('userId', 'name email')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ uploadedAt: -1 });

        const total = await File.countDocuments(query);

        // Get total statistics
        const totalFiles = await File.countDocuments({ deleted: false });
        const totalStorage = await File.aggregate([
            { $match: { deleted: false } },
            { $group: { _id: null, total: { $sum: '$fileSize' } } }
        ]);

        res.status(200).json({
            success: true,
            count: files.length,
            total,
            pages: Math.ceil(total / limit),
            currentPage: page,
            stats: {
                totalFiles,
                totalStorage: totalStorage[0]?.total || 0
            },
            files
        });
    } catch (error) {
        console.error('Get all files error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// @desc    Get system statistics (Admin)
// @route   GET /api/admin/stats
// @access  Private/Admin
const getSystemStats = async (req, res) => {
    try {
        // User statistics
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ isActive: true });
        const newUsersToday = await User.countDocuments({
            createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
        });

        // File statistics
        const totalFiles = await File.countDocuments({ deleted: false });
        const filesToday = await File.countDocuments({
            uploadedAt: { $gte: new Date().setHours(0, 0, 0, 0) }
        });
        
        const totalStorage = await File.aggregate([
            { $match: { deleted: false } },
            { $group: { _id: null, total: { $sum: '$fileSize' } } }
        ]);

        // File type distribution
        const fileTypes = await File.aggregate([
            { $match: { deleted: false } },
            {
                $group: {
                    _id: '$fileType',
                    count: { $sum: 1 },
                    totalSize: { $sum: '$fileSize' }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // User activity
        const activeToday = await User.countDocuments({
            lastLogin: { $gte: new Date().setHours(0, 0, 0, 0) }
        });

        // Storage usage by user
        const topUsers = await User.find()
            .sort({ storageUsed: -1 })
            .limit(10)
            .select('name email storageUsed fileCount');

        res.status(200).json({
            success: true,
            stats: {
                users: {
                    total: totalUsers,
                    active: activeUsers,
                    newToday: newUsersToday,
                    activeToday
                },
                files: {
                    total: totalFiles,
                    uploadedToday: filesToday,
                    totalStorage: totalStorage[0]?.total || 0
                },
                fileTypes,
                topUsers: topUsers.map(user => ({
                    name: user.name,
                    email: user.email,
                    storageUsed: user.storageUsed,
                    fileCount: user.fileCount,
                    formattedStorage: formatBytes(user.storageUsed)
                }))
            }
        });
    } catch (error) {
        console.error('Get system stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// @desc    Update user (Admin)
// @route   PUT /api/admin/users/:id
// @access  Private/Admin
const updateUser = async (req, res) => {
    try {
        const { role, isActive, storageLimit } = req.body;
        
        const updateData = {};
        if (role) updateData.role = role;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (storageLimit) updateData.storageLimit = storageLimit;

        const user = await User.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password -__v');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'User updated successfully',
            user
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// @desc    Delete user (Admin)
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // First, delete all user files
        const userFiles = await File.find({ userId: user._id });
        
        // Delete files from disk
        const fs = require('fs');
        userFiles.forEach(file => {
            if (fs.existsSync(file.filePath)) {
                fs.unlinkSync(file.filePath);
            }
        });

        // Delete file records from database
        await File.deleteMany({ userId: user._id });

        // Delete user
        await User.findByIdAndDelete(user._id);

        res.status(200).json({
            success: true,
            message: `User and ${userFiles.length} files deleted successfully`
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// @desc    Delete file (Admin)
// @route   DELETE /api/admin/files/:id
// @access  Private/Admin
const adminDeleteFile = async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        
        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Delete from disk
        const fs = require('fs');
        if (fs.existsSync(file.filePath)) {
            fs.unlinkSync(file.filePath);
        }

        // Update user statistics
        await User.findByIdAndUpdate(file.userId, {
            $inc: {
                fileCount: -1,
                storageUsed: -file.fileSize
            }
        });

        // Delete from database
        await File.findByIdAndDelete(file._id);

        res.status(200).json({
            success: true,
            message: 'File deleted successfully'
        });
    } catch (error) {
        console.error('Admin delete file error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Helper function to format bytes
const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

module.exports = {
    getAllUsers,
    getAllFiles,
    getSystemStats,
    updateUser,
    deleteUser,
    adminDeleteFile
};
