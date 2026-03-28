import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../../models/user.js';
import nodemailer from 'nodemailer';
import twilio from 'twilio';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper to send OTP email
async function sendOtpEmail(to, otp) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // Use TLS (true for port 465, false for 587)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS, // Use App Password for Gmail
    },
    tls: {
      rejectUnauthorized: false // Accept self-signed certificates
    }
  });
  
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Your OTP Code - E-Commerce',
    text: `Your OTP code is: ${otp}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Email Verification</h2>
        <p>Your OTP code is: <b style="font-size: 24px; color: #4F46E5;">${otp}</b></p>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this code, please ignore this email.</p>
      </div>
    `
  });
}

// Helper to send OTP SMS
async function sendOtpSms(to, otp) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await client.messages.create({
    body: `Your OTP code is: ${otp}`,
    from: process.env.TWILIO_FROM,
    to
  });
}

// Helper to send Reset Email
async function sendResetEmail(to, resetToken, identifier) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // Use TLS (true for port 465, false for 587)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS, // Use App Password for Gmail
    },
    tls: {
      rejectUnauthorized: false
    }
  });
  
  const resetLink = `${FRONTEND_URL}/auth/reset-password?identifier=${encodeURIComponent(identifier)}`;
  
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Password Reset Code - E-Commerce',
    text: `Your password reset code is: ${resetToken}\nReset your password using this link: ${resetLink}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Password Reset Request</h2>
        <p>Your password reset code is: <b style="font-size: 24px; color: #4F46E5;">${resetToken}</b></p>
        <p>Or click the button below to reset your password:</p>
        <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 10px 0;">Reset Password</a>
        <p>This code will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      </div>
    `
  });
}

// Helper to send Reset SMS
async function sendResetSms(to, resetToken, identifier) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const resetLink = `${FRONTEND_URL}/auth/reset-password?identifier=${encodeURIComponent(identifier)}`;
  await client.messages.create({
    body: `Your password reset code is: ${resetToken}. Reset link: ${resetLink}`,
    from: process.env.TWILIO_FROM,
    to
  });
}

export const register = async (req, res) => {
  try {
    const { identifier, referralCode } = req.body;
    
    // Validate input
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Email or phone is required.' });
    }

    // Handle referral code validation
    let referredBy = null;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
      if (referrer) {
        referredBy = referrer._id;
      } else {
        return res.status(400).json({ success: false, message: 'Invalid referral code.' });
      }
    }

    // Google Sign-in Flow
    if (identifier && typeof identifier === 'object' && identifier.firebaseUid) {
      if (!identifier.email) {
        return res.status(400).json({ success: false, message: 'Email is required for Google sign-in.' });
      }

      let user = await User.findOne({ email: identifier.email });

      if (user) {
        // Update existing user with firebaseUid if not present
        if (!user.firebaseUid) {
          user.firebaseUid = identifier.firebaseUid;
          await user.save();
        }
      } else {
        // Create new user for Google sign-in
        const userName = identifier.displayName || identifier.name || identifier.email.split('@')[0] || 'User';
        user = await User.create({
          email: identifier.email,
          name: userName,
          displayName: identifier.displayName || userName,
          firebaseUid: identifier.firebaseUid,
          isGuest: false,
          referredBy
        });
      }

      const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ success: true, data: { user, token } });
    }
    
    // Regular Email/Phone Registration Flow
    const isEmail = typeof identifier === 'string' && identifier.includes('@');
    const query = isEmail ? { email: identifier } : { phone: identifier };
    
    let user = await User.findOne(query);
    
    if (user && (user.email || user.phone)) {
      return res.status(400).json({ success: false, message: 'User already registered.' });
    }

    const otp = generateOtp();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 min
    
    if (!user) {
      // Create new user with OTP
      const userData = {
        otp,
        otpExpires,
        referredBy
      };
      
      if (isEmail) {
        userData.email = identifier;
      } else {
        userData.phone = identifier;
      }
      
      user = await User.create(userData);
    } else {
      // Update existing user with new OTP
      user.otp = otp;
      user.otpExpires = otpExpires;
      if (referralCode && !user.referredBy) {
        user.referredBy = referredBy;
      }
      await user.save();
    }
    
    // Send OTP
    try {
      if (isEmail) {
        // Check if email is configured
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
          console.log('⚠️  Email not configured. OTP:', otp);
          return res.json({ 
            success: true, 
            message: 'OTP sent successfully. [Check server console for OTP]',
            devMode: true,
            otp: process.env.NODE_ENV === 'development' ? otp : undefined
          });
        }
        await sendOtpEmail(identifier, otp);
      } else {
        await sendOtpSms(identifier, otp);
      }
      return res.json({ success: true, message: 'OTP sent successfully.' });
    } catch (err) {
      // In development, return OTP in console
      if (process.env.NODE_ENV === 'development') {
        console.log('⚠️  Email sending failed. OTP for testing:', otp);
        return res.json({ 
          success: true, 
          message: 'Email sending failed. Check console for OTP.',
          devMode: true,
          otp: otp
        });
      }
      return res.status(500).json({ 
        success: false, 
        message: `Failed to send OTP via ${isEmail ? 'email' : 'SMS'}`, 
        error: err.message 
      });
    }
  } catch (err) {
    return res.status(500).json({ 
      success: false, 
      message: 'Registration failed', 
      error: err.message 
    });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { identifier, otp } = req.body;
    
    // Input validation
    if (!identifier || !otp) {
      return res.status(400).json({ success: false, message: 'Identifier and OTP are required.' });
    }
    
    if (otp.length !== 6) {
      return res.status(400).json({ success: false, message: 'OTP must be 6 digits.' });
    }
    
    const isEmail = identifier.includes('@');
    const query = isEmail ? { email: identifier } : { phone: identifier };
    
    const user = await User.findOne(query);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    
    if (!user.otp || !user.otpExpires) {
      return res.status(400).json({ success: false, message: 'No OTP found. Please request a new one.' });
    }
    
    if (user.otpExpires < Date.now()) {
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }
    
    if (user.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
    }
    
    // OTP verified, clear OTP fields
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();
    
    return res.json({ 
      success: true, 
      message: 'OTP verified successfully.' 
    });
  } catch (err) {
    return res.status(500).json({ 
      success: false, 
      message: 'OTP verification failed', 
      error: err.message 
    });
  }
};

