const File = require('../models/File');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');

// @desc    Upload file
// @route   POST /api/files/upload
// @access  Private
const uploadFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        // Get file info
        const { originalname, mimetype, size, filename } = req.file;
        const filePath = req.file.path;

        // Create file record
        const file = await File.create({
            filename: filename,
            originalName: originalname,
            fileType: mimetype,
            fileSize: size,
            filePath: filePath,
            userId: req.user.id,
            userEmail: req.user.email,
            userName: req.user.name,
            ipAddress: req.ip
        });

        // Update user statistics
        await User.findByIdAndUpdate(req.user.id, {
            $inc: {
                fileCount: 1,
                storageUsed: size
            }
        });

        res.status(201).json({
            success: true,
            message: 'File uploaded successfully',
            file: {
                id: file._id,
                name: file.originalName,
                size: file.fileSize,
                type: file.fileType,
                uploadedAt: file.uploadedAt,
                url: `/api/files/download/${file._id}`
            }
        });
    } catch (error) {
        console.error('Upload file error:', error);
        
        // Delete uploaded file if error occurred
        if (req.file && req.file.path) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'File upload failed',
            error: error.message
        });
    }
};

// @desc    Upload multiple files
// @route   POST /api/files/upload-multiple
// @access  Private
const uploadMultipleFiles = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files uploaded'
            });
        }

        const uploadedFiles = [];
        let totalSize = 0;

        // Process each file
        for (const file of req.files) {
            const fileRecord = await File.create({
                filename: file.filename,
                originalName: file.originalname,
                fileType: file.mimetype,
                fileSize: file.size,
                filePath: file.path,
                userId: req.user.id,
                userEmail: req.user.email,
                userName: req.user.name,
                ipAddress: req.ip
            });

            uploadedFiles.push({
                id: fileRecord._id,
                name: fileRecord.originalName,
                size: fileRecord.fileSize,
                type: fileRecord.fileType,
                uploadedAt: fileRecord.uploadedAt
            });

            totalSize += file.size;
        }

        // Update user statistics
        await User.findByIdAndUpdate(req.user.id, {
            $inc: {
                fileCount: req.files.length,
                storageUsed: totalSize
            }
        });

        res.status(201).json({
            success: true,
            message: `${req.files.length} file(s) uploaded successfully`,
            files: uploadedFiles,
            totalSize: totalSize
        });
    } catch (error) {
        console.error('Upload multiple files error:', error);
        
        // Clean up uploaded files on error
        if (req.files) {
            req.files.forEach(file => {
                if (file.path) {
                    fs.unlink(file.path, (err) => {
                        if (err) console.error('Error deleting file:', err);
                    });
                }
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'File upload failed',
            error: error.message
        });
    }
};

