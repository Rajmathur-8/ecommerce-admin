import Address from '../../models/address.js';
import mongoose from 'mongoose';

// Add new address
export const addAddress = async (req, res) => {
  try {
    console.log('=== ADD ADDRESS DEBUG ===');
    console.log('Request headers:', req.headers);
    console.log('Authorization header:', req.headers.authorization);
    console.log('Add address request body:', req.body);
    console.log('User from token:', req.user);
    console.log('User ID from token:', req.user?.id);
    console.log('User _id from token:', req.user?._id);
    console.log('All user properties:', req.user ? Object.keys(req.user) : 'No user object');
    console.log('User object type:', typeof req.user);
    console.log('User object stringified:', JSON.stringify(req.user, null, 2));
    
    // Check if req.user exists
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    
    // Check if user ID exists in the token or request body
    let userId = req.user?.id || req.user?._id;
    console.log('Extracted userId from token:', userId);
    console.log('userId type:', typeof userId);
    
    // Fallback to userId from request body if not in token
    if (!userId && req.body.userId) {
      userId = req.body.userId;
      console.log('Using userId from request body:', userId);
    }
    
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID not found in token or request body' });
    }
    
    // Validate that userId is a valid ObjectId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID format' });
    }
    
    // Convert string user ID to ObjectId
    const userObjectId = new mongoose.Types.ObjectId(userId);
    
    console.log('Using user ID:', userId);
    console.log('Converted to ObjectId:', userObjectId);
    console.log('Creating address with data:', { ...req.body, user: userObjectId });
    
    // Remove userId from request body to avoid storing it in the database
    const { userId: bodyUserId, ...addressFields } = req.body;
    const addressData = { ...addressFields, user: userObjectId };
    console.log('Final address data:', addressData);
    
    // Validate required fields
    const requiredFields = ['name', 'mobile', 'addressLine1', 'city', 'state', 'pincode', 'country'];
    const missingFields = requiredFields.filter(field => !addressData[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }
    
    const address = new Address(addressData);
    console.log('Address instance created:', address);
    console.log('Address user field:', address.user);
    console.log('Address user field type:', typeof address.user);
    
    if (req.body.isDefault) {
      await Address.updateMany({ user: userObjectId }, { isDefault: false });
    }
    await address.save();
    console.log('Address saved successfully:', address);
    res.status(201).json({ success: true, address });
  } catch (err) {
    console.log({
      name: err.name,
      message: err.message,
      code: err.code,
      errors: err.errors
    });
    
    // Provide more specific error messages
    if (err.name === 'ValidationError') {
      const validationErrors = Object.keys(err.errors).map(key => ({
        field: key,
        message: err.errors[key].message
      }));
      return res.status(400).json({ 
        success: false, 
        message: 'Validation failed', 
        errors: validationErrors 
      });
    }
    
    res.status(400).json({ success: false, message: err.message });
  }
};

// Get all addresses for user
export const getAddresses = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID not found in token' });
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const addresses = await Address.find({ user: userObjectId });
    res.json({ success: true, addresses });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Update address
export const updateAddress = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID not found in token' });
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const address = await Address.findOneAndUpdate(
      { _id: req.params.id, user: userObjectId },
      req.body,
      { new: true }
    );
    if (!address) return res.status(404).json({ success: false, message: 'Address not found' });
    res.json({ success: true, address });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Delete address
export const deleteAddress = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID not found in token' });
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const address = await Address.findOneAndDelete({ _id: req.params.id, user: userObjectId });
    if (!address) return res.status(404).json({ success: false, message: 'Address not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Set default address
export const setDefaultAddress = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID not found in token' });
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);
    await Address.updateMany({ user: userObjectId }, { isDefault: false });
    const address = await Address.findOneAndUpdate(
      { _id: req.params.id, user: userObjectId },
      { isDefault: true },
      { new: true }
    );
    if (!address) return res.status(404).json({ success: false, message: 'Address not found' });
    res.json({ success: true, address });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};