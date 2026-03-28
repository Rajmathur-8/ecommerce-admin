import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const secretKey = process.env.JWT_SECRET || 'secret';
console.log('JWT_SECRET from environment:', secretKey ? 'Secret key exists' : 'No secret key found');

const verifyToken = (req, res, next) => {
  console.log('=== AUTH MIDDLEWARE DEBUG ===');
  console.log('Request headers:', req.headers);
  console.log('Authorization header:', req.headers.authorization);
  
  const token = req.headers['authorization']?.split(' ')[1];
  console.log('Extracted token:', token ? token.substring(0, 20) + '...' : 'No token');

  if (!token) {
    console.log('No token provided');
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    console.log('Verifying token with secret key:', secretKey ? 'Secret key exists' : 'No secret key');
    const decoded = jwt.verify(token, secretKey);
    console.log('Decoded token:', decoded);
    console.log('Decoded token type:', typeof decoded);
    console.log('Decoded token keys:', Object.keys(decoded));
    req.user = decoded;
    console.log('Set req.user to:', req.user);
    next();
  } 
  catch (error) {
    return res.status(401).json({ message: 'Invalid token or expired token' });
  }
};


export default verifyToken;