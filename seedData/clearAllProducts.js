import { connectDB } from '../db/mongo-db-connect.js';
import Product from '../models/product.js';

async function removeAllProducts() {
  try {
    await connectDB();
    console.log('📋 Connected to database');

    const result = await Product.deleteMany({});
    console.log(`\n✅ Successfully deleted ${result.deletedCount} products from database\n`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error removing products:', err.message);
    process.exit(1);
  }
}

removeAllProducts();
