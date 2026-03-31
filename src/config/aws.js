import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import multer from 'multer';
import multerS3 from 'multer-s3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import dotenv from 'dotenv';


dotenv.config();

// Configure AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Configure multer-s3 storage
const storage = multerS3({
  s3: s3Client,
  bucket: process.env.AWS_BUCKET_NAME,
  metadata: (req, file, cb) => {
    cb(null, { 
      fieldName: file.fieldname,
      uploadedBy: req.user?.id || 'unknown',
      uploadedAt: new Date().toISOString()
    });
  },
  key: (req, file, cb) => {
    // Generate unique filename
    const uniqueId = uuidv4();
    const extension = path.extname(file.originalname);
    const basename = path.basename(file.originalname, extension).replace(/[^a-zA-Z0-9]/g, '-');
    const folder = 'approvals';
    
    // Determine subfolder based on file type
    let subfolder = 'others';
    if (file.mimetype.startsWith('image/')) subfolder = 'images';
    else if (file.mimetype.startsWith('video/')) subfolder = 'videos';
    else if (file.mimetype === 'application/pdf') subfolder = 'documents';
    
    const key = `${folder}/${subfolder}/${basename}-${uniqueId}${extension}`;
    cb(null, key);
  },
  contentType: multerS3.AUTO_CONTENT_TYPE,
});

// Create multer upload middleware
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
      'application/pdf'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
  },
});

// Helper function to determine category from mimetype
export const getFileCategory = (mimetype) => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype === 'application/pdf') return 'document';
  return 'other';
};

// Helper function to delete file from S3

export const deleteFromS3 = async (key) => {
  try {
    if (!key) return;
    
    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    });
    
    await s3Client.send(command);
    console.log(`✅ Deleted file from S3: ${key}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error deleting from S3:', error);
    throw error;
  }
};

// Helper function to generate a signed URL for private files (optional)
export const generateSignedUrl = async (key, expiresIn = 3600) => {
  try {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    });
    
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    return signedUrl;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    throw error;
  }
};

export { s3Client };