export const setPassword = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    
    // Input validation
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Identifier and password are required.' });
    }
    
    // Password strength validation
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters long.' 
      });
    }
    
    const isEmail = identifier.includes('@');
    const query = isEmail ? { email: identifier } : { phone: identifier };
    
    const user = await User.findOne(query);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    
    // Hash password with bcrypt (10 rounds is industry standard)
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.isGuest = false; // User is no longer a guest after setting password
    await user.save();
    
    // Auto-login after password set
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    
    return res.json({ 
      success: true, 
      message: 'Password set successfully. You are now logged in.', 
      data: { user, token } 
    });
  } catch (err) {
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to set password', 
      error: err.message 
    });
  }
};

export const createGuest = async (req, res) => {
  try {
    // Generate a unique guest email
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 10);
    const email = `guest_${timestamp}_${randomStr}@guest.com`;
    const displayName = `Guest_${Date.now()}`;
    
    // Create guest user - schema is now properly configured to handle guests
    const user = await User.create({
      email,
      displayName,
      isGuest: true
    });
    
    // Generate JWT token
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    
    return res.json({ 
      success: true, 
      data: { user, token },
      message: 'Guest account created successfully'
    });
  } catch (err) {
    
    // Handle duplicate email (extremely rare but possible)
    if (err.code === 11000 && err.keyPattern && err.keyPattern.email) {
      return res.status(500).json({ 
        success: false, 
        message: 'Guest creation failed. Please try again.',
        error: 'Duplicate email generated'
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: 'Guest creation failed', 
      error: err.message 
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password, firebaseUid } = req.body;

    // Google Login Flow
    if (firebaseUid) {
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required for Google login.' });
      }
      
      // Try to find user by firebaseUid first, then by email
      let user = await User.findOne({ firebaseUid }) || await User.findOne({ email });
      
      if (!user) {
        // Create new user for Google login
        const { name, displayName } = req.body;
        const userName = name || displayName || email.split('@')[0] || 'User';
        
        user = await User.create({ 
          email, 
          name: userName,
          displayName: displayName || userName,
          firebaseUid,
          isGuest: false,
          lastLogin: new Date()
        });
      } else {
        // Update existing user with firebaseUid if not present
        if (!user.firebaseUid) {
          user.firebaseUid = firebaseUid;
        }
        // Update name and displayName if not present
        if (!user.name || !user.displayName) {
          const { name, displayName } = req.body;
          if (name || displayName) {
            user.name = user.name || name || displayName;
            user.displayName = user.displayName || displayName || name;
          }
        }
        // Update lastLogin
        user.lastLogin = new Date();
        await user.save();
      }
      
      const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ success: true, data: { user, token }, message: 'Login successful' });
    }

    // Normal Login (email/password)
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    // Find user by email
    const user = await User.findOne({ email, isGuest: false });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Check if password is set
    if (!user.password) {
      return res.status(400).json({ 
        success: false, 
        message: 'No password set for this user. Please use Google sign-in or reset your password.' 
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Update lastLogin
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    
    return res.json({ 
      success: true, 
      data: { user, token },
      message: 'Login successful'
    });
  } catch (err) {
    return res.status(500).json({ 
      success: false, 
      message: 'Login failed', 
      error: err.message 
    });
  }
}; 

export const forgotPassword = async (req, res) => {
  try {
    const { identifier } = req.body;
    
    // Input validation
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Email or phone is required.' });
    }
    
    const isEmail = identifier.includes('@');
    const user = await User.findOne(isEmail ? { email: identifier } : { phone: identifier });
    
    if (!user) {
      // For security, don't reveal if user exists or not
      return res.json({ 
        success: true, 
        message: 'If the account exists, you will receive a password reset code.' 
      });
    }
    
    // Generate reset token
    const resetToken = Math.random().toString(36).substr(2, 8).toUpperCase();
    user.resetToken = resetToken;
    user.resetTokenExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    try {
      if (isEmail) {
        await sendResetEmail(user.email, resetToken, identifier);
      } else {
        await sendResetSms(user.phone, resetToken, identifier);
      }
      
      return res.json({ 
        success: true, 
        message: `Reset code sent to your ${isEmail ? 'email' : 'phone'}.` 
      });
    } catch (err) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to send reset code. Please try again.', 
        error: err.message 
      });
    }
  } catch (err) {
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to process password reset request', 
      error: err.message 
    });
  }
}; 

