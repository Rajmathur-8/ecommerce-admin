import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const username = process.env.MONGO_USER;
const password = process.env.MONGO_PASSWORD;
const clusterName = process.env.MONGO_CLUSTER_NAME;

const connection_string = `mongodb+srv://${username}:${password}@${clusterName}.2kldzpk.mongodb.net/ecommerce?retryWrites=true&w=majority&appName=ClusterGD`;

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  image: { type: String },
  description: { type: String },
  status: { type: String, default: 'Active' },
}, { timestamps: true });

const Category = mongoose.model('Category', categorySchema);

const newCategories = [
  {
    name: 'Home & Kitchen',
    image: 'https://numalis.com/wp-content/uploads/2023/10/Maxx-Studio-Shutterstock.jpg',
    description: 'Home & Kitchen appliances and accessories',
    status: 'Active',
  },
  {
    name: 'Wearables',
    image: 'https://careevolution.com/wp-content/uploads/2023/09/Sense2c.png',
    description: 'Wearable devices and smartwatches',
    status: 'Active',
  },
];

const addCategories = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(connection_string, { family: 4 });
    console.log('✓ Connected to MongoDB');

    for (const cat of newCategories) {
      const exists = await Category.findOne({ name: cat.name });
      if (exists) {
        console.log(`⚠ Category "${cat.name}" already exists`);
      } else {
        await Category.create(cat);
        console.log(`✓ Added category: ${cat.name}`);
      }
    }

    console.log('\n✓✓✓ SUCCESS! Categories are now showing in the database!');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

addCategories();