// @desc    Get all user files
// @route   GET /api/files
// @access  Private
const getUserFiles = async (req, res) => {
    try {
        const { page = 1, limit = 10, sort = '-uploadedAt', search = '' } = req.query;
        
        const query = {
            userId: req.user.id,
            deleted: false
        };

        // Search functionality
        if (search) {
            query.$or = [
                { originalName: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { tags: { $regex: search, $options: 'i' } }
            ];
        }

        // Execute query with pagination
        const files = await File.find(query)
            .sort(sort)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .select('-filePath -__v');

        // Get total count
        const total = await File.countDocuments(query);

        // Get user stats
        const user = await User.findById(req.user.id);

        res.status(200).json({
            success: true,
            count: files.length,
            total,
            pages: Math.ceil(total / limit),
            currentPage: page,
            stats: {
                totalFiles: user.fileCount,
                storageUsed: user.storageUsed,
                lastLogin: user.lastLogin
            },
            files: files.map(file => ({
                id: file._id,
                name: file.originalName,
                filename: file.filename,
                type: file.fileType,
                size: file.fileSize,
                formattedSize: file.formattedSize,
                uploadedAt: file.uploadedAt,
                downloadCount: file.downloadCount,
                description: file.description,
                tags: file.tags,
                url: `/api/files/download/${file._id}`
            }))
        });
    } catch (error) {
        console.error('Get user files error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// @desc    Get single file
// @route   GET /api/files/:id
// @access  Private
const getFile = async (req, res) => {
    try {
        const file = await File.findOne({
            _id: req.params.id,
            userId: req.user.id,
            deleted: false
        });

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        res.status(200).json({
            success: true,
            file: {
                id: file._id,
                name: file.originalName,
                filename: file.filename,
                type: file.fileType,
                size: file.fileSize,
                formattedSize: file.formattedSize,
                uploadedAt: file.uploadedAt,
                downloadCount: file.downloadCount,
                description: file.description,
                tags: file.tags,
                ipAddress: file.ipAddress,
                url: `/api/files/download/${file._id}`
            }
        });
    } catch (error) {
        console.error('Get file error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// @desc    Download file
// @route   GET /api/files/download/:id
// @access  Private
const downloadFile = async (req, res) => {
    try {
        const file = await File.findOne({
            _id: req.params.id,
            userId: req.user.id,
            deleted: false
        });

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Check if file exists on disk
        if (!fs.existsSync(file.filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found on server'
            });
        }

        // Increment download count
        file.downloadCount += 1;
        await file.save();

        // Set headers for download
        res.setHeader('Content-Type', file.fileType);
        res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
        res.setHeader('Content-Length', file.fileSize);

        // Stream file
        const fileStream = fs.createReadStream(file.filePath);
        fileStream.pipe(res);
    } catch (error) {
        console.error('Download file error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// @desc    Update file metadata
// @route   PUT /api/files/:id
// @access  Private
const updateFile = async (req, res) => {
    try {
        const { description, tags, isPublic } = req.body;
        
        const file = await File.findOneAndUpdate(
            {
                _id: req.params.id,
                userId: req.user.id,
                deleted: false
            },
            {
                description,
                tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
                isPublic
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'File updated successfully',
            file: {
                id: file._id,
                name: file.originalName,
                description: file.description,
                tags: file.tags,
                isPublic: file.isPublic
            }
        });
    } catch (error) {
        console.error('Update file error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// @desc    Delete file
// @route   DELETE /api/files/:id
// @access  Private
const deleteFile = async (req, res) => {
    try {
        const file = await File.findOne({
            _id: req.params.id,
            userId: req.user.id,
            deleted: false
        });

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Soft delete (mark as deleted)
        file.deleted = true;
        await file.save();

        // Update user statistics
        await User.findByIdAndUpdate(req.user.id, {
            $inc: {
                fileCount: -1,
                storageUsed: -file.fileSize
            }
        });

        // Optional: Actually delete file from disk after 30 days
        // For now, just mark as deleted

        res.status(200).json({
            success: true,
            message: 'File deleted successfully'
        });
    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// @desc    Get user statistics
// @route   GET /api/files/stats
// @access  Private
const getUserStats = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get file type distribution
        const fileTypes = await File.aggregate([
            {
                $match: {
                    userId: req.user.id,
                    deleted: false
                }
            },
            {
                $group: {
                    _id: '$fileType',
                    count: { $sum: 1 },
                    totalSize: { $sum: '$fileSize' }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);

        // Get recent uploads
        const recentFiles = await File.find({
            userId: req.user.id,
            deleted: false
        })
        .sort({ uploadedAt: -1 })
        .limit(5)
        .select('originalName fileType fileSize uploadedAt');

        res.status(200).json({
            success: true,
            stats: {
                totalFiles: user.fileCount,
                storageUsed: user.storageUsed,
                formattedStorageUsed: formatBytes(user.storageUsed),
                lastLogin: user.lastLogin,
                accountCreated: user.createdAt
            },
            fileTypes,
            recentFiles: recentFiles.map(file => ({
                name: file.originalName,
                type: file.fileType,
                size: formatBytes(file.fileSize),
                uploadedAt: file.uploadedAt
            }))
        });
    } catch (error) {
        console.error('Get user stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// @desc    Clean up old files (Admin only)
// @route   POST /api/files/cleanup
// @access  Private/Admin
const cleanupFiles = async (req, res) => {
    try {
        // Find files marked as deleted more than 30 days ago
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const oldDeletedFiles = await File.find({
            deleted: true,
            updatedAt: { $lt: thirtyDaysAgo }
        });

        let deletedCount = 0;
        let freedSpace = 0;

        // Actually delete files from disk and database
        for (const file of oldDeletedFiles) {
            // Delete from disk
            if (fs.existsSync(file.filePath)) {
                fs.unlinkSync(file.filePath);
            }
            
            // Delete from database
            await File.findByIdAndDelete(file._id);
            
            deletedCount++;
            freedSpace += file.fileSize;
        }

        res.status(200).json({
            success: true,
            message: `Cleaned up ${deletedCount} old files`,
            deletedCount,
            freedSpace: formatBytes(freedSpace)
        });
    } catch (error) {
        console.error('Cleanup files error:', error);
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
    uploadFile,
    uploadMultipleFiles,
    getUserFiles,
    getFile,
    downloadFile,
    updateFile,
    deleteFile,
    getUserStats,
    cleanupFiles
};
