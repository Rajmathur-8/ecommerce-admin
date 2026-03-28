
import bcrypt from 'bcryptjs';
import AdminModel from '../../models/admin.js';

export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    // Find admin by email
    const admin = await AdminModel.findOne({ email });
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Check if OTP is expired
    if (!admin.otpExpires || admin.otpExpires < Date.now()) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    // Compare OTP (assuming it's hashed in DB)
    const isMatch = await bcrypt.compare(otp, admin.otp);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // OTP verified, clear OTP fields
    admin.otp = undefined;
    admin.otpExpires = undefined;
    await admin.save();

    // Success response
    res.status(200).json({ message: 'OTP verified successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
