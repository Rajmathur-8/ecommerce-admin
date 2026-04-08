import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const username = process.env.MONGO_USER;
const password = process.env.MONGO_PASSWORD;
const clusterName = process.env.MONGO_CLUSTER_NAME;

const connection_string = `mongodb+srv://${username}:${password}@${clusterName}.2kldzpk.mongodb.net/ecommerce?retryWrites=true&w=majority&appName=ClusterGD`;

// Schemas
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  image: String,
  description: String,
  status: { type: String, default: 'Active' },
}, { timestamps: true });

const productSchema = new mongoose.Schema({
  sku: String,
  productName: String,
  category: mongoose.Schema.Types.ObjectId,
  // other fields...
}, { timestamps: true });

const Category = mongoose.model('Category', categorySchema);
const Product = mongoose.model('Product', productSchema);

const consolidateCategories = async () => {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(connection_string, { family: 4 });
    console.log('✅ Connected to MongoDB\n');

    // Find both Mobile and Mobiles categories
    const mobileCategory = await Category.findOne({ name: 'Mobile' });
    const mobilesCategory = await Category.findOne({ name: 'Mobiles' });

    if (!mobileCategory || !mobilesCategory) {
      console.log('⚠️  One or both categories not found');
      if (!mobileCategory) console.log('   - "Mobile" not found');
      if (!mobilesCategory) console.log('   - "Mobiles" not found');
      process.exit(0);
    }

    console.log(`📂 Found categories:`);
    console.log(`   - Mobile: ${mobileCategory._id}`);
    console.log(`   - Mobiles: ${mobilesCategory._id}\n`);

    // Count products in each
    const mobileCount = await Product.countDocuments({ category: mobileCategory._id });
    const mobilesCount = await Product.countDocuments({ category: mobilesCategory._id });

    console.log(`📦 Product counts:`);
    console.log(`   - Mobile: ${mobileCount} products`);
    console.log(`   - Mobiles: ${mobilesCount} products\n`);

    // Keep "Mobiles" as main category, update "Mobile" products to use it
    const result = await Product.updateMany(
      { category: mobileCategory._id },
      { category: mobilesCategory._id }
    );

    console.log(`✅ Updated ${result.modifiedCount} products from "Mobile" → "Mobiles"\n`);

    // Delete the "Mobile" category
    await Category.deleteOne({ _id: mobileCategory._id });
    console.log(`🗑️  Deleted "Mobile" category\n`);

    // Verify
    const finalMobilesCount = await Product.countDocuments({ category: mobilesCategory._id });
    console.log(`✅ Final "Mobiles" category: ${finalMobilesCount} products\n`);

    console.log(`✨ Consolidation completed successfully!`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

consolidateCategories();
