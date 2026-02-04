const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    token: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['password-reset', 'email-verification'],
        required: true
    },
    expiresAt: {
        type: Date,
        required: true,
        default: Date.now,
        expires: 3600 // 1 hour
    },
    used: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Token = mongoose.model('Token', tokenSchema);

module.exports = Token;
