import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const analyzeMobileAndTablets = () => {
  const productsJsonPath = path.join(__dirname, 'products.json');
  const productsData = JSON.parse(fs.readFileSync(productsJsonPath, 'utf-8'));

  console.log('📱 Analyzing products for Mobile and Tablet categories...\n');

  const mobiles = [];
  const tablets = [];
  const others = [];

  for (const product of productsData) {
    if (!product || !product.name) continue;

    const name = product.name.toLowerCase();
    const category = (product.category || '').toLowerCase();

    if (
      name.includes('phone') ||
      name.includes('mobile') ||
      name.includes('smartphone') ||
      name.includes('galaxy s') ||
      name.includes('galaxy a') ||
      name.includes('iphone')
    ) {
      mobiles.push(product.name);
    } else if (
      name.includes('tablet') ||
      name.includes('ipad') ||
      name.includes('galaxy tab')
    ) {
      tablets.push(product.name);
    } else {
      others.push({ name: product.name, category: product.category });
    }
  }

  console.log(`📱 Mobile Products: ${mobiles.length}`);
  if (mobiles.length > 0) {
    mobiles.slice(0, 5).forEach(m => console.log(`  - ${m}`));
    if (mobiles.length > 5) console.log(`  ... and ${mobiles.length - 5} more`);
  }

  console.log(`\n📱 Tablet Products: ${tablets.length}`);
  if (tablets.length > 0) {
    tablets.slice(0, 5).forEach(t => console.log(`  - ${t}`));
    if (tablets.length > 5) console.log(`  ... and ${tablets.length - 5} more`);
  }

  console.log(`\n📺 Other Products: ${others.length}`);
  
  // Show original categories
  const categoryBreakdown = {};
  others.forEach(o => {
    const cat = o.category || 'Unknown';
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
  });

  for (const [cat, count] of Object.entries(categoryBreakdown)) {
    console.log(`  ${cat}: ${count}`);
  }
};

analyzeMobileAndTablets();
