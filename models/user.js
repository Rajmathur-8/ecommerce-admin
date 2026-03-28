import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    unique: true,
    sparse: true, // Allow multiple null/undefined values, required only when provided
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    // Password is optional - not required for Google/Guest sign-in
    // Password will be set later via setPassword endpoint for regular email/phone registration
  },
  phone: {
    type: String,
    // Phone is optional - not required for Google/Guest sign-in
    unique: true,
    sparse: true // Allow multiple null values
  },
  firebaseUid: {
    type: String,
    unique: true,
    sparse: true // Allow multiple null values
  },
  // Referral system fields
  referralCode: {
    type: String,
    unique: true,
    required: false
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  referralCodeUsed: {
    type: Boolean,
    default: false
  },
  displayName: { type: String },
  isGuest: { type: Boolean, default: false },
  lastLogin: { type: Date, default: null },
  otp: { type: String },
  otpExpires: { type: Date },
  otpPhone: { type: String }, // Store the phone number being verified
  resetToken: { type: String },
  resetTokenExpires: { type: Date },
}, {
  timestamps: true // This automatically adds createdAt and updatedAt
});

// Generate unique referral code before saving
userSchema.pre('save', async function(next) {
  if (this.isNew && !this.referralCode) {
    this.referralCode = await generateUniqueReferralCode();
  }
  
  // DO NOT hash password here - it's already hashed in the controller
  // This prevents double hashing which would make login fail
  next();
});

// Generate unique referral code
async function generateUniqueReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let isUnique = false;
  
  while (!isUnique) {
    code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Check if code already exists
    const existingUser = await mongoose.model('User').findOne({ referralCode: code });
    if (!existingUser) {
      isUnique = true;
    }
  }
  
  return code;
}

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