export const resetPassword = async (req, res) => {
  try {
    const { identifier, resetToken, newPassword } = req.body;
    
    // Input validation
    if (!identifier || !resetToken || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email/phone, reset code, and new password are required.' 
      });
    }
    
    // Password strength validation
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters long.' 
      });
    }
    
    const isEmail = identifier.includes('@');
    const query = isEmail ? { email: identifier } : { phone: identifier };
    
    const user = await User.findOne(query);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    
    if (!user.resetToken || !user.resetTokenExpires) {
      return res.status(400).json({ 
        success: false, 
        message: 'No reset code found. Please request a new one.' 
      });
    }
    
    if (user.resetTokenExpires < Date.now()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Reset code has expired. Please request a new one.' 
      });
    }
    
    if (user.resetToken.toUpperCase() !== resetToken.toUpperCase()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid reset code.' 
      });
    }
    
    // Hash and save new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    await user.save();
    
    return res.json({ 
      success: true, 
      message: 'Password reset successful. You can now login with your new password.' 
    });
  } catch (err) {
    return res.status(500).json({ 
      success: false, 
      message: 'Password reset failed', 
      error: err.message 
    });
  }
}; 

// Get current user profile
export const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select('-password -otp -otpExpires -resetToken -resetTokenExpires');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch profile', error: err.message });
  }
};

// Update current user profile
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone } = req.body;
    
    // Build update object with only provided fields
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;

    // Use updateOne to avoid validation issues with required fields
    await User.updateOne({ _id: userId }, { $set: updateData });
    
    // Get updated user
    const user = await User.findById(userId).select('-password -otp -otpExpires -resetToken -resetTokenExpires');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update profile', error: err.message });
  }
}; 

// Delete current user profile
export const deleteProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, message: 'Profile deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete profile', error: err.message });
  }
};

// Send OTP for phone verification
export const sendPhoneOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    
    // Debug: Log the received request body
    console.log('sendPhoneOtp - Request body:', req.body);
    console.log('sendPhoneOtp - Phone extracted:', phone);
    
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    // Generate OTP
    const otp = generateOtp();
    
    // For phone verification during profile update, we need to find the current user
    // and store OTP in their record, regardless of which phone number they're updating to
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Debug: Log user data to see what's missing
    console.log('User data:', {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      referralCode: user.referralCode
    });

    // Store OTP in current user's record
    // Use updateOne to avoid validation issues with required fields
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          otp: otp,
          otpExpires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
          otpPhone: phone // Store the phone number being verified
        }
      }
    );

    // Send OTP via SMS
    try {
      await sendOtpSms(phone, otp);
      res.json({ success: true, message: 'OTP sent successfully' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to send OTP', error: err.message });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to send OTP', error: err.message });
  }
};

// Verify OTP for phone verification
export const verifyPhoneOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    
    // Debug: Log the received request body
    console.log('verifyPhoneOtp - Request body:', req.body);
    console.log('verifyPhoneOtp - Phone:', phone, 'OTP:', otp);
    
    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone number and OTP are required' });
    }

    // Find current user by ID (from authentication)
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Debug: Log user OTP data
    console.log('verifyPhoneOtp - User OTP data:', {
      userOtp: user.otp,
      userOtpExpires: user.otpExpires,
      userOtpPhone: user.otpPhone,
      currentTime: new Date(),
      isExpired: user.otpExpires < new Date()
    });

    // Check if OTP exists and is not expired
    if (!user.otp || !user.otpExpires || user.otpExpires < new Date()) {
      return res.status(400).json({ success: false, message: 'OTP expired or not found' });
    }

    // Verify OTP and phone number match
    console.log('verifyPhoneOtp - Comparing:', {
      receivedOtp: otp,
      storedOtp: user.otp,
      receivedPhone: phone,
      storedPhone: user.otpPhone,
      otpMatch: user.otp === otp,
      phoneMatch: user.otpPhone === phone
    });

    if (user.otp !== otp || user.otpPhone !== phone) {
      return res.status(400).json({ success: false, message: 'Invalid OTP or phone number' });
    }

    // Clear OTP after successful verification
    await User.updateOne(
      { _id: userId },
      {
        $unset: {
          otp: "",
          otpExpires: "",
          otpPhone: ""
        }
      }
    );

    res.json({ success: true, message: 'OTP verified successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to verify OTP', error: err.message });
  }
}; 