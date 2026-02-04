const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
    filename: {
        type: String,
        required: true
    },
    originalName: {
        type: String,
        required: true
    },
    fileType: {
        type: String,
        required: true
    },
    fileSize: {
        type: Number,
        required: true
    },
    filePath: {
        type: String,
        required: true
    },
    downloadCount: {
        type: Number,
        default: 0
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userEmail: {
        type: String,
        required: true
    },
    userName: {
        type: String,
        required: true
    },
    ipAddress: {
        type: String
    },
    isPublic: {
        type: Boolean,
        default: false
    },
    description: {
        type: String,
        maxlength: [500, 'Description cannot be more than 500 characters']
    },
    tags: [{
        type: String
    }],
    uploadedAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date
    },
    deleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Index for faster queries
fileSchema.index({ userId: 1, uploadedAt: -1 });
fileSchema.index({ userEmail: 1 });
fileSchema.index({ tags: 1 });
fileSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for file URL
fileSchema.virtual('url').get(function() {
    return `/uploads/${this.userId}/${this.filename}`;
});

// Virtual for formatted file size
fileSchema.virtual('formattedSize').get(function() {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (this.fileSize === 0) return '0 Byte';
    const i = parseInt(Math.floor(Math.log(this.fileSize) / Math.log(1024)));
    return Math.round(this.fileSize / Math.pow(1024, i), 2) + ' ' + sizes[i];
});

const File = mongoose.model('File', fileSchema);

module.exports = File;
