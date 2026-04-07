import { connectDB } from './db/mongo-db-connect.js';
import Product from './models/product.js';

async function checkRatings() {
  try {
    await connectDB();
    const products = await Product.find().select('productName averageRating totalReviews').limit(5);
    console.log('\n📊 Products with ratings:');
    products.forEach(p => {
      console.log(`  ${p.productName}: ${p.averageRating} stars (${p.totalReviews} reviews)`);
    });
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkRatings();
