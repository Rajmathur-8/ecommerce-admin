import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const username = process.env.MONGO_USER;
const password = process.env.MONGO_PASSWORD;
const clusterName = process.env.MONGO_CLUSTER_NAME;

const connection_string = `mongodb+srv://${username}:${password}@${clusterName}.2kldzpk.mongodb.net/ecommerce?retryWrites=true&w=majority&appName=ClusterGD`;

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
}, { timestamps: true });

const Category = mongoose.model('Category', categorySchema);
const Product = mongoose.model('Product', productSchema);

const verifyCategoryConsolidation = async () => {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(connection_string, { family: 4 });
    console.log('✅ Connected to MongoDB\n');

    console.log('📂 Current categories in database:');
    const categories = await Category.find({}, { _id: 1, name: 1 });
    
    for (const cat of categories) {
      const productCount = await Product.countDocuments({ category: cat._id });
      console.log(`   ✓ ${cat.name}: ${productCount} products`);
    }

    console.log('\n✨ Verification complete!');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

verifyCategoryConsolidation();
