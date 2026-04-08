import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const username = process.env.MONGO_USER;
const password = process.env.MONGO_PASSWORD;
const clusterName = process.env.MONGO_CLUSTER_NAME;

const connection_string = `mongodb+srv://${username}:${password}@${clusterName}.2kldzpk.mongodb.net/ecommerce?retryWrites=true&w=majority&appName=ClusterGD`;

async function fixCategories() {
  try {
    await mongoose.connect(connection_string, { family: 4 });
    console.log('✅ Connected to MongoDB');
    
    const db = mongoose.connection;
    
    // Find both Mobile and Mobiles categories
    const mobileCategory = await db.collection('categories').findOne({ name: 'Mobile' });
    const mobilesCategory = await db.collection('categories').findOne({ name: 'Mobiles' });
    
    if (!mobileCategory || !mobilesCategory) {
      console.log('❌ Could not find Mobile or Mobiles categories');
      return;
    }
    
    console.log(`📂 Found categories:`);
    console.log(`  - Mobile (ID: ${mobileCategory._id})`);
    console.log(`  - Mobiles (ID: ${mobilesCategory._id})`);
    
    // Move any products from Mobile to Mobiles
    const productsToMove = await db.collection('products').find({ category: mobileCategory._id }).toArray();
    console.log(`\n📦 Products in Mobile category: ${productsToMove.length}`);
    
    if (productsToMove.length > 0) {
      const result = await db.collection('products').updateMany(
        { category: mobileCategory._id },
        { $set: { category: mobilesCategory._id } }
      );
      console.log(`✅ Moved ${result.modifiedCount} products from Mobile to Mobiles`);
    }
    
    // Delete the Mobile category
    const deleteResult = await db.collection('categories').deleteOne({ _id: mobileCategory._id });
    if (deleteResult.deletedCount === 1) {
      console.log(`\n✅ Deleted "Mobile" category`);
    }
    
    // Verify final state
    console.log(`\n✅ Final state:`);
    const finalMobiles = await db.collection('products').countDocuments({ category: mobilesCategory._id });
    console.log(`  - Mobiles category: ${finalMobiles} products`);
    
    const finalCategories = await db.collection('categories').find({}).toArray();
    console.log(`  - Total categories: ${finalCategories.length}`);
    
    console.log(`\n🎉 Fix completed successfully!`);
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

fixCategories();
