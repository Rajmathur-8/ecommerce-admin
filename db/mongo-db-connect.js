import mongoose from "mongoose";
import dotenv from 'dotenv';
import { createAdmin } from "../seedData/createAdmin.js";

dotenv.config();

const username = process.env.MONGO_USER;
const password = process.env.MONGO_PASSWORD;
const clusterName = process.env.MONGO_CLUSTER_NAME;

const connection_string = `mongodb+srv://${username}:${password}@${clusterName}.2kldzpk.mongodb.net/ecommerce?retryWrites=true&w=majority&appName=ClusterGD`;
// const connection_string =`mongodb+srv://${username}:${password}@${clusterName}.pcrymzz.mongodb.net/ecommerce?retryWrites=true&w=majority&appName=ecommerce`;
export const connectDB = async () => {
  try {
  
    await mongoose.connect(connection_string, {
      family: 4,
    }).then(async ()=>{  
      await createAdmin();
      
      // TEMPORARY FIX: Drop old phone index and recreate as sparse
      // Remove this block after guest login works successfully
      try {
        const User = mongoose.model('User');
        await User.collection.dropIndex('phone_1').catch(() => {});
        await User.collection.createIndex(
          { phone: 1 }, 
          { unique: true, sparse: true }
        );
        console.log('✅ Phone index fixed - guest login should now work');
      } catch (indexErr) {
        console.log('Index fix skipped (already correct):', indexErr.message);
      }
      
      console.log('Connection successfull')}
    );
  } catch (error) {
    throw error;
  }
};