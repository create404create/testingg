const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔗 Supabase initialized:', !!supabaseUrl);

// Admin password
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Multer for file upload
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ==================== ROUTES ====================

// Health check
app.get('/health', async (req, res) => {
    try {
        const { error } = await supabase.from('uploaded_files').select('count', { count: 'exact', head: true });
        
        res.json({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            supabase: !error,
            database: error ? error.message : 'connected',
            admin: !!ADMIN_PASSWORD
        });
    } catch (err) {
        res.json({ 
            status: 'warning', 
            timestamp: new Date().toISOString(),
            supabase: false,
            database: err.message,
            admin: !!ADMIN_PASSWORD
        });
    }
});

// Upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded', success: false });
        }

        const file = req.file;
        const fileName = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        
        console.log(`📤 Uploading: ${file.originalname} (${file.size} bytes)`);

        // 1. Upload to storage
        const { error: storageError } = await supabase.storage
            .from('phone-files')
            .upload(`uploads/${fileName}`, file.buffer, {
                contentType: file.mimetype,
                cacheControl: '3600'
            });

        if (storageError) {
            console.error('❌ Storage error:', storageError);
            return res.status(500).json({ 
                success: false, 
                error: 'Storage upload failed',
                message: storageError.message 
            });
        }

        // 2. Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('phone-files')
            .getPublicUrl(`uploads/${fileName}`);

        // 3. Save to database
        let dbSuccess = false;
        let fileId = null;
        
        try {
            const { data, error: dbError } = await supabase
                .from('uploaded_files')
                .insert({
                    filename: file.originalname,
                    file_url: publicUrl,
                    file_size: file.size,
                    user_ip: req.ip,
                    results_summary: req.body.results ? JSON.parse(req.body.results) : {}
                })
                .select();

            if (!dbError && data && data.length > 0) {
                dbSuccess = true;
                fileId = data[0].id;
            }
        } catch (dbErr) {
            console.log('⚠️ Database save skipped:', dbErr.message);
        }

        // SUCCESS
        res.json({
            success: true,
            message: 'File uploaded successfully',
            fileId: fileId,
            fileName: file.originalname,
            fileUrl: publicUrl,
            storedInDatabase: dbSuccess,
            storedInStorage: true,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Upload failed',
            message: error.message 
        });
    }
});

// ==================== ADMIN ROUTES ====================

// Admin login
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    
    if (password === ADMIN_PASSWORD) {
        res.json({ 
            success: true, 
            token: 'admin-token-' + Date.now(),
            message: 'Login successful',
            expiresIn: '24h'
        });
    } else {
        res.status(401).json({ 
            success: false, 
            error: 'Invalid password' 
        });
    }
});

// Get all uploaded files
app.get('/api/admin/files', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('uploaded_files')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Database error:', error);
            return res.json({ 
                success: true, 
                files: [], 
                message: 'Database not available, using storage only' 
            });
        }
        
        res.json({ 
            success: true, 
            files: data || [],
            count: data ? data.length : 0
        });
    } catch (error) {
        console.error('Files error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get file by ID
app.get('/api/admin/files/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('uploaded_files')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        
        res.json({ 
            success: true, 
            file: data 
        });
    } catch (error) {
        res.status(404).json({ 
            success: false, 
            error: 'File not found' 
        });
    }
});

// Get statistics
app.get('/api/admin/stats', async (req, res) => {
    try {
        // Get total files count
        const { count, error: countError } = await supabase
            .from('uploaded_files')
            .select('*', { count: 'exact', head: true });

        let totalFiles = 0;
        let totalSize = 0;
        
        if (!countError) {
            totalFiles = count || 0;
            
            // Get all files to calculate total size
            const { data: files } = await supabase
                .from('uploaded_files')
                .select('file_size');
                
            if (files) {
                totalSize = files.reduce((sum, file) => sum + (file.file_size || 0), 0);
            }
        }

        res.json({
            success: true,
            totalFiles: totalFiles,
            totalStorage: totalSize,
            storageMB: (totalSize / 1024 / 1024).toFixed(2),
            averageFileSize: totalFiles > 0 ? (totalSize / totalFiles / 1024).toFixed(2) : 0,
            serverTime: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health: ${BACKEND_URL}/health`);
    console.log(`📁 Upload: POST ${BACKEND_URL}/api/upload`);
    console.log(`🔐 Admin: POST ${BACKEND_URL}/api/admin/login`);
    console.log(`📋 Files: GET ${BACKEND_URL}/api/admin/files`);
});
