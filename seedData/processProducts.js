import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Exchange rate: 1 USD = 83 INR
const USD_TO_INR = 83;

const inputFile = path.join(__dirname, 'products.json');
const outputFile = path.join(__dirname, 'products.json');

console.log('📖 Reading products.json...');
let products = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

console.log(`📊 Total products before processing: ${products.length}`);

// Filter out refurbished products and convert prices
products = products.filter(product => {
  const nameAndDesc = (product.name + ' ' + (product.long_description || '') + ' ' + (product.description || '')).toLowerCase();
  
  // Remove if contains "refurbished"
  if (nameAndDesc.includes('refurbished') || nameAndDesc.includes('certified pre-owned') || nameAndDesc.includes('open box')) {
    return false;
  }
  
  return true;
});

console.log(`✂️  Total products after removing refurbished: ${products.length}`);

// Convert prices from USD to INR
products = products.map(product => {
  return {
    ...product,
    price: parseFloat((product.price * USD_TO_INR).toFixed(2)),
    regular_price: parseFloat((product.regular_price * USD_TO_INR).toFixed(2))
  };
});

console.log(`💱 Prices converted to INR (1 USD = ${USD_TO_INR} INR)`);

// Save updated products
fs.writeFileSync(outputFile, JSON.stringify(products, null, 2), 'utf8');

console.log(`✅ Updated products.json saved with ${products.length} products`);
console.log('🎯 Changes made:');
console.log('   ✓ Removed refurbished products');
console.log('   ✓ Converted prices from USD to INR');
