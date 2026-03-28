import axios from 'axios';
import { config } from '../../config/config.js';

// Universal Electronics Product Scraper
// Comprehensive product detection and specialized handling

// ========== ANTI-BOT PROTECTION & RATE LIMITING HELPERS ==========

// Rotate User Agents to avoid detection
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
];

// Get random user agent
const getRandomUserAgent = () => {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
};

// Random delay between requests (human-like behavior)
const randomDelay = (min = 2000, max = 5000) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
};

// Exponential backoff for 429 errors
const exponentialBackoff = async (retryCount, maxRetries = 3) => {
  if (retryCount >= maxRetries) {
    throw new Error('Max retries reached for rate limiting');
  }
  const delay = Math.min(1000 * Math.pow(2, retryCount) + Math.random() * 1000, 30000);
  console.log(`Rate limited. Waiting ${Math.round(delay)}ms before retry ${retryCount + 1}/${maxRetries}...`);
  await new Promise(resolve => setTimeout(resolve, delay));
};

// Make request with retry logic for 429 errors
const makeRequestWithRetry = async (url, options = {}, maxRetries = 3) => {
  let retryCount = 0;
  
  while (retryCount <= maxRetries) {
    try {
      // Add random delay before request (human-like)
      if (retryCount === 0) {
        await randomDelay(1500, 3000);
      }
      
      const response = await axios.get(url, {
        ...options,
        headers: {
          ...options.headers,
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': retryCount === 0 ? 'none' : 'same-origin',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
          'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'DNT': '1',
          'Referer': options.referer || (url.includes('flipkart') ? 'https://www.flipkart.com/' : 'https://www.amazon.in/')
        }
      });
      
      return response;
    } catch (error) {
      // Handle 429 (Too Many Requests) error
      if (error.response && error.response.status === 429) {
        console.log(`429 Rate Limit Error. Retry attempt ${retryCount + 1}/${maxRetries}`);
        await exponentialBackoff(retryCount, maxRetries);
        retryCount++;
        continue;
      }
      
      // Handle 503 (Service Unavailable) - temporary blocking
      if (error.response && error.response.status === 503) {
        console.log(`503 Service Unavailable. Retry attempt ${retryCount + 1}/${maxRetries}`);
        await exponentialBackoff(retryCount, maxRetries);
        retryCount++;
        continue;
      }
      
      // Handle other errors
      if (retryCount < maxRetries && error.response && error.response.status >= 500) {
        console.log(`Server error ${error.response.status}. Retry attempt ${retryCount + 1}/${maxRetries}`);
        await exponentialBackoff(retryCount, maxRetries);
        retryCount++;
        continue;
      }
      
      // Re-throw if not retryable
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded');
};

// Product Category Detection and Specialized Handling
const PRODUCT_CATEGORIES = {
  // Smartphones - Comprehensive
  'iphone': {
    exclusions: ['fe', 'ultra', 'plus', 'pro max', 'mini', 'se', 'iphone 14', 'iphone 13', 'iphone 12'],
    variants: ['pro', 'max', 'plus', 'mini', 'se'],
    searchTerms: ['iphone', 'apple'],
    priceRange: { min: 30000, max: 200000 }
  },
  'samsung': {
    exclusions: ['fe', 'ultra', 'plus', 'note', 's24 fe', 's24fe', 'galaxy s24 fe', 's23', 's22', 'a series', 'm series'],
    variants: ['ultra', 'plus', 'fe', 'note', 's24', 's23', 's22'],
    searchTerms: ['samsung', 'galaxy'],
    priceRange: { min: 8000, max: 150000 }
  },
  'oneplus': {
    exclusions: ['r', 'nord', 'ce', 'oneplus 11', 'oneplus 10'],
    variants: ['pro', 't', 'r', 'oneplus 12'],
    searchTerms: ['oneplus'],
    priceRange: { min: 15000, max: 80000 }
  },
  'motorola': {
    exclusions: ['g', 'e', 'edge', 'moto g', 'moto e'],
    variants: ['edge', 'razr', 'moto edge'],
    searchTerms: ['motorola', 'moto'],
    priceRange: { min: 5000, max: 50000 }
  },
  'xiaomi': {
    exclusions: ['redmi', 'poco', 'xiaomi 13', 'xiaomi 12'],
    variants: ['mi', 'redmi', 'poco', 'xiaomi 14'],
    searchTerms: ['xiaomi', 'mi'],
    priceRange: { min: 8000, max: 80000 }
  },
  'realme': {
    exclusions: ['narzo', 'c series', 'realme 11', 'realme 10'],
    variants: ['gt', 'pro', 'narzo', 'realme 12'],
    searchTerms: ['realme'],
    priceRange: { min: 8000, max: 60000 }
  },
  'oppo': {
    exclusions: ['a series', 'reno lite', 'oppo find x6', 'oppo find x5'],
    variants: ['find', 'reno', 'a series', 'oppo find x7'],
    searchTerms: ['oppo'],
    priceRange: { min: 8000, max: 80000 }
  },
  'vivo': {
    exclusions: ['y series', 'v series', 'vivo x100', 'vivo x90'],
    variants: ['x series', 'v series', 'y series', 'vivo x100'],
    searchTerms: ['vivo'],
    priceRange: { min: 8000, max: 80000 }
  },
  'nothing': {
    exclusions: ['basic', 'cheap', 'nothing phone 1'],
    variants: ['phone 1', 'phone 2'],
    searchTerms: ['nothing', 'phone'],
    priceRange: { min: 25000, max: 60000 }
  },
  'google': {
    exclusions: ['basic', 'cheap', 'pixel 7', 'pixel 6'],
    variants: ['pixel', 'nexus', 'pixel 8'],
    searchTerms: ['google', 'pixel'],
    priceRange: { min: 30000, max: 120000 }
  },
  'huawei': {
    exclusions: ['basic', 'cheap', 'huawei p60', 'huawei p50'],
    variants: ['p series', 'mate', 'nova', 'huawei p70'],
    searchTerms: ['huawei'],
    priceRange: { min: 15000, max: 100000 }
  },
  'honor': {
    exclusions: ['basic', 'cheap', 'honor 90', 'honor 80'],
    variants: ['magic', 'view', 'play', 'honor 100'],
    searchTerms: ['honor'],
    priceRange: { min: 12000, max: 80000 }
  },
  
  // Laptops - Comprehensive
  'macbook': {
    exclusions: ['m1', 'm2', 'm4', 'pro', 'motorola', 'moto', 'phone', 'mobile'],
    variants: ['pro', 'air'],
    searchTerms: ['macbook', 'apple', 'laptop'],
    priceRange: { min: 80000, max: 400000 }
  },
  'dell': {
    exclusions: ['inspiron', 'vostro', 'dell inspiron', 'dell vostro'],
    variants: ['xps', 'latitude', 'precision', 'dell xps', 'dell latitude'],
    searchTerms: ['dell'],
    priceRange: { min: 30000, max: 200000 }
  },
  'hp': {
    exclusions: ['pavilion', '15s', 'hp pavilion', 'hp 15s'],
    variants: ['elitebook', 'spectre', 'omen', 'hp elitebook', 'hp spectre'],
    searchTerms: ['hp', 'hewlett'],
    priceRange: { min: 25000, max: 150000 }
  },
  'lenovo': {
    exclusions: ['ideapad', 'v15', 'lenovo ideapad', 'lenovo v15'],
    variants: ['thinkpad', 'yoga', 'legion', 'lenovo thinkpad', 'lenovo yoga'],
    searchTerms: ['lenovo'],
    priceRange: { min: 25000, max: 150000 }
  },
  'asus': {
    exclusions: ['basic', 'cheap', 'asus vivobook', 'asus tuf'],
    variants: ['rog', 'zenbook', 'vivobook', 'tuf', 'asus rog', 'asus zenbook'],
    searchTerms: ['asus'],
    priceRange: { min: 25000, max: 200000 }
  },
  'acer': {
    exclusions: ['basic', 'cheap', 'acer aspire', 'acer swift'],
    variants: ['predator', 'aspire', 'swift', 'spin', 'acer predator'],
    searchTerms: ['acer'],
    priceRange: { min: 20000, max: 150000 }
  },
  'msi': {
    exclusions: ['basic', 'cheap'],
    variants: ['gaming', 'creator', 'prestige', 'msi gaming'],
    searchTerms: ['msi'],
    priceRange: { min: 40000, max: 300000 }
  },
  'razer': {
    exclusions: ['basic', 'cheap'],
    variants: ['blade', 'gaming', 'razer blade'],
    searchTerms: ['razer'],
    priceRange: { min: 80000, max: 400000 }
  },
  'gigabyte': {
    exclusions: ['basic', 'cheap'],
    variants: ['aorus', 'gaming', 'gigabyte aorus'],
    searchTerms: ['gigabyte'],
    priceRange: { min: 30000, max: 200000 }
  },
  'alienware': {
    exclusions: ['basic', 'cheap'],
    variants: ['gaming', 'x series', 'm series', 'alienware gaming'],
    searchTerms: ['alienware', 'dell'],
    priceRange: { min: 80000, max: 500000 }
  },
  
  // Tablets - Comprehensive
  'ipad': {
    exclusions: ['mini', 'air', 'ipad mini', 'ipad air'],
    variants: ['pro', 'air', 'mini', 'ipad pro', 'ipad air', 'ipad mini'],
    searchTerms: ['ipad', 'apple'],
    priceRange: { min: 25000, max: 150000 }
  },
  'samsung_tab': {
    exclusions: ['fe', 'lite', 'samsung tab fe', 'samsung tab lite'],
    variants: ['pro', 'ultra', 'fe', 'samsung tab pro', 'samsung tab ultra'],
    searchTerms: ['samsung', 'galaxy tab'],
    priceRange: { min: 15000, max: 100000 }
  },
  'lenovo_tab': {
    exclusions: ['basic', 'cheap', 'lenovo tab basic'],
    variants: ['yoga', 'tab', 'p series', 'lenovo yoga tab', 'lenovo tab p'],
    searchTerms: ['lenovo', 'tablet'],
    priceRange: { min: 8000, max: 80000 }
  },
  'xiaomi_tab': {
    exclusions: ['basic', 'cheap', 'xiaomi pad basic'],
    variants: ['mi pad', 'redmi pad', 'xiaomi mi pad', 'xiaomi redmi pad'],
    searchTerms: ['xiaomi', 'mi', 'tablet'],
    priceRange: { min: 8000, max: 60000 }
  },
  'realme_tab': {
    exclusions: ['basic', 'cheap', 'realme pad basic'],
    variants: ['realme pad', 'realme pad x'],
    searchTerms: ['realme', 'tablet'],
    priceRange: { min: 8000, max: 50000 }
  },
  'oneplus_tab': {
    exclusions: ['basic', 'cheap', 'oneplus pad basic'],
    variants: ['oneplus pad', 'oneplus pad go'],
    searchTerms: ['oneplus', 'tablet'],
    priceRange: { min: 15000, max: 80000 }
  },
  'huawei_tab': {
    exclusions: ['basic', 'cheap', 'huawei matepad basic'],
    variants: ['matepad', 'mediapad', 'huawei matepad', 'huawei mediapad'],
    searchTerms: ['huawei', 'tablet'],
    priceRange: { min: 10000, max: 80000 }
  },
  
  // Smartwatches - Comprehensive
  'apple_watch': {
    exclusions: ['se', 'ultra', 'apple watch se', 'apple watch ultra'],
    variants: ['ultra', 'se', 'apple watch series 9', 'apple watch ultra 2'],
    searchTerms: ['apple watch'],
    priceRange: { min: 20000, max: 80000 }
  },
  'samsung_watch': {
    exclusions: ['fe', 'classic', 'samsung watch fe', 'samsung watch classic'],
    variants: ['classic', 'pro', 'samsung galaxy watch 6', 'samsung galaxy watch 6 classic'],
    searchTerms: ['samsung', 'galaxy watch'],
    priceRange: { min: 15000, max: 50000 }
  },
  'fitbit': {
    exclusions: ['basic', 'cheap', 'fitbit basic'],
    variants: ['versa', 'sense', 'charge', 'inspire', 'fitbit versa', 'fitbit sense'],
    searchTerms: ['fitbit'],
    priceRange: { min: 3000, max: 30000 }
  },
  'garmin': {
    exclusions: ['basic', 'cheap', 'garmin basic'],
    variants: ['fenix', 'forerunner', 'vivoactive', 'venu', 'garmin fenix', 'garmin forerunner'],
    searchTerms: ['garmin'],
    priceRange: { min: 8000, max: 80000 }
  },
  'huawei_watch': {
    exclusions: ['basic', 'cheap', 'huawei watch basic'],
    variants: ['watch gt', 'watch fit', 'huawei watch gt', 'huawei watch fit'],
    searchTerms: ['huawei', 'watch'],
    priceRange: { min: 5000, max: 40000 }
  },
  'amazfit': {
    exclusions: ['basic', 'cheap', 'amazfit basic'],
    variants: ['gtr', 'bip', 'trex', 'amazfit gtr', 'amazfit bip'],
    searchTerms: ['amazfit'],
    priceRange: { min: 2000, max: 25000 }
  },
  'realme_watch': {
    exclusions: ['basic', 'cheap', 'realme watch basic'],
    variants: ['realme watch', 'realme watch 2', 'realme watch 3'],
    searchTerms: ['realme', 'watch'],
    priceRange: { min: 1500, max: 15000 }
  },
  'noise_watch': {
    exclusions: ['basic', 'cheap', 'noise watch basic'],
    variants: ['colorfit', 'hms', 'noise colorfit', 'noise hms'],
    searchTerms: ['noise', 'watch'],
    priceRange: { min: 1000, max: 8000 }
  },
  'boat_watch': {
    exclusions: ['basic', 'cheap', 'boat watch basic'],
    variants: ['wave', 'storm', 'boat wave', 'boat storm'],
    searchTerms: ['boat', 'watch'],
    priceRange: { min: 1000, max: 8000 }
  },
  
  // Headphones
  'airpods': {
    exclusions: ['pro', 'max', 'airpods pro', 'airpods max'],
    variants: ['pro', 'max', 'airpods pro', 'airpods max'],
    searchTerms: ['airpods', 'apple'],
    priceRange: { min: 8000, max: 60000 }
  },
  'sony': {
    exclusions: ['wh-1000xm4', 'sony wh-1000xm4'],
    variants: ['wh-1000xm5', 'wh-1000xm4', 'sony wh-1000xm5'],
    searchTerms: ['sony'],
    priceRange: { min: 2000, max: 50000 }
  },
  'bose': {
    exclusions: ['quietcomfort 35', 'bose quietcomfort 35'],
    variants: ['quietcomfort 45', '700', 'bose quietcomfort 45', 'bose 700'],
    searchTerms: ['bose'],
    priceRange: { min: 5000, max: 40000 }
  },
  
  // Cameras
  'canon': {
    exclusions: ['eos 2000d', 'canon eos 2000d', 'canon rebel'],
    variants: ['eos r', 'eos 5d', 'canon eos r', 'canon eos 5d'],
    searchTerms: ['canon'],
    priceRange: { min: 20000, max: 300000 }
  },
  'nikon': {
    exclusions: ['d3500', 'nikon d3500', 'nikon d3400'],
    variants: ['z6', 'z7', 'd850', 'nikon z6', 'nikon z7'],
    searchTerms: ['nikon'],
    priceRange: { min: 25000, max: 250000 }
  },
  'sony_camera': {
    exclusions: ['a6000', 'sony a6000', 'sony a5100'],
    variants: ['a7', 'a9', 'a1', 'sony a7', 'sony a9', 'sony a1'],
    searchTerms: ['sony', 'alpha'],
    priceRange: { min: 30000, max: 400000 }
  },
  
  // Gaming
  'ps5': {
    exclusions: ['ps4', 'ps3', 'playstation 4', 'playstation 3'],
    variants: ['digital', 'disc', 'ps5 digital', 'ps5 disc'],
    searchTerms: ['playstation 5', 'ps5'],
    priceRange: { min: 35000, max: 60000 }
  },
  'xbox': {
    exclusions: ['xbox one', 'xbox 360'],
    variants: ['series x', 'series s', 'xbox series x', 'xbox series s'],
    searchTerms: ['xbox'],
    priceRange: { min: 25000, max: 50000 }
  },
  
  // TVs
  'samsung_tv': {
    exclusions: ['32 inch', 'samsung 32 inch', 'samsung 24 inch'],
    variants: ['qled', 'oled', 'neo qled', 'samsung qled', 'samsung oled'],
    searchTerms: ['samsung', 'tv'],
    priceRange: { min: 15000, max: 300000 }
  },
  'lg_tv': {
    exclusions: ['32 inch', 'lg 32 inch', 'lg 24 inch'],
    variants: ['oled', 'qned', 'lg oled', 'lg qned'],
    searchTerms: ['lg', 'tv'],
    priceRange: { min: 20000, max: 400000 }
  },
  
  // Kitchen Appliances
  'mixer': {
    exclusions: ['mini', 'small'],
    variants: ['juicer', 'grinder', 'blender'],
    searchTerms: ['mixer', 'grinder'],
    priceRange: { min: 500, max: 15000 }
  },
  'refrigerator': {
    exclusions: ['mini', 'small'],
    variants: ['side by side', 'french door', 'bottom freezer'],
    searchTerms: ['refrigerator', 'fridge'],
    priceRange: { min: 15000, max: 200000 }
  },
  'washing_machine': {
    exclusions: ['mini', 'portable'],
    variants: ['front load', 'top load', 'semi automatic'],
    searchTerms: ['washing machine', 'washer'],
    priceRange: { min: 8000, max: 80000 }
  },
  'microwave': {
    exclusions: ['mini', 'portable'],
    variants: ['convection', 'grill', 'solo'],
    searchTerms: ['microwave', 'oven'],
    priceRange: { min: 3000, max: 25000 }
  },
  'air_conditioner': {
    exclusions: ['portable', 'window'],
    variants: ['split', 'inverter', '1 ton', '1.5 ton'],
    searchTerms: ['air conditioner', 'ac'],
    priceRange: { min: 25000, max: 100000 }
  },
  
  // Computer Accessories
  'keyboard': {
    exclusions: ['mini', 'portable'],
    variants: ['mechanical', 'wireless', 'gaming'],
    searchTerms: ['keyboard'],
    priceRange: { min: 500, max: 15000 }
  },
  'mouse': {
    exclusions: ['mini', 'basic'],
    variants: ['wireless', 'gaming', 'optical'],
    searchTerms: ['mouse'],
    priceRange: { min: 200, max: 8000 }
  },
  'monitor': {
    exclusions: ['small', 'portable'],
    variants: ['gaming', 'ultrawide', '4k', 'curved'],
    searchTerms: ['monitor', 'display'],
    priceRange: { min: 5000, max: 50000 }
  },
  'webcam': {
    exclusions: ['basic', 'cheap'],
    variants: ['4k', '1080p', 'streaming'],
    searchTerms: ['webcam', 'camera'],
    priceRange: { min: 1000, max: 15000 }
  },
  'printer': {
    exclusions: ['basic', 'cheap'],
    variants: ['laser', 'inkjet', 'all in one'],
    searchTerms: ['printer'],
    priceRange: { min: 3000, max: 30000 }
  },
  
  // Networking
  'router': {
    exclusions: ['basic', 'cheap'],
    variants: ['wifi 6', 'mesh', 'gaming'],
    searchTerms: ['router', 'wifi'],
    priceRange: { min: 1000, max: 25000 }
  },
  'modem': {
    exclusions: ['basic', 'old'],
    variants: ['cable', 'dsl', 'fiber'],
    searchTerms: ['modem'],
    priceRange: { min: 1000, max: 8000 }
  },
  'switch': {
    exclusions: ['basic', 'cheap'],
    variants: ['managed', 'unmanaged', 'poe'],
    searchTerms: ['switch', 'network'],
    priceRange: { min: 500, max: 15000 }
  },
  
  // Mobile Accessories
  'powerbank': {
    exclusions: ['small', 'cheap'],
    variants: ['10000mah', '20000mah', 'fast charging'],
    searchTerms: ['powerbank', 'power bank'],
    priceRange: { min: 500, max: 5000 }
  },
  'mobile_charger': {
    exclusions: ['basic', 'cheap'],
    variants: ['fast charging', 'wireless', 'type c'],
    searchTerms: ['charger', 'adapter'],
    priceRange: { min: 200, max: 3000 }
  },
  'mobile_case': {
    exclusions: ['basic', 'cheap'],
    variants: ['protective', 'wallet', 'clear'],
    searchTerms: ['case', 'cover'],
    priceRange: { min: 100, max: 2000 }
  },
  'screen_protector': {
    exclusions: ['basic', 'cheap'],
    variants: ['tempered glass', '3d', 'privacy'],
    searchTerms: ['screen protector', 'tempered glass'],
    priceRange: { min: 100, max: 1000 }
  },
  
  // Audio Equipment
  'speaker': {
    exclusions: ['mini', 'portable'],
    variants: ['bluetooth', 'soundbar', 'home theater'],
    searchTerms: ['speaker', 'audio'],
    priceRange: { min: 1000, max: 50000 }
  },
  'microphone': {
    exclusions: ['basic', 'cheap'],
    variants: ['condenser', 'dynamic', 'wireless'],
    searchTerms: ['microphone', 'mic'],
    priceRange: { min: 500, max: 15000 }
  },
  'amplifier': {
    exclusions: ['mini', 'portable'],
    variants: ['stereo', 'home theater', 'guitar'],
    searchTerms: ['amplifier', 'amp'],
    priceRange: { min: 2000, max: 50000 }
  },
  
  // Storage Devices
  'hard_disk': {
    exclusions: ['small', 'old'],
    variants: ['1tb', '2tb', '4tb', 'external'],
    searchTerms: ['hard disk', 'hdd'],
    priceRange: { min: 2000, max: 15000 }
  },
  'ssd': {
    exclusions: ['small', 'old'],
    variants: ['nvme', 'sata', 'external'],
    searchTerms: ['ssd', 'solid state'],
    priceRange: { min: 1500, max: 20000 }
  },
  'pendrive': {
    exclusions: ['small', 'cheap'],
    variants: ['32gb', '64gb', '128gb', 'type c'],
    searchTerms: ['pendrive', 'usb'],
    priceRange: { min: 200, max: 3000 }
  },
  
  // Gaming Accessories
  'gaming_controller': {
    exclusions: ['basic', 'cheap'],
    variants: ['wireless', 'pro', 'elite'],
    searchTerms: ['controller', 'gamepad'],
    priceRange: { min: 1000, max: 8000 }
  },
  'gaming_headset': {
    exclusions: ['basic', 'cheap'],
    variants: ['wireless', 'surround', 'rgb'],
    searchTerms: ['gaming headset', 'headphone'],
    priceRange: { min: 1000, max: 15000 }
  },
  'gaming_keyboard': {
    exclusions: ['mini', 'portable'],
    variants: ['mechanical', 'rgb', 'wireless'],
    searchTerms: ['gaming keyboard'],
    priceRange: { min: 2000, max: 20000 }
  },
  'gaming_mouse': {
    exclusions: ['basic', 'cheap'],
    variants: ['rgb', 'wireless', 'high dpi'],
    searchTerms: ['gaming mouse'],
    priceRange: { min: 1000, max: 12000 }
  },
  
  // Smart Home
  'smart_bulb': {
    exclusions: ['basic', 'cheap'],
    variants: ['wifi', 'bluetooth', 'rgb'],
    searchTerms: ['smart bulb', 'led'],
    priceRange: { min: 200, max: 2000 }
  },
  'smart_plug': {
    exclusions: ['basic', 'cheap'],
    variants: ['wifi', 'bluetooth', 'energy monitoring'],
    searchTerms: ['smart plug', 'socket'],
    priceRange: { min: 300, max: 1500 }
  },
  'security_camera': {
    exclusions: ['basic', 'cheap'],
    variants: ['wifi', 'night vision', 'motion detection'],
    searchTerms: ['security camera', 'cctv'],
    priceRange: { min: 1000, max: 15000 }
  },
  'doorbell': {
    exclusions: ['basic', 'cheap'],
    variants: ['video', 'wifi', 'motion detection'],
    searchTerms: ['doorbell', 'smart doorbell'],
    priceRange: { min: 1000, max: 8000 }
  },
  
  // Additional Electronics Categories
  'smartphone': {
    exclusions: ['fe', 'ultra', 'plus', 'mini', 'lite'],
    variants: ['pro', 'ultra', 'plus', 'mini', 'lite'],
    searchTerms: ['smartphone', 'mobile', 'phone'],
    priceRange: { min: 8000, max: 200000 }
  },
  'laptop': {
    exclusions: ['basic', 'cheap', 'old'],
    variants: ['gaming', 'business', 'student'],
    searchTerms: ['laptop', 'notebook'],
    priceRange: { min: 20000, max: 500000 }
  },
  'tablet': {
    exclusions: ['basic', 'cheap', 'old'],
    variants: ['pro', 'air', 'mini'],
    searchTerms: ['tablet', 'ipad'],
    priceRange: { min: 8000, max: 150000 }
  },
  'smartwatch': {
    exclusions: ['basic', 'cheap', 'old'],
    variants: ['pro', 'ultra', 'se'],
    searchTerms: ['smartwatch', 'watch'],
    priceRange: { min: 1000, max: 80000 }
  },
  
  // Kitchen & Home Appliances
  'dishwasher': {
    exclusions: ['portable', 'mini'],
    variants: ['built-in', 'freestanding', 'drawer'],
    searchTerms: ['dishwasher'],
    priceRange: { min: 15000, max: 80000 }
  },
  'oven': {
    exclusions: ['portable', 'mini'],
    variants: ['convection', 'microwave', 'toaster'],
    searchTerms: ['oven', 'microwave'],
    priceRange: { min: 3000, max: 50000 }
  },
  'blender': {
    exclusions: ['mini', 'portable'],
    variants: ['personal', 'professional', 'smoothie'],
    searchTerms: ['blender', 'juicer'],
    priceRange: { min: 500, max: 15000 }
  },
  'food_processor': {
    exclusions: ['mini', 'basic'],
    variants: ['professional', 'multi-function'],
    searchTerms: ['food processor'],
    priceRange: { min: 1000, max: 20000 }
  },
  'coffee_maker': {
    exclusions: ['basic', 'cheap'],
    variants: ['espresso', 'drip', 'french press'],
    searchTerms: ['coffee maker', 'espresso'],
    priceRange: { min: 500, max: 25000 }
  },
  'water_purifier': {
    exclusions: ['basic', 'cheap'],
    variants: ['ro', 'uv', 'uf'],
    searchTerms: ['water purifier', 'ro'],
    priceRange: { min: 2000, max: 30000 }
  },
  'vacuum_cleaner': {
    exclusions: ['basic', 'cheap'],
    variants: ['robot', 'upright', 'canister'],
    searchTerms: ['vacuum cleaner', 'robot vacuum'],
    priceRange: { min: 2000, max: 50000 }
  },
  'iron': {
    exclusions: ['basic', 'cheap'],
    variants: ['steam', 'dry', 'cordless'],
    searchTerms: ['iron', 'steam iron'],
    priceRange: { min: 500, max: 8000 }
  },
  'hair_dryer': {
    exclusions: ['basic', 'cheap'],
    variants: ['professional', 'ionic', 'tourmaline'],
    searchTerms: ['hair dryer', 'blow dryer'],
    priceRange: { min: 500, max: 8000 }
  },
  'shaver': {
    exclusions: ['basic', 'cheap'],
    variants: ['electric', 'philips', 'braun'],
    searchTerms: ['shaver', 'razor'],
    priceRange: { min: 500, max: 15000 }
  },
  
  // Office & Business
  'projector': {
    exclusions: ['basic', 'cheap'],
    variants: ['4k', '1080p', 'portable'],
    searchTerms: ['projector'],
    priceRange: { min: 5000, max: 100000 }
  },
  'scanner': {
    exclusions: ['basic', 'cheap'],
    variants: ['document', 'photo', 'all-in-one'],
    searchTerms: ['scanner'],
    priceRange: { min: 2000, max: 25000 }
  },
  'laminator': {
    exclusions: ['basic', 'cheap'],
    variants: ['a4', 'a3', 'pouch'],
    searchTerms: ['laminator'],
    priceRange: { min: 500, max: 8000 }
  },
  'calculator': {
    exclusions: ['basic', 'cheap'],
    variants: ['scientific', 'financial', 'graphing'],
    searchTerms: ['calculator'],
    priceRange: { min: 200, max: 5000 }
  },
  
  // Fitness & Health
  'treadmill': {
    exclusions: ['basic', 'cheap'],
    variants: ['motorized', 'manual', 'folding'],
    searchTerms: ['treadmill'],
    priceRange: { min: 15000, max: 100000 }
  },
  'exercise_bike': {
    exclusions: ['basic', 'cheap'],
    variants: ['upright', 'recumbent', 'spinning'],
    searchTerms: ['exercise bike', 'cycle'],
    priceRange: { min: 8000, max: 80000 }
  },
  'yoga_mat': {
    exclusions: ['basic', 'cheap'],
    variants: ['non-slip', 'eco-friendly', 'thick'],
    searchTerms: ['yoga mat'],
    priceRange: { min: 200, max: 3000 }
  },
  'massage_chair': {
    exclusions: ['basic', 'cheap'],
    variants: ['recliner', 'portable', 'full body'],
    searchTerms: ['massage chair'],
    priceRange: { min: 15000, max: 200000 }
  },
  'blood_pressure_monitor': {
    exclusions: ['basic', 'cheap'],
    variants: ['digital', 'wrist', 'arm'],
    searchTerms: ['blood pressure monitor'],
    priceRange: { min: 500, max: 5000 }
  },
  'thermometer': {
    exclusions: ['basic', 'cheap'],
    variants: ['digital', 'infrared', 'ear'],
    searchTerms: ['thermometer'],
    priceRange: { min: 200, max: 3000 }
  },
  
  // Automotive Electronics
  'car_audio': {
    exclusions: ['basic', 'cheap'],
    variants: ['head unit', 'speakers', 'subwoofer'],
    searchTerms: ['car audio', 'car stereo'],
    priceRange: { min: 2000, max: 50000 }
  },
  'car_charger': {
    exclusions: ['basic', 'cheap'],
    variants: ['fast charging', 'wireless', 'usb c'],
    searchTerms: ['car charger'],
    priceRange: { min: 200, max: 2000 }
  },
  'dash_cam': {
    exclusions: ['basic', 'cheap'],
    variants: ['front', 'rear', 'dual'],
    searchTerms: ['dash cam', 'dashboard camera'],
    priceRange: { min: 1000, max: 15000 }
  },
  'gps_tracker': {
    exclusions: ['basic', 'cheap'],
    variants: ['real-time', 'hidden', 'magnetic'],
    searchTerms: ['gps tracker'],
    priceRange: { min: 500, max: 5000 }
  },
  
  // Musical Instruments & Audio
  'guitar': {
    exclusions: ['basic', 'cheap'],
    variants: ['acoustic', 'electric', 'bass'],
    searchTerms: ['guitar'],
    priceRange: { min: 2000, max: 100000 }
  },
  'piano': {
    exclusions: ['basic', 'cheap'],
    variants: ['digital', 'acoustic', 'keyboard'],
    searchTerms: ['piano', 'keyboard'],
    priceRange: { min: 5000, max: 200000 }
  },
  'drum_set': {
    exclusions: ['basic', 'cheap'],
    variants: ['acoustic', 'electronic', 'practice'],
    searchTerms: ['drum set', 'drums'],
    priceRange: { min: 5000, max: 100000 }
  },
  'dj_equipment': {
    exclusions: ['basic', 'cheap'],
    variants: ['controller', 'mixer', 'turntable'],
    searchTerms: ['dj', 'turntable'],
    priceRange: { min: 5000, max: 100000 }
  },
  
  // Photography & Videography
  'camera_lens': {
    exclusions: ['basic', 'cheap'],
    variants: ['wide angle', 'telephoto', 'macro'],
    searchTerms: ['camera lens', 'lens'],
    priceRange: { min: 5000, max: 200000 }
  },
  'tripod': {
    exclusions: ['basic', 'cheap'],
    variants: ['aluminum', 'carbon fiber', 'travel'],
    searchTerms: ['tripod'],
    priceRange: { min: 1000, max: 15000 }
  },
  'gimbal': {
    exclusions: ['basic', 'cheap'],
    variants: ['3-axis', 'handheld', 'drone'],
    searchTerms: ['gimbal', 'stabilizer'],
    priceRange: { min: 2000, max: 30000 }
  },
  'drone': {
    exclusions: ['basic', 'cheap'],
    variants: ['4k', 'folding', 'racing'],
    searchTerms: ['drone', 'quadcopter'],
    priceRange: { min: 5000, max: 100000 }
  },
  
  // Tools & DIY
  'drill': {
    exclusions: ['basic', 'cheap'],
    variants: ['cordless', 'hammer', 'impact'],
    searchTerms: ['drill', 'drill machine'],
    priceRange: { min: 1000, max: 15000 }
  },
  'saw': {
    exclusions: ['basic', 'cheap'],
    variants: ['circular', 'jigsaw', 'reciprocating'],
    searchTerms: ['saw', 'cutting machine'],
    priceRange: { min: 2000, max: 20000 }
  },
  'welding_machine': {
    exclusions: ['basic', 'cheap'],
    variants: ['arc', 'mig', 'tig'],
    searchTerms: ['welding machine', 'welder'],
    priceRange: { min: 5000, max: 50000 }
  },
  'generator': {
    exclusions: ['basic', 'cheap'],
    variants: ['portable', 'inverter', 'diesel'],
    searchTerms: ['generator'],
    priceRange: { min: 8000, max: 100000 }
  },
  
  // Lighting & Electrical
  'led_bulb': {
    exclusions: ['basic', 'cheap'],
    variants: ['smart', 'wifi', 'rgb'],
    searchTerms: ['led bulb', 'smart bulb'],
    priceRange: { min: 100, max: 2000 }
  },
  'ceiling_fan': {
    exclusions: ['basic', 'cheap'],
    variants: ['remote', 'smart', 'energy efficient'],
    searchTerms: ['ceiling fan'],
    priceRange: { min: 1000, max: 8000 }
  },
  'inverter': {
    exclusions: ['basic', 'cheap'],
    variants: ['solar', 'battery', 'hybrid'],
    searchTerms: ['inverter'],
    priceRange: { min: 5000, max: 100000 }
  },
  'ups': {
    exclusions: ['basic', 'cheap'],
    variants: ['online', 'offline', 'line interactive'],
    searchTerms: ['ups', 'uninterrupted power supply'],
    priceRange: { min: 2000, max: 50000 }
  }
};

// Detect product category and get specialized rules
const detectProductCategory = (productTitle, modelNumber, brandName) => {
  const title = productTitle.toLowerCase();
  const model = modelNumber ? modelNumber.toLowerCase() : '';
  const brand = brandName ? brandName.toLowerCase() : '';
  
  // Laptops - Check BEFORE smartphones to avoid misclassification
  if (title.includes('macbook')) {
    return 'macbook';
  }
  
  // Smartphones - Comprehensive
  if (title.includes('iphone')) {
    return 'iphone';
  }
  // Check for Apple brand only if it's not a MacBook
  if (brand.includes('apple') && !title.includes('macbook') && !title.includes('ipad') && !title.includes('watch')) {
    return 'iphone';
  }
  if (title.includes('samsung') && (title.includes('galaxy') || title.includes('s24') || title.includes('s23'))) {
    return 'samsung';
  }
  if (title.includes('oneplus')) {
    return 'oneplus';
  }
  if (title.includes('motorola') || title.includes('moto')) {
    return 'motorola';
  }
  if (title.includes('xiaomi') || title.includes('mi ') || title.includes('redmi') || title.includes('poco')) {
    return 'xiaomi';
  }
  if (title.includes('realme')) {
    return 'realme';
  }
  if (title.includes('oppo')) {
    return 'oppo';
  }
  if (title.includes('vivo')) {
    return 'vivo';
  }
  if (title.includes('nothing') && title.includes('phone')) {
    return 'nothing';
  }
  if (title.includes('google') || title.includes('pixel')) {
    return 'google';
  }
  if (title.includes('huawei')) {
    return 'huawei';
  }
  if (title.includes('honor')) {
    return 'honor';
  }
  
  // Laptops - Comprehensive
  if (title.includes('macbook')) {
    return 'macbook';
  }
  if (title.includes('dell')) {
    return 'dell';
  }
  if (title.includes('hp') || title.includes('hewlett')) {
    return 'hp';
  }
  if (title.includes('lenovo')) {
    return 'lenovo';
  }
  if (title.includes('asus')) {
    return 'asus';
  }
  if (title.includes('acer')) {
    return 'acer';
  }
  if (title.includes('msi')) {
    return 'msi';
  }
  if (title.includes('razer')) {
    return 'razer';
  }
  if (title.includes('gigabyte')) {
    return 'gigabyte';
  }
  if (title.includes('alienware')) {
    return 'alienware';
  }
  
  // Tablets - Comprehensive
  if (title.includes('ipad')) {
    return 'ipad';
  }
  if (title.includes('samsung') && title.includes('tab')) {
    return 'samsung_tab';
  }
  if (title.includes('lenovo') && title.includes('tab')) {
    return 'lenovo_tab';
  }
  if (title.includes('xiaomi') && title.includes('tab')) {
    return 'xiaomi_tab';
  }
  if (title.includes('realme') && title.includes('tab')) {
    return 'realme_tab';
  }
  if (title.includes('oneplus') && title.includes('tab')) {
    return 'oneplus_tab';
  }
  if (title.includes('huawei') && title.includes('tab')) {
    return 'huawei_tab';
  }
  
  // Smartwatches - Comprehensive
  if (title.includes('apple watch')) {
    return 'apple_watch';
  }
  if (title.includes('samsung') && title.includes('watch')) {
    return 'samsung_watch';
  }
  if (title.includes('fitbit')) {
    return 'fitbit';
  }
  if (title.includes('garmin')) {
    return 'garmin';
  }
  if (title.includes('huawei') && title.includes('watch')) {
    return 'huawei_watch';
  }
  if (title.includes('amazfit')) {
    return 'amazfit';
  }
  if (title.includes('realme') && title.includes('watch')) {
    return 'realme_watch';
  }
  if (title.includes('noise') && title.includes('watch')) {
    return 'noise_watch';
  }
  if (title.includes('boat') && title.includes('watch')) {
    return 'boat_watch';
  }
  
  // Headphones & Audio
  if (title.includes('airpods')) {
    return 'airpods';
  }
  if (title.includes('sony') && (title.includes('headphone') || title.includes('earphone'))) {
    return 'sony';
  }
  if (title.includes('bose')) {
    return 'bose';
  }
  
  // Cameras
  if (title.includes('canon')) {
    return 'canon';
  }
  if (title.includes('nikon')) {
    return 'nikon';
  }
  if (title.includes('sony') && (title.includes('camera') || title.includes('alpha'))) {
    return 'sony_camera';
  }
  
  // Gaming
  if (title.includes('playstation') || title.includes('ps5')) {
    return 'ps5';
  }
  if (title.includes('xbox')) {
    return 'xbox';
  }
  
  // TVs
  if (title.includes('samsung') && title.includes('tv')) {
    return 'samsung_tv';
  }
  if (title.includes('lg') && title.includes('tv')) {
    return 'lg_tv';
  }
  
  // Kitchen Appliances
  if (title.includes('dishwasher')) {
    return 'dishwasher';
  }
  if (title.includes('oven') || title.includes('microwave')) {
    return 'oven';
  }
  if (title.includes('blender') || title.includes('juicer')) {
    return 'blender';
  }
  if (title.includes('food processor')) {
    return 'food_processor';
  }
  if (title.includes('coffee maker') || title.includes('espresso')) {
    return 'coffee_maker';
  }
  if (title.includes('water purifier') || title.includes('ro')) {
    return 'water_purifier';
  }
  if (title.includes('vacuum cleaner') || title.includes('robot vacuum')) {
    return 'vacuum_cleaner';
  }
  if (title.includes('iron') || title.includes('steam iron')) {
    return 'iron';
  }
  if (title.includes('hair dryer') || title.includes('blow dryer')) {
    return 'hair_dryer';
  }
  if (title.includes('shaver') || title.includes('razor')) {
    return 'shaver';
  }
  
  // Office & Business
  if (title.includes('projector')) {
    return 'projector';
  }
  if (title.includes('scanner')) {
    return 'scanner';
  }
  if (title.includes('laminator')) {
    return 'laminator';
  }
  if (title.includes('calculator')) {
    return 'calculator';
  }
  
  // Fitness & Health
  if (title.includes('treadmill')) {
    return 'treadmill';
  }
  if (title.includes('exercise bike') || title.includes('cycle')) {
    return 'exercise_bike';
  }
  if (title.includes('yoga mat')) {
    return 'yoga_mat';
  }
  if (title.includes('massage chair')) {
    return 'massage_chair';
  }
  if (title.includes('blood pressure monitor')) {
    return 'blood_pressure_monitor';
  }
  if (title.includes('thermometer')) {
    return 'thermometer';
  }
  
  // Automotive Electronics
  if (title.includes('car audio') || title.includes('car stereo')) {
    return 'car_audio';
  }
  if (title.includes('car charger')) {
    return 'car_charger';
  }
  if (title.includes('dash cam') || title.includes('dashboard camera')) {
    return 'dash_cam';
  }
  if (title.includes('gps tracker')) {
    return 'gps_tracker';
  }
  
  // Musical Instruments & Audio
  if (title.includes('guitar')) {
    return 'guitar';
  }
  if (title.includes('piano') || title.includes('keyboard')) {
    return 'piano';
  }
  if (title.includes('drum set') || title.includes('drums')) {
    return 'drum_set';
  }
  if (title.includes('dj') || title.includes('turntable')) {
    return 'dj_equipment';
  }
  
  // Photography & Videography
  if (title.includes('camera lens') || title.includes('lens')) {
    return 'camera_lens';
  }
  if (title.includes('tripod')) {
    return 'tripod';
  }
  if (title.includes('gimbal') || title.includes('stabilizer')) {
    return 'gimbal';
  }
  if (title.includes('drone') || title.includes('quadcopter')) {
    return 'drone';
  }
  
  // Tools & DIY
  if (title.includes('drill') || title.includes('drill machine')) {
    return 'drill';
  }
  if (title.includes('saw') || title.includes('cutting machine')) {
    return 'saw';
  }
  if (title.includes('welding machine') || title.includes('welder')) {
    return 'welding_machine';
  }
  if (title.includes('generator')) {
    return 'generator';
  }
  
  // Lighting & Electrical
  if (title.includes('led bulb') || title.includes('smart bulb')) {
    return 'led_bulb';
  }
  if (title.includes('ceiling fan')) {
    return 'ceiling_fan';
  }
  if (title.includes('inverter')) {
    return 'inverter';
  }
  if (title.includes('ups') || title.includes('uninterrupted power supply')) {
    return 'ups';
  }
  
  // Generic Categories (fallback)
  if (title.includes('smartphone') || title.includes('mobile') || title.includes('phone')) {
    return 'smartphone';
  }
  if (title.includes('laptop') || title.includes('notebook')) {
    return 'laptop';
  }
  if (title.includes('tablet')) {
    return 'tablet';
  }
  if (title.includes('smartwatch') || title.includes('watch')) {
    return 'smartwatch';
  }
  if ((title.includes('xiaomi') || title.includes('mi')) && title.includes('pad')) {
    return 'xiaomi_tab';
  }
  if (title.includes('realme') && title.includes('pad')) {
    return 'realme_tab';
  }
  if (title.includes('oneplus') && title.includes('pad')) {
    return 'oneplus_tab';
  }
  if (title.includes('huawei') && title.includes('pad')) {
    return 'huawei_tab';
  }
  
  // Smartwatches - Comprehensive
  if (title.includes('apple watch')) {
    return 'apple_watch';
  }
  if (title.includes('samsung') && title.includes('watch')) {
    return 'samsung_watch';
  }
  if (title.includes('fitbit')) {
    return 'fitbit';
  }
  if (title.includes('garmin')) {
    return 'garmin';
  }
  if (title.includes('huawei') && title.includes('watch')) {
    return 'huawei_watch';
  }
  if (title.includes('amazfit')) {
    return 'amazfit';
  }
  if (title.includes('realme') && title.includes('watch')) {
    return 'realme_watch';
  }
  if (title.includes('noise') && title.includes('watch')) {
    return 'noise_watch';
  }
  if (title.includes('boat') && title.includes('watch')) {
    return 'boat_watch';
  }
  
  // Headphones
  if (title.includes('airpods')) {
    return 'airpods';
  }
  if (title.includes('sony') && (title.includes('wh-') || title.includes('headphone'))) {
    return 'sony';
  }
  if (title.includes('bose')) {
    return 'bose';
  }
  
  // Cameras
  if (title.includes('canon')) {
    return 'canon';
  }
  if (title.includes('nikon')) {
    return 'nikon';
  }
  if (title.includes('sony') && (title.includes('alpha') || title.includes('a7') || title.includes('a9'))) {
    return 'sony_camera';
  }
  
  // Gaming
  if (title.includes('ps5') || title.includes('playstation 5')) {
    return 'ps5';
  }
  if (title.includes('xbox')) {
    return 'xbox';
  }
  
  // TVs
  if (title.includes('samsung') && title.includes('tv')) {
    return 'samsung_tv';
  }
  if (title.includes('lg') && title.includes('tv')) {
    return 'lg_tv';
  }
  
  // Kitchen Appliances
  if (title.includes('mixer') || title.includes('grinder')) {
    return 'mixer';
  }
  if (title.includes('refrigerator') || title.includes('fridge')) {
    return 'refrigerator';
  }
  if (title.includes('washing machine') || title.includes('washer')) {
    return 'washing_machine';
  }
  if (title.includes('microwave') || title.includes('oven')) {
    return 'microwave';
  }
  if (title.includes('air conditioner') || title.includes('ac')) {
    return 'air_conditioner';
  }
  
  // Computer Accessories
  if (title.includes('keyboard')) {
    return 'keyboard';
  }
  if (title.includes('mouse')) {
    return 'mouse';
  }
  if (title.includes('monitor') || title.includes('display')) {
    return 'monitor';
  }
  if (title.includes('webcam') || title.includes('camera')) {
    return 'webcam';
  }
  if (title.includes('printer')) {
    return 'printer';
  }
  
  // Networking
  if (title.includes('router') || title.includes('wifi')) {
    return 'router';
  }
  if (title.includes('modem')) {
    return 'modem';
  }
  if (title.includes('switch') && title.includes('network')) {
    return 'switch';
  }
  
  // Mobile Accessories
  if (title.includes('powerbank') || title.includes('power bank')) {
    return 'powerbank';
  }
  if (title.includes('charger') || title.includes('adapter')) {
    return 'mobile_charger';
  }
  if (title.includes('case') || title.includes('cover')) {
    return 'mobile_case';
  }
  if (title.includes('screen protector') || title.includes('tempered glass')) {
    return 'screen_protector';
  }
  
  // Audio Equipment
  if (title.includes('speaker') || title.includes('audio')) {
    return 'speaker';
  }
  if (title.includes('microphone') || title.includes('mic')) {
    return 'microphone';
  }
  if (title.includes('amplifier') || title.includes('amp')) {
    return 'amplifier';
  }
  
  // Storage Devices
  if (title.includes('hard disk') || title.includes('hdd')) {
    return 'hard_disk';
  }
  if (title.includes('ssd') || title.includes('solid state')) {
    return 'ssd';
  }
  if (title.includes('pendrive') || title.includes('usb')) {
    return 'pendrive';
  }
  
  // Gaming Accessories
  if (title.includes('controller') || title.includes('gamepad')) {
    return 'gaming_controller';
  }
  if (title.includes('gaming headset') || title.includes('headphone')) {
    return 'gaming_headset';
  }
  if (title.includes('gaming keyboard')) {
    return 'gaming_keyboard';
  }
  if (title.includes('gaming mouse')) {
    return 'gaming_mouse';
  }
  
  // Smart Home
  if (title.includes('smart bulb') || title.includes('led')) {
    return 'smart_bulb';
  }
  if (title.includes('smart plug') || title.includes('socket')) {
    return 'smart_plug';
  }
  if (title.includes('security camera') || title.includes('cctv')) {
    return 'security_camera';
  }
  if (title.includes('doorbell') || title.includes('smart doorbell')) {
    return 'doorbell';
  }
  
  return null;
};

// Generate optimized search query based on product category
const generateOptimizedSearchQuery = (productTitle, modelNumber, category) => {
  if (!category || !PRODUCT_CATEGORIES[category]) {
    return modelNumber ? `${productTitle} ${modelNumber}` : productTitle;
  }
  
  const rules = PRODUCT_CATEGORIES[category];
  let searchQuery = productTitle;
  
  // Add model number if available
  if (modelNumber) {
    searchQuery = `${productTitle} ${modelNumber}`;
  }
  
  // Special handling for MacBook M3 to ensure we get the right chip
  if (category === 'macbook' && productTitle.toLowerCase().includes('m3')) {
    // For M3 MacBooks, be very specific about the chip
    searchQuery = searchQuery.replace(/m3/gi, 'M3 chip');
    // Add exclusions for other chips
    searchQuery += ' -M1 -M2 -M4 -"M1 chip" -"M2 chip" -"M4 chip"';
  }
  
  // Special handling for iPhone to avoid older models
  if (category === 'iphone' && productTitle.toLowerCase().includes('iphone 15')) {
    searchQuery += ' -iphone 14 -iphone 13 -iphone 12 -"iphone 14" -"iphone 13" -"iphone 12"';
  }
  
  // Special handling for Samsung S24 to avoid FE variants
  if (category === 'samsung' && productTitle.toLowerCase().includes('s24')) {
    searchQuery += ' -FE -Ultra -Plus -S24FE -"S24 FE" -"S24FE"';
  }
  
  // Special handling for OnePlus 12 to avoid older models
  if (category === 'oneplus' && productTitle.toLowerCase().includes('oneplus 12')) {
    searchQuery += ' -oneplus 11 -oneplus 10 -"oneplus 11" -"oneplus 10"';
  }
  
  // Special handling for Xiaomi 14 to avoid older models
  if (category === 'xiaomi' && productTitle.toLowerCase().includes('xiaomi 14')) {
    searchQuery += ' -xiaomi 13 -xiaomi 12 -"xiaomi 13" -"xiaomi 12"';
  }
  
  // Special handling for Realme 12 to avoid older models
  if (category === 'realme' && productTitle.toLowerCase().includes('realme 12')) {
    searchQuery += ' -realme 11 -realme 10 -"realme 11" -"realme 10"';
  }
  
  // Special handling for OPPO Find X7 to avoid older models
  if (category === 'oppo' && productTitle.toLowerCase().includes('find x7')) {
    searchQuery += ' -find x6 -find x5 -"find x6" -"find x5"';
  }
  
  // Special handling for Vivo X100 to avoid older models
  if (category === 'vivo' && productTitle.toLowerCase().includes('x100')) {
    searchQuery += ' -x90 -x80 -"x90" -"x80"';
  }
  
  // Special handling for Nothing Phone 2 to avoid Phone 1
  if (category === 'nothing' && productTitle.toLowerCase().includes('phone 2')) {
    searchQuery += ' -phone 1 -"phone 1"';
  }
  
  // Special handling for Google Pixel 8 to avoid older models
  if (category === 'google' && productTitle.toLowerCase().includes('pixel 8')) {
    searchQuery += ' -pixel 7 -pixel 6 -"pixel 7" -"pixel 6"';
  }
  
  // Special handling for Huawei P70 to avoid older models
  if (category === 'huawei' && productTitle.toLowerCase().includes('p70')) {
    searchQuery += ' -p60 -p50 -"p60" -"p50"';
  }
  
  // Special handling for Honor 100 to avoid older models
  if (category === 'honor' && productTitle.toLowerCase().includes('honor 100')) {
    searchQuery += ' -honor 90 -honor 80 -"honor 90" -"honor 80"';
  }
  
  // Add exclusion terms
  if (rules.exclusions && rules.exclusions.length > 0) {
    const exclusionTerms = rules.exclusions.map(term => `-${term}`).join(' ');
    searchQuery += ` ${exclusionTerms}`;
  }
  
  // Add specific search terms for better results
  if (rules.searchTerms && rules.searchTerms.length > 0) {
    const searchTerms = rules.searchTerms.join(' ');
    if (!searchQuery.toLowerCase().includes(searchTerms.toLowerCase())) {
      searchQuery = `${searchTerms} ${searchQuery}`;
    }
  }
  
  return searchQuery;
};

// Validate product based on category rules
const validateProductByCategory = (title, price, category, modelNumber = null) => {
  if (!category || !PRODUCT_CATEGORIES[category]) {
    return true; // No validation rules, accept all
  }
  
  const rules = PRODUCT_CATEGORIES[category];
  const titleLower = title.toLowerCase();
  
  // Check exclusions
  if (rules.exclusions) {
    for (const exclusion of rules.exclusions) {
      if (titleLower.includes(exclusion.toLowerCase())) {
        console.log(`Product excluded due to ${exclusion}:`, title);
        return false;
      }
    }
  }
  
  // Check price range
  if (rules.priceRange && price) {
    if (price < rules.priceRange.min || price > rules.priceRange.max) {
      console.log(`Price ${price} outside range ${rules.priceRange.min}-${rules.priceRange.max}:`, title);
      return false;
    }
  }
  
  // Check if it contains required search terms
  if (rules.searchTerms) {
    const hasRequiredTerm = rules.searchTerms.some(term => 
      titleLower.includes(term.toLowerCase())
    );
    if (!hasRequiredTerm) {
      console.log(`Missing required search term for ${category}:`, title);
      return false;
    }
  }
  
  // Comprehensive specifications validation
  if (modelNumber) {
    const specsMatch = validateProductSpecifications(title, modelNumber, category);
    if (!specsMatch) {
      console.log(`Specifications mismatch for ${modelNumber}:`, title);
      return false;
    }
  }
  
  return true;
};

// Comprehensive product validation based on model number and specifications
const validateProductSpecifications = (title, modelNumber, category) => {
  const titleLower = title.toLowerCase();
  
  // Smartphones validation
  if (category === 'iphone' || category === 'samsung' || category === 'smartphone') {
    return validateSmartphoneSpecs(titleLower, modelNumber);
  }
  
  // Laptops validation
  if (category === 'macbook' || category === 'dell' || category === 'hp' || category === 'lenovo' || category === 'laptop') {
    return validateLaptopSpecs(titleLower, modelNumber);
  }
  
  // Tablets validation
  if (category === 'ipad' || category === 'tablet') {
    return validateTabletSpecs(titleLower, modelNumber);
  }
  
  // Smartwatches validation
  if (category === 'smartwatch' || category === 'apple-watch') {
    return validateSmartwatchSpecs(titleLower, modelNumber);
  }
  
  // Kitchen appliances validation
  if (category === 'mixer' || category === 'refrigerator' || category === 'washing-machine' || category === 'microwave') {
    return validateKitchenApplianceSpecs(titleLower, modelNumber);
  }
  
  // Computer accessories validation
  if (category === 'keyboard' || category === 'mouse' || category === 'monitor' || category === 'printer') {
    return validateComputerAccessorySpecs(titleLower, modelNumber);
  }
  
  // Networking validation
  if (category === 'router' || category === 'modem') {
    return validateNetworkingSpecs(titleLower, modelNumber);
  }
  
  // Power and charging validation
  if (category === 'powerbank' || category === 'charger') {
    return validatePowerSpecs(titleLower, modelNumber);
  }
  
  // Gaming validation
  if (category === 'ps5' || category === 'xbox' || category === 'gaming_controller' || 
      category === 'gaming_headset' || category === 'gaming_keyboard' || category === 'gaming_mouse') {
    return validateGamingSpecs(titleLower, modelNumber);
  }
  
  return true; // Default validation for unknown categories
};

// Smartphone specifications validation
const validateSmartphoneSpecs = (titleLower, modelNumber) => {
  // iPhone models
  if (modelNumber?.includes('A3090')) { // iPhone 15 128GB
    return !titleLower.includes('256gb') && !titleLower.includes('512gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('pro max') && !titleLower.includes('pro') && !titleLower.includes('plus') &&
           !titleLower.includes('mini') && !titleLower.includes('se');
  }
  if (modelNumber?.includes('A3092')) { // iPhone 15 256GB
    return !titleLower.includes('128gb') && !titleLower.includes('512gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('pro max') && !titleLower.includes('pro') && !titleLower.includes('plus') &&
           !titleLower.includes('mini') && !titleLower.includes('se');
  }
  if (modelNumber?.includes('A3094')) { // iPhone 15 512GB
    return !titleLower.includes('128gb') && !titleLower.includes('256gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('pro max') && !titleLower.includes('pro') && !titleLower.includes('plus') &&
           !titleLower.includes('mini') && !titleLower.includes('se');
  }
  if (modelNumber?.includes('A3102')) { // iPhone 15 Pro 128GB
    return !titleLower.includes('256gb') && !titleLower.includes('512gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('pro max') && !titleLower.includes('plus') && !titleLower.includes('mini') &&
           !titleLower.includes('se') && titleLower.includes('pro');
  }
  if (modelNumber?.includes('A3104')) { // iPhone 15 Pro Max 256GB
    return !titleLower.includes('128gb') && !titleLower.includes('512gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('pro') && !titleLower.includes('plus') && !titleLower.includes('mini') &&
           !titleLower.includes('se') && titleLower.includes('pro max');
  }
  
  // Samsung models
  if (modelNumber?.includes('SM-S921B')) { // Samsung S24 128GB
    // Exclude FE, Ultra, Plus variants and wrong storage
    return !titleLower.includes('256gb') && !titleLower.includes('512gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('fe') && !titleLower.includes('ultra') && !titleLower.includes('plus') &&
           !titleLower.includes('s24 fe') && !titleLower.includes('s24fe');
  }
  if (modelNumber?.includes('SM-S921BZGAINU')) { // Samsung S24 256GB
    // Exclude FE, Ultra, Plus variants and wrong storage
    return !titleLower.includes('128gb') && !titleLower.includes('512gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('fe') && !titleLower.includes('ultra') && !titleLower.includes('plus') &&
           !titleLower.includes('s24 fe') && !titleLower.includes('s24fe');
  }
  
  // Samsung S24 specific validation
  if (titleLower.includes('samsung') && titleLower.includes('s24')) {
    // Exclude FE, Ultra, Plus variants
    if (titleLower.includes('fe') || titleLower.includes('ultra') || titleLower.includes('plus')) {
      return false;
    }
    // Must contain standard S24 terms
    return titleLower.includes('s24') && !titleLower.includes('s24 fe') && !titleLower.includes('s24fe');
  }
  
  // OnePlus models
  if (modelNumber?.includes('CPH2411')) { // OnePlus 12 256GB
    return !titleLower.includes('128gb') && !titleLower.includes('512gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('nord') && !titleLower.includes('ce') && !titleLower.includes('r');
  }
  if (modelNumber?.includes('CPH2413')) { // OnePlus 12 512GB
    return !titleLower.includes('128gb') && !titleLower.includes('256gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('nord') && !titleLower.includes('ce') && !titleLower.includes('r');
  }
  
  // Xiaomi models
  if (modelNumber?.includes('2311DRK48C')) { // Xiaomi 14 256GB
    return !titleLower.includes('128gb') && !titleLower.includes('512gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('redmi') && !titleLower.includes('poco') && !titleLower.includes('note');
  }
  if (modelNumber?.includes('2311DRK48I')) { // Xiaomi 14 512GB
    return !titleLower.includes('128gb') && !titleLower.includes('256gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('redmi') && !titleLower.includes('poco') && !titleLower.includes('note');
  }
  
  // Realme models
  if (modelNumber?.includes('RMX3700')) { // Realme GT Neo 5 256GB
    return !titleLower.includes('128gb') && !titleLower.includes('512gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('narzo') && !titleLower.includes('c series') && !titleLower.includes('number');
  }
  
  // OPPO models
  if (modelNumber?.includes('CPH2411')) { // OPPO Find X7 256GB
    return !titleLower.includes('128gb') && !titleLower.includes('512gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('a series') && !titleLower.includes('reno lite') && !titleLower.includes('f series');
  }
  
  // Vivo models
  if (modelNumber?.includes('V2307')) { // Vivo X100 256GB
    return !titleLower.includes('128gb') && !titleLower.includes('512gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('y series') && !titleLower.includes('v series') && !titleLower.includes('t series');
  }
  
  // Nothing models
  if (modelNumber?.includes('A063')) { // Nothing Phone 2 256GB
    return !titleLower.includes('128gb') && !titleLower.includes('512gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('basic') && !titleLower.includes('cheap') && !titleLower.includes('lite');
  }
  
  // Google models
  if (modelNumber?.includes('G1MNW')) { // Google Pixel 8 256GB
    return !titleLower.includes('128gb') && !titleLower.includes('512gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('a series') && !titleLower.includes('basic') && !titleLower.includes('cheap');
  }
  
  // RAM validation for smartphones
  if (titleLower.includes('4gb ram') && !modelNumber?.includes('4gb')) return false;
  if (titleLower.includes('6gb ram') && !modelNumber?.includes('6gb')) return false;
  if (titleLower.includes('8gb ram') && !modelNumber?.includes('8gb')) return false;
  if (titleLower.includes('12gb ram') && !modelNumber?.includes('12gb')) return false;
  if (titleLower.includes('16gb ram') && !modelNumber?.includes('16gb')) return false;
  
  return true;
};

// Laptop specifications validation
const validateLaptopSpecs = (titleLower, modelNumber) => {
  // MacBook models
  if (modelNumber === 'MLY33HN/A') { // MacBook Air M3 128GB
    return !titleLower.includes('256gb') && !titleLower.includes('512gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('m1') && !titleLower.includes('m2') && !titleLower.includes('m4') &&
           !titleLower.includes('pro') && titleLower.includes('air') && 
           (titleLower.includes('m3') || titleLower.includes('m3 chip'));
  }
  if (modelNumber === 'MLY34HN/A') { // MacBook Air M3 256GB
    return !titleLower.includes('128gb') && !titleLower.includes('512gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('m1') && !titleLower.includes('m2') && !titleLower.includes('m4') &&
           !titleLower.includes('pro') && titleLower.includes('air') && 
           (titleLower.includes('m3') || titleLower.includes('m3 chip'));
  }
  if (modelNumber === 'MTV93HN/A') { // MacBook Pro M3 256GB
    return !titleLower.includes('128gb') && !titleLower.includes('512gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('m1') && !titleLower.includes('m2') && !titleLower.includes('m4') &&
           !titleLower.includes('air') && titleLower.includes('pro') && 
           (titleLower.includes('m3') || titleLower.includes('m3 chip'));
  }
  if (modelNumber === 'MTV94HN/A') { // MacBook Pro M3 512GB
    return !titleLower.includes('128gb') && !titleLower.includes('256gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('m1') && !titleLower.includes('m2') && !titleLower.includes('m4') &&
           !titleLower.includes('air') && titleLower.includes('pro') && 
           (titleLower.includes('m3') || titleLower.includes('m3 chip'));
  }
  
  // Dell models
  if (modelNumber?.includes('D560152WIN9BE')) { // Dell Inspiron 15
    return (titleLower.includes('inspiron') || titleLower.includes('dell')) &&
           !titleLower.includes('xps') && !titleLower.includes('latitude') && !titleLower.includes('precision');
  }
  if (modelNumber?.includes('XPS13')) { // Dell XPS 13
    return titleLower.includes('xps') && !titleLower.includes('inspiron') && !titleLower.includes('latitude');
  }
  if (modelNumber?.includes('LATITUDE')) { // Dell Latitude
    return titleLower.includes('latitude') && !titleLower.includes('inspiron') && !titleLower.includes('xps');
  }
  
  // HP models
  if (modelNumber?.includes('HP15S')) { // HP Pavilion
    return (titleLower.includes('pavilion') || titleLower.includes('hp')) &&
           !titleLower.includes('elitebook') && !titleLower.includes('spectre') && !titleLower.includes('omen');
  }
  if (modelNumber?.includes('ELITEBOOK')) { // HP EliteBook
    return titleLower.includes('elitebook') && !titleLower.includes('pavilion') && !titleLower.includes('spectre');
  }
  if (modelNumber?.includes('SPECTRE')) { // HP Spectre
    return titleLower.includes('spectre') && !titleLower.includes('pavilion') && !titleLower.includes('elitebook');
  }
  
  // Lenovo models
  if (modelNumber?.includes('THINKPAD')) { // Lenovo ThinkPad
    return titleLower.includes('thinkpad') && !titleLower.includes('ideapad') && !titleLower.includes('yoga');
  }
  if (modelNumber?.includes('IDEAPAD')) { // Lenovo IdeaPad
    return titleLower.includes('ideapad') && !titleLower.includes('thinkpad') && !titleLower.includes('yoga');
  }
  if (modelNumber?.includes('YOGA')) { // Lenovo Yoga
    return titleLower.includes('yoga') && !titleLower.includes('thinkpad') && !titleLower.includes('ideapad');
  }
  
  // ASUS models
  if (modelNumber?.includes('ROG')) { // ASUS ROG
    return titleLower.includes('rog') && !titleLower.includes('zenbook') && !titleLower.includes('vivobook');
  }
  if (modelNumber?.includes('ZENBOOK')) { // ASUS ZenBook
    return titleLower.includes('zenbook') && !titleLower.includes('rog') && !titleLower.includes('vivobook');
  }
  if (modelNumber?.includes('VIVOBOOK')) { // ASUS VivoBook
    return titleLower.includes('vivobook') && !titleLower.includes('rog') && !titleLower.includes('zenbook');
  }
  
  // Acer models
  if (modelNumber?.includes('PREDATOR')) { // Acer Predator
    return titleLower.includes('predator') && !titleLower.includes('aspire') && !titleLower.includes('swift');
  }
  if (modelNumber?.includes('ASPIRE')) { // Acer Aspire
    return titleLower.includes('aspire') && !titleLower.includes('predator') && !titleLower.includes('swift');
  }
  if (modelNumber?.includes('SWIFT')) { // Acer Swift
    return titleLower.includes('swift') && !titleLower.includes('predator') && !titleLower.includes('aspire');
  }
  
  // RAM validation for laptops
  if (titleLower.includes('4gb ram') && !modelNumber?.includes('4gb')) return false;
  if (titleLower.includes('8gb ram') && !modelNumber?.includes('8gb')) return false;
  if (titleLower.includes('16gb ram') && !modelNumber?.includes('16gb')) return false;
  if (titleLower.includes('32gb ram') && !modelNumber?.includes('32gb')) return false;
  
  // Processor validation
  if (titleLower.includes('i3') && !modelNumber?.includes('i3')) return false;
  if (titleLower.includes('i5') && !modelNumber?.includes('i5')) return false;
  if (titleLower.includes('i7') && !modelNumber?.includes('i7')) return false;
  if (titleLower.includes('i9') && !modelNumber?.includes('i9')) return false;
  if (titleLower.includes('ryzen') && !modelNumber?.includes('ryzen')) return false;
  
  return true;
};

// Tablet specifications validation
const validateTabletSpecs = (titleLower, modelNumber) => {
  // iPad models
  if (modelNumber?.includes('A2562')) { // iPad Air 64GB
    return !titleLower.includes('128gb') && !titleLower.includes('256gb') &&
           !titleLower.includes('pro') && !titleLower.includes('mini') && titleLower.includes('air');
  }
  if (modelNumber?.includes('A2563')) { // iPad Air 128GB
    return !titleLower.includes('64gb') && !titleLower.includes('256gb') &&
           !titleLower.includes('pro') && !titleLower.includes('mini') && titleLower.includes('air');
  }
  if (modelNumber?.includes('A2436')) { // iPad Pro 11-inch 128GB
    return !titleLower.includes('256gb') && !titleLower.includes('512gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('air') && !titleLower.includes('mini') && titleLower.includes('pro');
  }
  if (modelNumber?.includes('A2437')) { // iPad Pro 12.9-inch 128GB
    return !titleLower.includes('256gb') && !titleLower.includes('512gb') && !titleLower.includes('1tb') &&
           !titleLower.includes('air') && !titleLower.includes('mini') && titleLower.includes('pro') &&
           titleLower.includes('12.9');
  }
  if (modelNumber?.includes('A2567')) { // iPad Mini 64GB
    return !titleLower.includes('128gb') && !titleLower.includes('256gb') &&
           !titleLower.includes('pro') && !titleLower.includes('air') && titleLower.includes('mini');
  }
  
  // Samsung tablets
  if (modelNumber?.includes('SM-X700')) { // Samsung Tab S9 128GB
    return !titleLower.includes('256gb') && !titleLower.includes('512gb') &&
           !titleLower.includes('fe') && !titleLower.includes('ultra') && !titleLower.includes('lite');
  }
  if (modelNumber?.includes('SM-X800')) { // Samsung Tab S9+ 256GB
    return !titleLower.includes('128gb') && !titleLower.includes('512gb') &&
           !titleLower.includes('fe') && !titleLower.includes('ultra') && !titleLower.includes('lite') &&
           titleLower.includes('s9+');
  }
  if (modelNumber?.includes('SM-X900')) { // Samsung Tab S9 Ultra 512GB
    return !titleLower.includes('128gb') && !titleLower.includes('256gb') &&
           !titleLower.includes('fe') && !titleLower.includes('lite') && titleLower.includes('ultra');
  }
  
  // Lenovo tablets
  if (modelNumber?.includes('TB-X606F')) { // Lenovo Tab P11 128GB
    return !titleLower.includes('256gb') && !titleLower.includes('512gb') &&
           !titleLower.includes('pro') && !titleLower.includes('plus') && titleLower.includes('p11');
  }
  
  // Xiaomi tablets
  if (modelNumber?.includes('23046RP34C')) { // Xiaomi Pad 6 128GB
    return !titleLower.includes('256gb') && !titleLower.includes('512gb') &&
           !titleLower.includes('pro') && !titleLower.includes('plus') && titleLower.includes('pad 6');
  }
  
  return true;
};

// Smartwatch specifications validation
const validateSmartwatchSpecs = (titleLower, modelNumber) => {
  // Apple Watch models
  if (modelNumber?.includes('MTPF3HN/A')) { // Apple Watch Series 9 41mm
    return !titleLower.includes('45mm') && !titleLower.includes('49mm') &&
           !titleLower.includes('ultra') && !titleLower.includes('se') && titleLower.includes('series 9');
  }
  if (modelNumber?.includes('MTPF4HN/A')) { // Apple Watch Series 9 45mm
    return !titleLower.includes('41mm') && !titleLower.includes('49mm') &&
           !titleLower.includes('ultra') && !titleLower.includes('se') && titleLower.includes('series 9');
  }
  if (modelNumber?.includes('MTPF5HN/A')) { // Apple Watch Ultra 49mm
    return !titleLower.includes('41mm') && !titleLower.includes('45mm') &&
           !titleLower.includes('series 9') && !titleLower.includes('se') && titleLower.includes('ultra');
  }
  if (modelNumber?.includes('MTPF6HN/A')) { // Apple Watch SE 40mm
    return !titleLower.includes('44mm') && !titleLower.includes('41mm') &&
           !titleLower.includes('series 9') && !titleLower.includes('ultra') && titleLower.includes('se');
  }
  
  // Samsung Galaxy Watch
  if (modelNumber?.includes('SM-R955F')) { // Galaxy Watch 6 40mm
    return !titleLower.includes('44mm') && !titleLower.includes('47mm') &&
           !titleLower.includes('classic') && !titleLower.includes('pro') && titleLower.includes('watch 6');
  }
  if (modelNumber?.includes('SM-R955F')) { // Galaxy Watch 6 44mm
    return !titleLower.includes('40mm') && !titleLower.includes('47mm') &&
           !titleLower.includes('classic') && !titleLower.includes('pro') && titleLower.includes('watch 6');
  }
  if (modelNumber?.includes('SM-R955F')) { // Galaxy Watch 6 Classic 47mm
    return !titleLower.includes('40mm') && !titleLower.includes('44mm') &&
           !titleLower.includes('pro') && titleLower.includes('classic');
  }
  
  // Fitbit models
  if (modelNumber?.includes('FB507BKBK')) { // Fitbit Versa 4
    return !titleLower.includes('sense') && !titleLower.includes('charge') && !titleLower.includes('inspire') &&
           titleLower.includes('versa');
  }
  if (modelNumber?.includes('FB511BKBK')) { // Fitbit Sense 2
    return !titleLower.includes('versa') && !titleLower.includes('charge') && !titleLower.includes('inspire') &&
           titleLower.includes('sense');
  }
  
  // Garmin models
  if (modelNumber?.includes('010-02541-00')) { // Garmin Fenix 7
    return !titleLower.includes('forerunner') && !titleLower.includes('vivoactive') && !titleLower.includes('venu') &&
           titleLower.includes('fenix');
  }
  if (modelNumber?.includes('010-02542-00')) { // Garmin Forerunner 955
    return !titleLower.includes('fenix') && !titleLower.includes('vivoactive') && !titleLower.includes('venu') &&
           titleLower.includes('forerunner');
  }
  
  return true;
};

// Kitchen appliance specifications validation
const validateKitchenApplianceSpecs = (titleLower, modelNumber) => {
  // Washing machine capacity and type
  if (modelNumber?.includes('6kg') && !titleLower.includes('6kg')) return false;
  if (modelNumber?.includes('7kg') && !titleLower.includes('7kg')) return false;
  if (modelNumber?.includes('8kg') && !titleLower.includes('8kg')) return false;
  if (modelNumber?.includes('10kg') && !titleLower.includes('10kg')) return false;
  
  // Washing machine type validation
  if (titleLower.includes('front load') && !titleLower.includes('front')) return false;
  if (titleLower.includes('top load') && !titleLower.includes('top')) return false;
  if (titleLower.includes('semi automatic') && !titleLower.includes('semi')) return false;
  
  // Refrigerator capacity and type
  if (modelNumber?.includes('190l') && !titleLower.includes('190l')) return false;
  if (modelNumber?.includes('260l') && !titleLower.includes('260l')) return false;
  if (modelNumber?.includes('320l') && !titleLower.includes('320l')) return false;
  
  // Refrigerator type validation
  if (titleLower.includes('side by side') && !titleLower.includes('side')) return false;
  if (titleLower.includes('french door') && !titleLower.includes('french')) return false;
  if (titleLower.includes('bottom freezer') && !titleLower.includes('bottom')) return false;
  
  // Microwave power and type
  if (modelNumber?.includes('700w') && !titleLower.includes('700w')) return false;
  if (modelNumber?.includes('800w') && !titleLower.includes('800w')) return false;
  if (modelNumber?.includes('1000w') && !titleLower.includes('1000w')) return false;
  
  // Microwave type validation
  if (titleLower.includes('convection') && !titleLower.includes('convection')) return false;
  if (titleLower.includes('grill') && !titleLower.includes('grill')) return false;
  if (titleLower.includes('solo') && !titleLower.includes('solo')) return false;
  
  // Air conditioner capacity and type
  if (modelNumber?.includes('1 ton') && !titleLower.includes('1 ton')) return false;
  if (modelNumber?.includes('1.5 ton') && !titleLower.includes('1.5 ton')) return false;
  if (modelNumber?.includes('2 ton') && !titleLower.includes('2 ton')) return false;
  
  // AC type validation
  if (titleLower.includes('split') && !titleLower.includes('split')) return false;
  if (titleLower.includes('inverter') && !titleLower.includes('inverter')) return false;
  if (titleLower.includes('window') && !titleLower.includes('window')) return false;
  
  // Dishwasher capacity and type
  if (modelNumber?.includes('12 place') && !titleLower.includes('12 place')) return false;
  if (modelNumber?.includes('14 place') && !titleLower.includes('14 place')) return false;
  
  // Dishwasher type validation
  if (titleLower.includes('built-in') && !titleLower.includes('built-in')) return false;
  if (titleLower.includes('freestanding') && !titleLower.includes('freestanding')) return false;
  if (titleLower.includes('drawer') && !titleLower.includes('drawer')) return false;
  
  // Coffee maker type validation
  if (titleLower.includes('espresso') && !titleLower.includes('espresso')) return false;
  if (titleLower.includes('drip') && !titleLower.includes('drip')) return false;
  if (titleLower.includes('french press') && !titleLower.includes('french press')) return false;
  
  // Water purifier type validation
  if (titleLower.includes('ro') && !titleLower.includes('ro')) return false;
  if (titleLower.includes('uv') && !titleLower.includes('uv')) return false;
  if (titleLower.includes('uf') && !titleLower.includes('uf')) return false;
  
  return true;
};

// Computer accessory specifications validation
const validateComputerAccessorySpecs = (titleLower, modelNumber) => {
  // Monitor size and type
  if (modelNumber?.includes('24inch') && !titleLower.includes('24')) return false;
  if (modelNumber?.includes('27inch') && !titleLower.includes('27')) return false;
  if (modelNumber?.includes('32inch') && !titleLower.includes('32')) return false;
  if (modelNumber?.includes('34inch') && !titleLower.includes('34')) return false;
  if (modelNumber?.includes('49inch') && !titleLower.includes('49')) return false;
  
  // Monitor type validation
  if (titleLower.includes('gaming') && !titleLower.includes('gaming')) return false;
  if (titleLower.includes('ultrawide') && !titleLower.includes('ultrawide')) return false;
  if (titleLower.includes('4k') && !titleLower.includes('4k')) return false;
  if (titleLower.includes('curved') && !titleLower.includes('curved')) return false;
  if (titleLower.includes('ips') && !titleLower.includes('ips')) return false;
  if (titleLower.includes('va') && !titleLower.includes('va')) return false;
  if (titleLower.includes('tn') && !titleLower.includes('tn')) return false;
  
  // Keyboard type and switches
  if (modelNumber?.includes('mechanical') && !titleLower.includes('mechanical')) return false;
  if (modelNumber?.includes('membrane') && !titleLower.includes('membrane')) return false;
  if (modelNumber?.includes('wireless') && !titleLower.includes('wireless')) return false;
  if (modelNumber?.includes('gaming') && !titleLower.includes('gaming')) return false;
  
  // Keyboard switch validation
  if (titleLower.includes('cherry mx') && !titleLower.includes('cherry mx')) return false;
  if (titleLower.includes('blue switch') && !titleLower.includes('blue')) return false;
  if (titleLower.includes('red switch') && !titleLower.includes('red')) return false;
  if (titleLower.includes('brown switch') && !titleLower.includes('brown')) return false;
  
  // Mouse DPI and type
  if (modelNumber?.includes('1200dpi') && !titleLower.includes('1200')) return false;
  if (modelNumber?.includes('2400dpi') && !titleLower.includes('2400')) return false;
  if (modelNumber?.includes('8000dpi') && !titleLower.includes('8000')) return false;
  if (modelNumber?.includes('16000dpi') && !titleLower.includes('16000')) return false;
  
  // Mouse type validation
  if (titleLower.includes('wireless') && !titleLower.includes('wireless')) return false;
  if (titleLower.includes('gaming') && !titleLower.includes('gaming')) return false;
  if (titleLower.includes('optical') && !titleLower.includes('optical')) return false;
  if (titleLower.includes('laser') && !titleLower.includes('laser')) return false;
  
  // Webcam resolution and type
  if (modelNumber?.includes('1080p') && !titleLower.includes('1080p')) return false;
  if (modelNumber?.includes('4k') && !titleLower.includes('4k')) return false;
  if (modelNumber?.includes('720p') && !titleLower.includes('720p')) return false;
  
  // Webcam type validation
  if (titleLower.includes('streaming') && !titleLower.includes('streaming')) return false;
  if (titleLower.includes('logitech') && !titleLower.includes('logitech')) return false;
  if (titleLower.includes('autofocus') && !titleLower.includes('autofocus')) return false;
  
  // Printer type and features
  if (titleLower.includes('laser') && !titleLower.includes('laser')) return false;
  if (titleLower.includes('inkjet') && !titleLower.includes('inkjet')) return false;
  if (titleLower.includes('all in one') && !titleLower.includes('all in one')) return false;
  if (titleLower.includes('wireless') && !titleLower.includes('wireless')) return false;
  if (titleLower.includes('wifi') && !titleLower.includes('wifi')) return false;
  
  // Storage device capacity and type
  if (modelNumber?.includes('1tb') && !titleLower.includes('1tb')) return false;
  if (modelNumber?.includes('2tb') && !titleLower.includes('2tb')) return false;
  if (modelNumber?.includes('4tb') && !titleLower.includes('4tb')) return false;
  if (modelNumber?.includes('8tb') && !titleLower.includes('8tb')) return false;
  
  // Storage type validation
  if (titleLower.includes('external') && !titleLower.includes('external')) return false;
  if (titleLower.includes('internal') && !titleLower.includes('internal')) return false;
  if (titleLower.includes('portable') && !titleLower.includes('portable')) return false;
  if (titleLower.includes('ssd') && !titleLower.includes('ssd')) return false;
  if (titleLower.includes('hdd') && !titleLower.includes('hdd')) return false;
  if (titleLower.includes('nvme') && !titleLower.includes('nvme')) return false;
  if (titleLower.includes('sata') && !titleLower.includes('sata')) return false;
  
  // Pendrive capacity and type
  if (modelNumber?.includes('32gb') && !titleLower.includes('32gb')) return false;
  if (modelNumber?.includes('64gb') && !titleLower.includes('64gb')) return false;
  if (modelNumber?.includes('128gb') && !titleLower.includes('128gb')) return false;
  if (modelNumber?.includes('256gb') && !titleLower.includes('256gb')) return false;
  
  // Pendrive type validation
  if (titleLower.includes('type c') && !titleLower.includes('type c')) return false;
  if (titleLower.includes('usb 3.0') && !titleLower.includes('usb 3.0')) return false;
  if (titleLower.includes('usb 3.1') && !titleLower.includes('usb 3.1')) return false;
  if (titleLower.includes('usb 3.2') && !titleLower.includes('usb 3.2')) return false;
  
  return true;
};

// Networking specifications validation
const validateNetworkingSpecs = (titleLower, modelNumber) => {
  // Router speed
  if (modelNumber?.includes('150mbps') && !titleLower.includes('150')) return false;
  if (modelNumber?.includes('300mbps') && !titleLower.includes('300')) return false;
  if (modelNumber?.includes('1200mbps') && !titleLower.includes('1200')) return false;
  
  // WiFi standard
  if (modelNumber?.includes('wifi6') && !titleLower.includes('wifi 6')) return false;
  if (modelNumber?.includes('wifi5') && !titleLower.includes('wifi 5')) return false;
  
  return true;
};

// Gaming specifications validation
const validateGamingSpecs = (titleLower, modelNumber) => {
  // Gaming controller type and features
  if (modelNumber?.includes('wireless') && !titleLower.includes('wireless')) return false;
  if (modelNumber?.includes('pro') && !titleLower.includes('pro')) return false;
  if (modelNumber?.includes('elite') && !titleLower.includes('elite')) return false;
  if (modelNumber?.includes('xbox') && !titleLower.includes('xbox')) return false;
  if (modelNumber?.includes('playstation') && !titleLower.includes('playstation')) return false;
  if (modelNumber?.includes('ps5') && !titleLower.includes('ps5')) return false;
  if (modelNumber?.includes('ps4') && !titleLower.includes('ps4')) return false;
  
  // Gaming controller validation
  if (titleLower.includes('xbox controller') && !titleLower.includes('xbox')) return false;
  if (titleLower.includes('playstation controller') && !titleLower.includes('playstation')) return false;
  if (titleLower.includes('dual sense') && !titleLower.includes('dual sense')) return false;
  if (titleLower.includes('dual shock') && !titleLower.includes('dual shock')) return false;
  if (titleLower.includes('adaptive triggers') && !titleLower.includes('adaptive')) return false;
  if (titleLower.includes('haptic feedback') && !titleLower.includes('haptic')) return false;
  
  // Gaming headset type and features
  if (titleLower.includes('wireless') && !titleLower.includes('wireless')) return false;
  if (titleLower.includes('surround') && !titleLower.includes('surround')) return false;
  if (titleLower.includes('rgb') && !titleLower.includes('rgb')) return false;
  if (titleLower.includes('7.1') && !titleLower.includes('7.1')) return false;
  if (titleLower.includes('5.1') && !titleLower.includes('5.1')) return false;
  if (titleLower.includes('noise cancelling') && !titleLower.includes('noise')) return false;
  if (titleLower.includes('detachable mic') && !titleLower.includes('detachable')) return false;
  
  // Gaming keyboard type and features
  if (titleLower.includes('mechanical') && !titleLower.includes('mechanical')) return false;
  if (titleLower.includes('rgb') && !titleLower.includes('rgb')) return false;
  if (titleLower.includes('wireless') && !titleLower.includes('wireless')) return false;
  if (titleLower.includes('gaming') && !titleLower.includes('gaming')) return false;
  if (titleLower.includes('macro keys') && !titleLower.includes('macro')) return false;
  if (titleLower.includes('programmable') && !titleLower.includes('programmable')) return false;
  
  // Gaming mouse type and features
  if (titleLower.includes('rgb') && !titleLower.includes('rgb')) return false;
  if (titleLower.includes('wireless') && !titleLower.includes('wireless')) return false;
  if (titleLower.includes('high dpi') && !titleLower.includes('high dpi')) return false;
  if (titleLower.includes('programmable') && !titleLower.includes('programmable')) return false;
  if (titleLower.includes('adjustable dpi') && !titleLower.includes('adjustable')) return false;
  if (titleLower.includes('optical sensor') && !titleLower.includes('optical')) return false;
  if (titleLower.includes('laser sensor') && !titleLower.includes('laser')) return false;
  
  // Gaming console validation
  if (titleLower.includes('playstation 5') && !titleLower.includes('ps5')) return false;
  if (titleLower.includes('playstation 4') && !titleLower.includes('ps4')) return false;
  if (titleLower.includes('xbox series x') && !titleLower.includes('series x')) return false;
  if (titleLower.includes('xbox series s') && !titleLower.includes('series s')) return false;
  if (titleLower.includes('xbox one') && !titleLower.includes('xbox one')) return false;
  
  // Gaming console type validation
  if (titleLower.includes('digital edition') && !titleLower.includes('digital')) return false;
  if (titleLower.includes('disc edition') && !titleLower.includes('disc')) return false;
  if (titleLower.includes('slim') && !titleLower.includes('slim')) return false;
  if (titleLower.includes('pro') && !titleLower.includes('pro')) return false;
  
  return true;
};

// Power specifications validation
const validatePowerSpecs = (titleLower, modelNumber) => {
  // Powerbank capacity
  if (modelNumber?.includes('10000mah') && !titleLower.includes('10000')) return false;
  if (modelNumber?.includes('20000mah') && !titleLower.includes('20000')) return false;
  if (modelNumber?.includes('30000mah') && !titleLower.includes('30000')) return false;
  
  // Charger power
  if (modelNumber?.includes('18w') && !titleLower.includes('18w')) return false;
  if (modelNumber?.includes('25w') && !titleLower.includes('25w')) return false;
  if (modelNumber?.includes('65w') && !titleLower.includes('65w')) return false;
  
  return true;
};

// EAN code validation function
const isValidEAN = (eanCode) => {
  if (!eanCode || typeof eanCode !== 'string') return false;
  
  // Remove any non-digit characters
  const cleanEAN = eanCode.replace(/\D/g, '');
  
  // Check if it's 13 digits (standard EAN-13)
  if (cleanEAN.length === 13) {
    return true;
  }
  
  // Check if it's 12 digits (UPC-A)
  if (cleanEAN.length === 12) {
    return true;
  }
  
  // Check if it's 8 digits (EAN-8)
  if (cleanEAN.length === 8) {
    return true;
  }
  
  return false;
};

// Clean EAN code for search
const cleanEANCode = (eanCode) => {
  if (!eanCode) return null;
  return eanCode.replace(/\D/g, '');
};

// Extract brand name from product title
// Extract chip/model information dynamically from productTitle (e.g., M1, M2, M3, M4, M5, etc.)
const extractChipInfoFromTitle = (productTitle) => {
  if (!productTitle) return null;
  
  const titleLower = productTitle.toLowerCase();
  
  // Check if it's a MacBook or similar product that uses chip models
  if (!titleLower.includes('macbook') && !titleLower.includes('chip')) {
    return null;
  }
  
  // Extract chip model using regex (M followed by a number)
  const chipMatch = titleLower.match(/\bm([1-9]\d*)\b/);
  if (!chipMatch) {
    return null;
  }
  
  const chipNumber = chipMatch[1];
  const chipModel = `M${chipNumber}`;
  
  // Generate list of other chips to exclude dynamically
  // Common chips: M1-M10, but we'll exclude any chip that's not the found one
  const commonChips = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'];
  const otherChips = commonChips.filter(chip => chip !== chipModel);
  
  // Also add the specific chip number pattern to exclude (e.g., if M5, exclude M1, M2, M3, M4, M6, etc.)
  // This ensures we exclude all other chip models dynamically
  
  return {
    chipModel: chipModel,
    chipNumber: parseInt(chipNumber),
    otherChips: otherChips,
    chipLower: chipModel.toLowerCase(),
    chipWithChip: `${chipModel} chip`
  };
};

const extractBrandFromTitle = (productTitle) => {
  const title = productTitle.toLowerCase();
  
  if (title.includes('apple') || title.includes('iphone') || title.includes('ipad') || title.includes('macbook')) {
    return 'apple';
  }
  if (title.includes('samsung') || title.includes('galaxy')) {
    return 'samsung';
  }
  if (title.includes('oneplus')) {
    return 'oneplus';
  }
  if (title.includes('motorola') || title.includes('moto')) {
    return 'motorola';
  }
  if (title.includes('xiaomi') || title.includes('mi ') || title.includes('redmi') || title.includes('poco')) {
    return 'xiaomi';
  }
  if (title.includes('realme')) {
    return 'realme';
  }
  if (title.includes('oppo')) {
    return 'oppo';
  }
  if (title.includes('vivo')) {
    return 'vivo';
  }
  if (title.includes('nothing')) {
    return 'nothing';
  }
  if (title.includes('google') || title.includes('pixel')) {
    return 'google';
  }
  if (title.includes('huawei')) {
    return 'huawei';
  }
  if (title.includes('honor')) {
    return 'honor';
  }
  if (title.includes('dell')) {
    return 'dell';
  }
  if (title.includes('hp') || title.includes('hewlett')) {
    return 'hp';
  }
  if (title.includes('lenovo')) {
    return 'lenovo';
  }
  if (title.includes('asus')) {
    return 'asus';
  }
  if (title.includes('acer')) {
    return 'acer';
  }
  if (title.includes('msi')) {
    return 'msi';
  }
  if (title.includes('razer')) {
    return 'razer';
  }
  if (title.includes('gigabyte')) {
    return 'gigabyte';
  }
  if (title.includes('alienware')) {
    return 'alienware';
  }
  if (title.includes('sony')) {
    return 'sony';
  }
  if (title.includes('bose')) {
    return 'bose';
  }
  if (title.includes('canon')) {
    return 'canon';
  }
  if (title.includes('nikon')) {
    return 'nikon';
  }
  if (title.includes('lg')) {
    return 'lg';
  }
  
  return null;
};

// Calculate common price using different methods
const calculateCommonPrice = (prices, method = 'lowest') => {
  if (!prices || prices.length === 0) return null;
  
  const validPrices = prices.filter(price => price > 0);
  if (validPrices.length === 0) return null;
  
  switch (method) {
    case 'lowest':
      return Math.min(...validPrices);
    
    case 'average':
      const sum = validPrices.reduce((acc, price) => acc + price, 0);
      return Math.round(sum / validPrices.length);
    
    case 'median':
      const sortedPrices = [...validPrices].sort((a, b) => a - b);
      const mid = Math.floor(sortedPrices.length / 2);
      if (sortedPrices.length % 2 === 0) {
        return Math.round((sortedPrices[mid - 1] + sortedPrices[mid]) / 2);
      } else {
        return sortedPrices[mid];
      }
    
    default:
      return Math.min(...validPrices);
  }
};

// Simple suggested pricing based on Amazon and Flipkart prices
const calculateSuggestedPricing = (amazonPrice, flipkartPrice) => {
  // If no prices available
  if (!amazonPrice && !flipkartPrice) {
    return {
      amazonPrice: null,
      flipkartPrice: null,
      suggestedPrice: null
    };
  }

  // If only one price available
  if (!amazonPrice && flipkartPrice) {
    const suggestedPrice = Math.round(flipkartPrice * 0.95); // 5% below Flipkart
    return {
      amazonPrice: null,
      flipkartPrice: flipkartPrice,
      suggestedPrice: suggestedPrice
    };
  }

  if (amazonPrice && !flipkartPrice) {
    const suggestedPrice = Math.round(amazonPrice * 0.95); // 5% below Amazon
    return {
      amazonPrice: amazonPrice,
      flipkartPrice: null,
      suggestedPrice: suggestedPrice
    };
  }

  // Both prices available - use the lower one
  const lowerPrice = Math.min(amazonPrice, flipkartPrice);
  const suggestedPrice = Math.round(lowerPrice * 0.95); // 5% below lower price

  return {
    amazonPrice: amazonPrice,
    flipkartPrice: flipkartPrice,
    suggestedPrice: suggestedPrice
  };
};

// Estimate product cost based on category and market price
const estimateProductCost = (marketPrice, category) => {
  // Cost estimation ratios based on typical ecommerce margins
  const costRatios = {
    // Smartphones - High margin products
    'iphone': 0.65,
    'samsung': 0.70,
    'oneplus': 0.75,
    'xiaomi': 0.80,
    'realme': 0.80,
    'oppo': 0.75,
    'vivo': 0.75,
    'nothing': 0.70,
    'google': 0.65,
    'huawei': 0.70,
    'honor': 0.75,
    'motorola': 0.75,
    'smartphone': 0.75,

    // Laptops - Medium to high margin
    'macbook': 0.60,
    'dell': 0.70,
    'hp': 0.70,
    'lenovo': 0.70,
    'asus': 0.70,
    'acer': 0.75,
    'msi': 0.65,
    'razer': 0.60,
    'gigabyte': 0.70,
    'alienware': 0.60,
    'laptop': 0.70,

    // Tablets - Medium margin
    'ipad': 0.70,
    'samsung_tab': 0.75,
    'lenovo_tab': 0.80,
    'xiaomi_tab': 0.80,
    'realme_tab': 0.80,
    'oneplus_tab': 0.75,
    'huawei_tab': 0.75,
    'tablet': 0.75,

    // Smartwatches - Medium margin
    'apple_watch': 0.70,
    'samsung_watch': 0.75,
    'fitbit': 0.80,
    'garmin': 0.70,
    'huawei_watch': 0.80,
    'amazfit': 0.85,
    'realme_watch': 0.85,
    'noise_watch': 0.90,
    'boat_watch': 0.90,
    'smartwatch': 0.80,

    // Kitchen Appliances - Medium margin
    'washing_machine': 0.75,
    'refrigerator': 0.70,
    'microwave': 0.80,
    'air_conditioner': 0.70,
    'dishwasher': 0.70,
    'oven': 0.80,
    'blender': 0.80,
    'food_processor': 0.80,
    'coffee_maker': 0.80,
    'water_purifier': 0.75,
    'vacuum_cleaner': 0.75,
    'iron': 0.85,
    'hair_dryer': 0.85,
    'shaver': 0.80,

    // Computer Accessories - High margin
    'keyboard': 0.70,
    'mouse': 0.75,
    'monitor': 0.70,
    'webcam': 0.75,
    'printer': 0.70,
    'hard_disk': 0.80,
    'ssd': 0.75,
    'pendrive': 0.80,

    // Gaming - Medium to high margin
    'ps5': 0.70,
    'xbox': 0.70,
    'gaming_controller': 0.75,
    'gaming_headset': 0.70,
    'gaming_keyboard': 0.65,
    'gaming_mouse': 0.70,

    // Audio - Medium margin
    'airpods': 0.70,
    'sony': 0.75,
    'bose': 0.70,
    'speaker': 0.75,
    'microphone': 0.70,
    'amplifier': 0.70,

    // Cameras - Medium margin
    'canon': 0.70,
    'nikon': 0.70,
    'sony_camera': 0.70,
    'camera_lens': 0.65,
    'tripod': 0.75,
    'gimbal': 0.70,
    'drone': 0.65,

    // TVs - Low to medium margin
    'samsung_tv': 0.75,
    'lg_tv': 0.75,

    // Networking - Medium margin
    'router': 0.80,
    'modem': 0.85,
    'switch': 0.80,

    // Mobile Accessories - High margin
    'powerbank': 0.70,
    'mobile_charger': 0.80,
    'mobile_case': 0.85,
    'screen_protector': 0.90,

    // Smart Home - Medium margin
    'smart_bulb': 0.80,
    'smart_plug': 0.80,
    'security_camera': 0.75,
    'doorbell': 0.80,

    // Storage - Medium margin
    'hard_disk': 0.80,
    'ssd': 0.75,
    'pendrive': 0.80,

    // Default for unknown categories
    'default': 0.75
  };

  const costRatio = costRatios[category] || costRatios['default'];
  return Math.round(marketPrice * costRatio);
};

// Generate pricing recommendations
const generatePricingRecommendations = (category, profitMargin, marketPrice) => {
  const recommendations = [];

  if (profitMargin < 10) {
    recommendations.push('⚠️ Low profit margin - Consider higher pricing or better sourcing');
  } else if (profitMargin > 30) {
    recommendations.push('✅ High profit margin - Good pricing strategy');
  } else {
    recommendations.push('✅ Healthy profit margin - Competitive pricing');
  }

  if (marketPrice > 50000) {
    recommendations.push('💰 Premium product - Focus on quality and service');
  } else if (marketPrice > 15000) {
    recommendations.push('📱 Mid-range product - Balance price and features');
  } else {
    recommendations.push('🏷️ Budget product - Focus on volume and efficiency');
  }

  // Category-specific recommendations
  const categoryRecommendations = {
    'iphone': ['📱 Premium brand - Maintain quality service', '🎯 Target high-end customers'],
    'samsung': ['📱 Popular brand - Competitive pricing works', '🔄 Regular price updates needed'],
    'macbook': ['💻 Premium laptop - Focus on warranty and support', '🎯 Target professionals'],
    'washing_machine': ['🏠 Essential appliance - Volume sales strategy', '🔧 Emphasize warranty'],
    'refrigerator': ['🏠 High-value appliance - Financing options', '⚡ Energy efficiency focus'],
    'gaming_controller': ['🎮 Gaming niche - Bundle with games', '🎯 Target gamers'],
    'powerbank': ['🔋 High-volume product - Bulk pricing', '⚡ Fast charging features'],
    'smart_bulb': ['💡 Smart home trend - Bundle with hub', '🎯 Tech-savvy customers']
  };

  if (categoryRecommendations[category]) {
    recommendations.push(...categoryRecommendations[category]);
  }

  return recommendations;
};

// Fetch Amazon ASIN using product title and model number
const fetchAmazonASIN = async (productTitle, modelNumber) => {
  try {
    console.log('Fetching Amazon ASIN for:', productTitle, modelNumber);
    
    // Create search query with better precision
    let searchQuery;
    if (modelNumber) {
      // Use exact model number for better precision
      searchQuery = `${productTitle} ${modelNumber}`;
    } else {
      searchQuery = productTitle;
    }
    
    // Add exclusion terms to avoid similar products
    if (productTitle.toLowerCase().includes('samsung') && productTitle.toLowerCase().includes('s24')) {
      // For Samsung S24, use more specific search to avoid FE, Ultra, Plus variants
      if (modelNumber) {
        searchQuery = `Samsung Galaxy S24 ${modelNumber} -FE -Ultra -Plus -S24FE -"S24 FE" -"S24FE"`;
      } else {
        searchQuery = `Samsung Galaxy S24 -FE -Ultra -Plus -S24FE -"S24 FE" -"S24FE"`;
      }
    }
    
    // Dynamic handling for MacBook chips (M1, M2, M3, M4, M5, etc.)
    const searchChipInfo = extractChipInfoFromTitle(productTitle);
    if (searchChipInfo) {
      // For MacBooks, be very specific about the chip
      const chipRegex = new RegExp(`\\b${searchChipInfo.chipModel}\\b`, 'gi');
      searchQuery = searchQuery.replace(chipRegex, searchChipInfo.chipWithChip);
      
      // Add exclusions for all other chips dynamically
      const exclusionTerms = searchChipInfo.otherChips.flatMap(chip => [
        `-${chip}`,
        `-"${chip} chip"`
      ]).join(' ');
      searchQuery += ` ${exclusionTerms}`;
    }
    
    // Special handling for iPhone to avoid older models
    if (productTitle.toLowerCase().includes('iphone 15')) {
      searchQuery += ' -iphone 14 -iphone 13 -iphone 12 -"iphone 14" -"iphone 13" -"iphone 12"';
    }
    
    // Special handling for Samsung S24 to avoid FE variants
    if (productTitle.toLowerCase().includes('samsung') && productTitle.toLowerCase().includes('s24')) {
      searchQuery += ' -FE -Ultra -Plus -S24FE -"S24 FE" -"S24FE"';
    }
    
    // Special handling for OnePlus 12 to avoid older models
    if (productTitle.toLowerCase().includes('oneplus 12')) {
      searchQuery += ' -oneplus 11 -oneplus 10 -"oneplus 11" -"oneplus 10"';
    }
    
    // Special handling for Xiaomi 14 to avoid older models
    if (productTitle.toLowerCase().includes('xiaomi 14')) {
      searchQuery += ' -xiaomi 13 -xiaomi 12 -"xiaomi 13" -"xiaomi 12"';
    }
    
    // Special handling for Realme 12 to avoid older models
    if (productTitle.toLowerCase().includes('realme 12')) {
      searchQuery += ' -realme 11 -realme 10 -"realme 11" -"realme 10"';
    }
    
    // Special handling for OPPO Find X7 to avoid older models
    if (productTitle.toLowerCase().includes('find x7')) {
      searchQuery += ' -find x6 -find x5 -"find x6" -"find x5"';
    }
    
    // Special handling for Vivo X100 to avoid older models
    if (productTitle.toLowerCase().includes('x100')) {
      searchQuery += ' -x90 -x80 -"x90" -"x80"';
    }
    
    // Special handling for Nothing Phone 2 to avoid Phone 1
    if (productTitle.toLowerCase().includes('phone 2')) {
      searchQuery += ' -phone 1 -"phone 1"';
    }
    
    // Special handling for Google Pixel 8 to avoid older models
    if (productTitle.toLowerCase().includes('pixel 8')) {
      searchQuery += ' -pixel 7 -pixel 6 -"pixel 7" -"pixel 6"';
    }
    
    // Special handling for Huawei P70 to avoid older models
    if (productTitle.toLowerCase().includes('p70')) {
      searchQuery += ' -p60 -p50 -"p60" -"p50"';
    }
    
    // Special handling for Honor 100 to avoid older models
    if (productTitle.toLowerCase().includes('honor 100')) {
      searchQuery += ' -honor 90 -honor 80 -"honor 90" -"honor 80"';
    }
    
    const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}`;
    
    console.log('Amazon search URL:', searchUrl);
    
    // Use makeRequestWithRetry to handle 429 errors
    const response = await makeRequestWithRetry(searchUrl, {
      timeout: 15000,
      referer: 'https://www.amazon.in/'
    }, 3);

    const html = response.data;
    
    // Extract ASIN from search results
    const asinPatterns = [
      /\/dp\/([A-Z0-9]{10})/g,
      /\/gp\/product\/([A-Z0-9]{10})/g,
      /data-asin="([A-Z0-9]{10})"/g
    ];
    
    const asins = [];
    for (const pattern of asinPatterns) {
      const matches = html.match(pattern);
      if (matches) {
        asins.push(...matches.map(match => {
          return match.replace(/\/dp\//, '').replace(/\/gp\/product\//, '').replace(/data-asin="/, '').replace(/"/, '');
        }));
      }
    }
    
    // Remove duplicates and validate products
    const uniqueAsins = [...new Set(asins)];
    console.log('Found ASINs:', uniqueAsins);
    
    // For Samsung S24, validate that we don't get FE, Ultra, Plus variants
    if (productTitle.toLowerCase().includes('samsung') && productTitle.toLowerCase().includes('s24')) {
      // Check each ASIN to find the correct product
      for (const asin of uniqueAsins) {
        try {
          const productUrl = `https://www.amazon.in/dp/${asin}`;
          // Add delay between ASIN validations
          await randomDelay(1000, 2000);
          const productResponse = await makeRequestWithRetry(productUrl, {
            timeout: 10000,
            referer: 'https://www.amazon.in/'
          }, 2);
          
          const productHtml = productResponse.data;
          const titleMatch = productHtml.match(/<span[^>]*id="productTitle"[^>]*>([^<]+)<\/span>/);
          
          if (titleMatch) {
            const title = titleMatch[1].toLowerCase();
            // Check if it's the correct Samsung S24 (not FE, Ultra, Plus)
            if (title.includes('samsung') && title.includes('s24') && 
                !title.includes('fe') && !title.includes('ultra') && !title.includes('plus')) {
              console.log('Found correct Samsung S24 ASIN:', asin);
              return asin;
            }
          }
        } catch (error) {
          console.log('Error validating ASIN:', asin, error.message);
          continue;
        }
      }
    }
    
    // Dynamic MacBook chip validation - extract chip info from productTitle
    const chipInfo = extractChipInfoFromTitle(productTitle);
    if (chipInfo) {
      // Check each ASIN to find the correct product
      for (const asin of uniqueAsins) {
        try {
          const productUrl = `https://www.amazon.in/dp/${asin}`;
          // Add delay between ASIN validations
          await randomDelay(1000, 2000);
          const productResponse = await makeRequestWithRetry(productUrl, {
            timeout: 10000,
            referer: 'https://www.amazon.in/'
          }, 2);
          
          const productHtml = productResponse.data;
          const titleMatch = productHtml.match(/<span[^>]*id="productTitle"[^>]*>([^<]+)<\/span>/);
          
          if (titleMatch) {
            const title = titleMatch[1].toLowerCase();
            
            // Check if it's the correct MacBook with the right chip (not other chips)
            const hasCorrectChip = title.includes(chipInfo.chipLower) || title.includes(chipInfo.chipWithChip.toLowerCase());
            const hasOtherChip = chipInfo.otherChips.some(chip => 
              title.includes(chip.toLowerCase()) || 
              title.includes(`${chip.toLowerCase()} chip`)
            );
            
            if (title.includes('macbook') && hasCorrectChip && !hasOtherChip) {
              console.log(`Found correct MacBook ${chipInfo.chipModel} ASIN:`, asin);
              return asin;
            }
          }
        } catch (error) {
          console.log('Error validating ASIN:', asin, error.message);
          continue;
        }
      }
    }
    
    // For iPhone 15, validate that we don't get older models
    if (productTitle.toLowerCase().includes('iphone 15')) {
      for (const asin of uniqueAsins) {
        try {
          const productUrl = `https://www.amazon.in/dp/${asin}`;
          // Add delay between ASIN validations
          await randomDelay(1000, 2000);
          const productResponse = await makeRequestWithRetry(productUrl, {
            timeout: 10000,
            referer: 'https://www.amazon.in/'
          }, 2);
          
          const productHtml = productResponse.data;
          const titleMatch = productHtml.match(/<span[^>]*id="productTitle"[^>]*>([^<]+)<\/span>/);
          
          if (titleMatch) {
            const title = titleMatch[1].toLowerCase();
            // Check if it's the correct iPhone 15 (not older models)
            if (title.includes('iphone') && title.includes('15') && 
                !title.includes('iphone 14') && !title.includes('iphone 13') && !title.includes('iphone 12')) {
              console.log('Found correct iPhone 15 ASIN:', asin);
              return asin;
            }
          }
        } catch (error) {
          console.log('Error validating ASIN:', asin, error.message);
          continue;
        }
      }
    }
    
    // For Samsung S24, validate that we don't get FE variants
    if (productTitle.toLowerCase().includes('samsung') && productTitle.toLowerCase().includes('s24')) {
      for (const asin of uniqueAsins) {
        try {
          const productUrl = `https://www.amazon.in/dp/${asin}`;
          // Add delay between ASIN validations
          await randomDelay(1000, 2000);
          const productResponse = await makeRequestWithRetry(productUrl, {
            timeout: 10000,
            referer: 'https://www.amazon.in/'
          }, 2);
          
          const productHtml = productResponse.data;
          const titleMatch = productHtml.match(/<span[^>]*id="productTitle"[^>]*>([^<]+)<\/span>/);
          
          if (titleMatch) {
            const title = titleMatch[1].toLowerCase();
            // Check if it's the correct Samsung S24 (not FE, Ultra, Plus)
            if (title.includes('samsung') && title.includes('s24') && 
                !title.includes('fe') && !title.includes('ultra') && !title.includes('plus')) {
              console.log('Found correct Samsung S24 ASIN:', asin);
              return asin;
            }
          }
        } catch (error) {
          console.log('Error validating ASIN:', asin, error.message);
          continue;
        }
      }
    }
    
    return uniqueAsins.length > 0 ? uniqueAsins[0] : null;
    
  } catch (error) {
    return null;
  }
};

// Fetch Flipkart FSN using product title and model number
const fetchFlipkartFSN = async (productTitle, modelNumber) => {
  try {
    console.log('Fetching Flipkart FSN for:', productTitle, modelNumber);
    
    // Extract brand name from product title
    const brandName = extractBrandFromTitle(productTitle);
    
    // Detect category and generate optimized search query
    const category = detectProductCategory(productTitle, modelNumber, brandName);
    let searchQuery = generateOptimizedSearchQuery(productTitle, modelNumber, category);
    
    // Add specific exclusions for Samsung S24 to avoid FE variants
    if (productTitle.toLowerCase().includes('samsung') && productTitle.toLowerCase().includes('s24')) {
      searchQuery += ' -FE -Ultra -Plus -S24FE -"S24 FE" -"S24FE"';
    }
    
    // Add special handling for all electronics categories
    if (productTitle.toLowerCase().includes('iphone 15')) {
      searchQuery += ' -iphone 14 -iphone 13 -iphone 12 -"iphone 14" -"iphone 13" -"iphone 12"';
    }
    
    if (productTitle.toLowerCase().includes('oneplus 12')) {
      searchQuery += ' -oneplus 11 -oneplus 10 -"oneplus 11" -"oneplus 10"';
    }
    
    if (productTitle.toLowerCase().includes('xiaomi 14')) {
      searchQuery += ' -xiaomi 13 -xiaomi 12 -"xiaomi 13" -"xiaomi 12"';
    }
    
    if (productTitle.toLowerCase().includes('realme 12')) {
      searchQuery += ' -realme 11 -realme 10 -"realme 11" -"realme 10"';
    }
    
    if (productTitle.toLowerCase().includes('find x7')) {
      searchQuery += ' -find x6 -find x5 -"find x6" -"find x5"';
    }
    
    if (productTitle.toLowerCase().includes('x100')) {
      searchQuery += ' -x90 -x80 -"x90" -"x80"';
    }
    
    if (productTitle.toLowerCase().includes('phone 2')) {
      searchQuery += ' -phone 1 -"phone 1"';
    }
    
    if (productTitle.toLowerCase().includes('pixel 8')) {
      searchQuery += ' -pixel 7 -pixel 6 -"pixel 7" -"pixel 6"';
    }
    
    if (productTitle.toLowerCase().includes('p70')) {
      searchQuery += ' -p60 -p50 -"p60" -"p50"';
    }
    
    if (productTitle.toLowerCase().includes('honor 100')) {
      searchQuery += ' -honor 90 -honor 80 -"honor 90" -"honor 80"';
    }
    
    const searchUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(searchQuery)}`;
    
    console.log('Flipkart search URL:', searchUrl);
    
    // Use makeRequestWithRetry to handle 429 errors
    const response = await makeRequestWithRetry(searchUrl, {
      timeout: 20000,
      referer: 'https://www.flipkart.com/'
    }, 3);

    const html = response.data;
    
    // Extract FSN from search results
    const fsnPatterns = [
      /\/p\/itm[^"]*pid=([A-Z0-9]+)/g,
      /pid=([A-Z0-9]+)/g,
      /\/p\/itm\?pid=([A-Z0-9]+)/g,
      /href="[^"]*\/p\/itm[^"]*pid=([A-Z0-9]+)/g,
      /data-pid="([A-Z0-9]+)"/g,
      /data-product-id="([A-Z0-9]+)"/g
    ];
    
    const fsns = [];
    for (const pattern of fsnPatterns) {
      const matches = html.match(pattern);
      if (matches) {
        fsns.push(...matches.map(match => {
          return match.replace(/\/p\/itm[^"]*pid=/, '').replace(/pid=/, '');
        }));
      }
    }
    
    // Remove duplicates and filter out invalid FSNs
    const uniqueFsns = [...new Set(fsns)]
      .filter(fsn => {
        // Filter out FSNs that contain HTML fragments or are too short/long
        return fsn && 
               typeof fsn === 'string' && 
               fsn.length >= 8 && 
               fsn.length <= 20 && 
               !fsn.includes('href=') && 
               !fsn.includes('/') && 
               !fsn.includes('"') &&
               /^[A-Z0-9]+$/.test(fsn);
      });
    console.log('Found FSNs:', uniqueFsns);
    
    // Validate products based on category rules
    if (category) {
      // Limit to first 10 FSNs to avoid wasting time on wrong products
      const fsnsToCheck = uniqueFsns.slice(0, 10);
      // Check each FSN to find the correct product
      for (const fsn of fsnsToCheck) {
        try {
          const productUrl = `https://www.flipkart.com/product/p/itm?pid=${fsn}`;
          // Add delay between FSN validations to avoid rate limiting
          await randomDelay(1000, 2000);
          const productResponse = await makeRequestWithRetry(productUrl, {
            timeout: 10000,
            referer: 'https://www.flipkart.com/search'
          }, 2);
          
          const productHtml = productResponse.data;
          const titleMatch = productHtml.match(/<span[^>]*class="_35KyD6[^"]*"[^>]*>([^<]+)<\/span>/);
          
          if (titleMatch) {
            const title = titleMatch[1];
            const titleLower = title.toLowerCase();
            
            // Special validation for MacBook - must contain "macbook" and correct chip
            if (category === 'macbook') {
              if (!titleLower.includes('macbook')) {
                console.log(`Skipping FSN - Not a MacBook:`, title);
                continue;
              }
              
              // Extract chip info from original product title
              const chipInfo = extractChipInfoFromTitle(productTitle);
              if (chipInfo) {
                // Check if this FSN's title contains the correct chip
                const hasCorrectChip = titleLower.includes(chipInfo.chipLower) || 
                                     titleLower.includes(chipInfo.chipWithChip.toLowerCase());
                const hasOtherChip = chipInfo.otherChips.some(chip => 
                  titleLower.includes(chip.toLowerCase()) || 
                  titleLower.includes(`${chip.toLowerCase()} chip`)
                );
                
                if (hasOtherChip) {
                  console.log(`Skipping FSN - Wrong chip model:`, title);
                  continue;
                }
                
                if (!hasCorrectChip) {
                  console.log(`Skipping FSN - Correct chip (${chipInfo.chipModel}) not found:`, title);
                  continue;
                }
              }
            }
            
            // Validate product based on category rules
            try {
              if (category && validateProductByCategory(title, null, category)) {
                console.log(`Found correct ${category} FSN:`, fsn);
                return fsn;
              }
            } catch (validationError) {
              console.log('Validation error for FSN:', fsn, validationError.message);
              // Continue to next FSN if validation fails
            }
          }
        } catch (error) {
          console.log('Error validating FSN:', fsn, error.message);
          continue;
        }
      }
    }
    
    return uniqueFsns.length > 0 ? uniqueFsns[0] : null;
    
  } catch (error) {
    return null;
  }
};

// Get price using Amazon ASIN
const getAmazonPriceByASIN = async (asin, productTitle = null) => {
  try {
    console.log('Getting Amazon price for ASIN:', asin);
    
    // Detect category to determine price range
    let priceRange = { min: 1000, max: 1000000 }; // Default range
    if (productTitle) {
      const brandName = extractBrandFromTitle(productTitle);
      const category = detectProductCategory(productTitle, null, brandName);
      if (category && PRODUCT_CATEGORIES[category]) {
        priceRange = PRODUCT_CATEGORIES[category].priceRange;
        console.log(`Detected category: ${category}, price range: ₹${priceRange.min}-₹${priceRange.max}`);
      }
    }
    
    const productUrl = `https://www.amazon.in/dp/${asin}`;
    
    // Add random delay before request
    await randomDelay(2000, 4000);
    
    // Use makeRequestWithRetry to handle 429 errors
    const response = await makeRequestWithRetry(productUrl, {
      timeout: 10000,
      referer: 'https://www.amazon.in/'
    }, 3);

    const html = response.data;
    
    // Extract price - prioritize current/selling price, skip MRP and exchange prices
    // Priority 1: Current selling price (a-price-whole without a-text-price)
    let price = null;
    const allPrices = [];
    
    // Pattern 1: Current price (selling price) - highest priority
    const currentPricePatterns = [
      /<span[^>]*class="a-price-whole"[^>]*>(?!.*a-text-price)([\d,]+)<\/span>/g,
      /data-a-price-whole="([\d,]+)"/g,
      /<span[^>]*class="a-price a-price-whole[^>]*>(?!.*a-text-price)([\d,]+)/g
    ];
    
    for (const pattern of currentPricePatterns) {
      const matches = [...html.matchAll(pattern)];
      for (const match of matches) {
        const priceText = match[1] ? match[1].replace(/[^\d]/g, '') : '';
        const extractedPrice = parseFloat(priceText);
        
        // Check context to avoid MRP/struck-through prices
        const matchIndex = match.index || 0;
        const context = html.slice(Math.max(0, matchIndex - 200), Math.min(html.length, matchIndex + 200)).toLowerCase();
        
        // Skip if it's MRP, original price, or exchange price
        if (context.includes('mrp') || context.includes('list price') || 
            context.includes('original') || context.includes('exchange') ||
            context.includes('emi') || context.includes('strike') ||
            context.includes('<s') || context.includes('was')) {
          continue;
        }
        
        // Use category-based price range validation
        const minPrice = priceRange.min || 1000;
        const maxPrice = priceRange.max || 1000000;
        if (extractedPrice > 0 && extractedPrice < maxPrice && extractedPrice >= minPrice) {
          allPrices.push({ price: extractedPrice, type: 'current', priority: 1 });
        }
      }
    }
    
    // Pattern 2: a-offscreen price (usually current price)
    const offscreenMatches = [...html.matchAll(/<span[^>]*class="a-offscreen"[^>]*>₹\s*([\d,]+)/g)];
    for (const match of offscreenMatches) {
      const matchIndex = match.index || 0;
      const context = html.slice(Math.max(0, matchIndex - 200), Math.min(html.length, matchIndex + 200)).toLowerCase();
      
      // Skip if it's MRP or original price
      if (!context.includes('mrp') && !context.includes('list price') && 
          !context.includes('original') && !context.includes('exchange')) {
        const priceText = match[1] ? match[1].replace(/[^\d]/g, '') : '';
        const extractedPrice = parseFloat(priceText);
        // Use category-based price range validation
        const minPrice = priceRange.min || 1000;
        const maxPrice = priceRange.max || 1000000;
        if (extractedPrice > 0 && extractedPrice < maxPrice && extractedPrice >= minPrice) {
          allPrices.push({ price: extractedPrice, type: 'offscreen', priority: 2 });
        }
      }
    }
    
    // Pattern 3: JSON price data
    const jsonPriceMatch = html.match(/"price":\s*"₹\s*([\d,]+)"/);
    if (jsonPriceMatch) {
      const priceText = jsonPriceMatch[1].replace(/[^\d]/g, '');
      const extractedPrice = parseFloat(priceText);
      // Use category-based price range validation
      const minPrice = priceRange.min || 1000;
      const maxPrice = priceRange.max || 1000000;
      if (extractedPrice > 0 && extractedPrice < maxPrice && extractedPrice >= minPrice) {
        allPrices.push({ price: extractedPrice, type: 'json', priority: 3 });
      }
    }
    
    // Sort by priority and select the highest priority price (current selling price)
    if (allPrices.length > 0) {
      allPrices.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.price - b.price; // If same priority, prefer lower price (current vs MRP)
      });
      
      price = allPrices[0].price;
      console.log(`Amazon price found: ₹${price} (from ${allPrices[0].type}, total candidates: ${allPrices.length})`);
      
      // Log all found prices for debugging
      if (allPrices.length > 1) {
        console.log(`All prices found:`, allPrices.map(p => `₹${p.price} (${p.type})`).join(', '));
      }
    }
    
    // Extract title
    const titlePatterns = [
      /<span[^>]*id="productTitle"[^>]*>([^<]+)<\/span>/g,
      /<h1[^>]*id="title"[^>]*>([^<]+)<\/h1>/g,
      /"title":\s*"([^"]+)"/g
    ];
    
    let title = null;
    for (const pattern of titlePatterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        title = matches[0].replace(/<[^>]*>/g, '').replace(/"/g, '').trim();
        break;
      }
    }
    
    return {
      price: price,
      title: title || 'Product on Amazon',
      url: productUrl,
      source: 'Amazon',
      seller: 'Amazon',
      asin: asin
    };
    
  } catch (error) {
    return null;
  }
};

// Get price using Flipkart FSN
const getFlipkartPriceByFSN = async (fsn, productTitle = null) => {
  try {
    console.log('Getting Flipkart price for FSN:', fsn);
    
    // Detect category to determine price range
    let priceRange = { min: 1000, max: 1000000 }; // Default range
    if (productTitle) {
      const brandName = extractBrandFromTitle(productTitle);
      const category = detectProductCategory(productTitle, null, brandName);
      if (category && PRODUCT_CATEGORIES[category]) {
        priceRange = PRODUCT_CATEGORIES[category].priceRange;
        console.log(`Detected category: ${category}, price range: ₹${priceRange.min}-₹${priceRange.max}`);
      }
    }
    
    // Add random delay to avoid rate limiting (human-like behavior)
    await randomDelay(2000, 4000);
    
    const productUrl = `https://www.flipkart.com/product/p/itm?pid=${fsn}`;
    
    // Use makeRequestWithRetry to handle 429 errors
    const response = await makeRequestWithRetry(productUrl, {
      timeout: 15000,
      referer: 'https://www.flipkart.com/search'
    }, 3);

    const html = response.data;
    
    // Extract price with improved patterns
    const pricePatterns = [
      /class="_30jeq3[^"]*">([\d,]+)</g,
      /class="_1_WHN1[^"]*">([\d,]+)</g,
      /class="_16Jk6d[^"]*">([\d,]+)</g,
      /class="_30jeq3[^"]*">₹\s*([\d,]+)/g,
      /class="_1_WHN1[^"]*">₹\s*([\d,]+)/g,
      /class="_16Jk6d[^"]*">₹\s*([\d,]+)/g,
      /"price":\s*"₹\s*([\d,]+)"/g,
      /"price":\s*([\d,]+)/g,
      /₹\s*([\d,]+)/g,
      /data-price="([\d,]+)"/g,
      /class="_16Jk6d[^"]*">₹\s*([\d,]+)/g,
      /class="_25b18c[^"]*">₹\s*([\d,]+)/g,
      /class="_2_WHlH[^"]*">₹\s*([\d,]+)/g,
      /class="_3I9_wc[^"]*">₹\s*([\d,]+)/g,
      /class="_1vC4OE[^"]*">₹\s*([\d,]+)/g,
      /class="_2r_T1I[^"]*">₹\s*([\d,]+)/g,
      /class="_3qX9ny[^"]*">₹\s*([\d,]+)/g,
      /class="_2WkVRV[^"]*">₹\s*([\d,]+)/g,
      /class="_1_WHN1[^"]*">₹\s*([\d,]+)/g,
      /class="_30jeq3[^"]*">₹\s*([\d,]+)/g,
      /class="_16Jk6d[^"]*">₹\s*([\d,]+)/g,
      /class="_25b18c[^"]*">([\d,]+)</g,
      /class="_2_WHlH[^"]*">([\d,]+)</g,
      /class="_3I9_wc[^"]*">([\d,]+)</g,
      /class="_1vC4OE[^"]*">([\d,]+)</g,
      /class="_2r_T1I[^"]*">([\d,]+)</g,
      /class="_3qX9ny[^"]*">([\d,]+)</g,
      /class="_2WkVRV[^"]*">([\d,]+)</g,
      // Additional patterns for better price extraction
      /class="[^"]*price[^"]*">([\d,]+)</g,
      /class="[^"]*price[^"]*">₹\s*([\d,]+)/g,
      /"currentPrice":\s*([\d,]+)/g,
      /"currentPrice":\s*"₹\s*([\d,]+)"/g,
      /"sellingPrice":\s*([\d,]+)/g,
      /"sellingPrice":\s*"₹\s*([\d,]+)"/g,
      /"mrp":\s*([\d,]+)/g,
      /"mrp":\s*"₹\s*([\d,]+)"/g,
      /data-price="([\d,]+)"/g,
      /data-current-price="([\d,]+)"/g,
      /data-selling-price="([\d,]+)"/g
    ];
    
    let price = null;
    const allPrices = [];
    for (const pattern of pricePatterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        for (const match of matches) {
          const priceText = match.replace(/[^\d]/g, '');
          const extractedPrice = parseFloat(priceText);
          
          if (extractedPrice > 0 && extractedPrice < 1000000) {
            allPrices.push(extractedPrice);
          }
        }
      }
    }
    
    // Filter prices by category-based range
    if (allPrices.length > 0) {
      const reasonablePrices = allPrices.filter(p => p >= priceRange.min && p <= priceRange.max);
      if (reasonablePrices.length > 0) {
        // Select median price from reasonable range
        const sortedPrices = reasonablePrices.sort((a, b) => a - b);
        price = sortedPrices[Math.floor(sortedPrices.length / 2)];
        console.log(`Flipkart price found: ₹${price} (from ${reasonablePrices.length} prices in range ₹${priceRange.min}-₹${priceRange.max})`);
      } else {
        // If no prices in range, try to find closest to range
        const filteredPrices = allPrices.filter(p => p >= Math.max(1000, priceRange.min * 0.1));
        if (filteredPrices.length > 0) {
          const sortedFiltered = filteredPrices.sort((a, b) => a - b);
          price = sortedFiltered[Math.floor(sortedFiltered.length / 2)];
          console.log(`Flipkart price found (outside range): ₹${price}`);
        }
      }
    }
    
    // Extract title with improved patterns
    const titlePatterns = [
      /<span[^>]*class="_35KyD6[^"]*"[^>]*>([^<]+)<\/span>/g,
      /<h1[^>]*class="_2E8Pvz[^"]*"[^>]*>([^<]+)<\/h1>/g,
      /"title":\s*"([^"]+)"/g,
      /<h1[^>]*class="yhB1nd[^"]*"[^>]*>([^<]+)<\/h1>/g,
      /<span[^>]*class="yhB1nd[^"]*"[^>]*>([^<]+)<\/span>/g,
      /<h1[^>]*class="B_NuCI[^"]*"[^>]*>([^<]+)<\/h1>/g,
      /<span[^>]*class="B_NuCI[^"]*"[^>]*>([^<]+)<\/span>/g,
      /<h1[^>]*class="[^"]*"[^>]*>([^<]+)<\/h1>/g,
      /<span[^>]*class="[^"]*"[^>]*>([^<]+)<\/span>/g,
      /<title[^>]*>([^<]+)<\/title>/g,
      /"productName":\s*"([^"]+)"/g,
      /"name":\s*"([^"]+)"/g,
      // Additional patterns for better title extraction
      /<h1[^>]*class="[^"]*product[^"]*"[^>]*>([^<]+)<\/h1>/g,
      /<span[^>]*class="[^"]*product[^"]*"[^>]*>([^<]+)<\/span>/g,
      /<div[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/div>/g,
      /<div[^>]*class="[^"]*product[^"]*"[^>]*>([^<]+)<\/div>/g,
      /"productTitle":\s*"([^"]+)"/g,
      /"displayName":\s*"([^"]+)"/g,
      /"brand":\s*"([^"]+)"[^}]*"name":\s*"([^"]+)"/g,
      /data-title="([^"]+)"/g,
      /data-product-name="([^"]+)"/g
    ];
    
    let title = null;
    const invalidTitlePatterns = [
      /itm store/i,
      /buy itm/i,
      /flipkart\.com/i,
      /online at best price/i,
      /access denied/i,
      /page not found/i,
      /error/i,
      /store online/i,
      /^[a-z]+mobiles?$/i,
      /^[a-z]+store$/i,
      /^[a-z]+shop$/i,
      /^[a-z]+mart$/i,
      /^[a-z]+tech$/i,
      /^[a-z]+digital$/i,
      /^[a-z]+electronics$/i,
      /^[a-z]+gadgets$/i
    ];
    
    const sellerNamePatterns = [
      /^itm store/i,
      /^shreee?mobiles?$/i,
      /^mobiles?$/i,
      /^store$/i,
      /^shop$/i,
      /^mart$/i,
      /^tech$/i,
      /^digital$/i,
      /^electronics$/i,
      /^gadgets$/i
    ];
    
    for (const pattern of titlePatterns) {
      const matches = [...html.matchAll(pattern)];
      for (const match of matches) {
        if (match[1]) {
          let extractedTitle = match[1]
            .replace(/<[^>]*>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/"/g, '')
            .trim();
          
          // Skip invalid titles (page titles, error messages, seller names, etc.)
          const isInvalid = invalidTitlePatterns.some(invalidPattern => 
            invalidPattern.test(extractedTitle)
          );
          
          // Skip if it's just a seller/store name
          const isSellerName = sellerNamePatterns.some(sellerPattern => 
            sellerPattern.test(extractedTitle)
          );
          
          if (!isInvalid && !isSellerName && extractedTitle && extractedTitle.length > 10) {
            // Additional validation: title should contain product-related keywords
            const hasProductKeywords = /(macbook|apple|m2|m3|m4|ram|gb|ssd|laptop|redmi|note|xiaomi|samsung|iphone|mobile|phone|smartphone|5g|storage|titan|black|white|blue|green|purple|128|256|512|6gb|8gb|12gb)/i.test(extractedTitle);
            
            // Title should be descriptive (not just a single word or seller name)
            const words = extractedTitle.split(/\s+/).filter(w => w.length > 0);
            const isDescriptive = words.length >= 3; // At least 3 words
            
            if ((hasProductKeywords && isDescriptive) || extractedTitle.length > 30) {
              title = extractedTitle;
              console.log(`Flipkart title extracted: ${title}`);
              break;
            }
          }
        }
      }
      if (title) break;
    }
    
    // If still no title, try to extract from URL or use fallback
    if (!title || title.length < 5) {
      title = 'Product on Flipkart';
    }
    
    // If no price found, try alternative methods
    if (!price) {
      console.log('No price found with primary patterns, trying alternative methods...');
      
      // Try to find any number that looks like a price
      const priceMatches = html.match(/₹\s*([\d,]+)/g);
      if (priceMatches && priceMatches.length > 0) {
        for (const match of priceMatches) {
          const priceText = match.replace(/[^\d]/g, '');
          const extractedPrice = parseFloat(priceText);
          if (extractedPrice > 100 && extractedPrice < 1000000) {
            price = extractedPrice;
            console.log('Found price with alternative method:', price);
            break;
          }
        }
      }
    }
    
    // If still no price, try JSON data extraction
    if (!price) {
      try {
        const jsonMatches = html.match(/"price":\s*(\d+)/g);
        if (jsonMatches && jsonMatches.length > 0) {
          for (const match of jsonMatches) {
            const priceText = match.replace(/[^\d]/g, '');
            const extractedPrice = parseFloat(priceText);
            if (extractedPrice > 100 && extractedPrice < 1000000) {
              price = extractedPrice;
              console.log('Found price in JSON data:', price);
              break;
            }
          }
        }
      } catch (jsonError) {
        console.log('JSON extraction failed:', jsonError.message);
      }
    }
    
    return {
      price: price,
      title: title,
      url: productUrl,
      source: 'Flipkart',
      seller: 'Flipkart',
      fsn: fsn
    };
    
  } catch (error) {
    return null;
  }
};

// Alternative Flipkart search method
const searchFlipkartAlternative = async (productTitle, modelNumber) => {
  try {
    console.log('Trying alternative Flipkart search for:', productTitle, modelNumber);
    
    // Create a simpler search query
    let searchQuery = productTitle;
    if (modelNumber) {
      searchQuery = `${productTitle} ${modelNumber}`;
    }
    
    // Remove special characters and simplify
    searchQuery = searchQuery.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    
    const searchUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(searchQuery)}`;
    console.log('Alternative Flipkart search URL:', searchUrl);
    
    // Use makeRequestWithRetry to handle 429 errors
    const response = await makeRequestWithRetry(searchUrl, {
      timeout: 15000,
      referer: 'https://www.flipkart.com/'
    }, 3);

    const html = response.data;
    
    // Try to extract price directly from search results
    const pricePatterns = [
      /class="_30jeq3[^"]*">([\d,]+)</g,
      /class="_1_WHN1[^"]*">([\d,]+)</g,
      /class="_16Jk6d[^"]*">([\d,]+)</g,
      /₹\s*([\d,]+)/g,
      /"price":\s*([\d,]+)/g
    ];
    
    let price = null;
    for (const pattern of pricePatterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        for (const match of matches) {
          const priceText = match.replace(/[^\d]/g, '');
          const extractedPrice = parseFloat(priceText);
          if (extractedPrice > 100 && extractedPrice < 1000000) {
            price = extractedPrice;
            console.log('Alternative method found price:', price);
            break;
          }
        }
        if (price) break;
      }
    }
    
    if (price) {
      return {
        price: price,
        title: productTitle,
        url: searchUrl,
        source: 'Flipkart',
        seller: 'Flipkart',
        method: 'alternative'
      };
    }
    
    return null;
    
  } catch (error) {
    return null;
  }
};

// Simple Amazon scraping using EAN code
const scrapeAmazonByEAN = async (eanCode) => {
  try {
    console.log('Scraping Amazon using EAN code:', eanCode);
    
    const cleanEAN = cleanEANCode(eanCode);
    if (!cleanEAN) {
      throw new Error('Invalid EAN code provided');
    }
    
    // Simple Amazon search with EAN
    const searchUrl = `https://www.amazon.in/s?k=${cleanEAN}`;
    
    console.log('Trying Amazon search URL:', searchUrl);
    
    // Use makeRequestWithRetry to handle 429 errors
    const response = await makeRequestWithRetry(searchUrl, {
      timeout: 15000,
      referer: 'https://www.amazon.in/'
    }, 3);

    const html = response.data;
    
    // Extract product URLs from search results
    const productUrlPatterns = [
      /href="(\/dp\/[A-Z0-9]{10})/g,
      /href="(\/gp\/product\/[A-Z0-9]{10})/g,
      /href="(\/[^"]*\/dp\/[A-Z0-9]{10})/g
    ];
    
    const productUrls = [];
    for (const pattern of productUrlPatterns) {
      const matches = html.match(pattern);
      if (matches) {
        productUrls.push(...matches.map(match => {
          const url = match.replace('href="', '');
          return `https://www.amazon.in${url}`;
        }));
      }
    }
    
    // Remove duplicates
    const uniqueUrls = [...new Set(productUrls)];
    console.log('Found product URLs:', uniqueUrls.length);
    
    let allListings = [];
    
    // Check each product URL
    for (const productUrl of uniqueUrls.slice(0, 3)) { // Check first 3 results
      try {
        console.log('Checking product URL:', productUrl);
        
        // Add delay between product checks
        await randomDelay(1500, 3000);
        
        // Use makeRequestWithRetry to handle 429 errors
        const productResponse = await makeRequestWithRetry(productUrl, {
          timeout: 10000,
          referer: searchUrl
        }, 2);

        const productHtml = productResponse.data;
        
        // Extract price - prioritize current/selling price, skip MRP and exchange prices
        let price = null;
        const allPrices = [];
        
        // Pattern 1: Current price (selling price) - highest priority
        const currentPricePatterns = [
          /<span[^>]*class="a-price-whole"[^>]*>(?!.*a-text-price)([\d,]+)<\/span>/g,
          /data-a-price-whole="([\d,]+)"/g,
          /<span[^>]*class="a-price a-price-whole[^>]*>(?!.*a-text-price)([\d,]+)/g
        ];
        
        for (const pattern of currentPricePatterns) {
          const matches = [...productHtml.matchAll(pattern)];
          for (const match of matches) {
            const priceText = match[1] ? match[1].replace(/[^\d]/g, '') : '';
            const extractedPrice = parseFloat(priceText);
            
            // Check context to avoid MRP/struck-through prices
            const matchIndex = match.index || 0;
            const context = productHtml.slice(Math.max(0, matchIndex - 200), Math.min(productHtml.length, matchIndex + 200)).toLowerCase();
            
            // Skip if it's MRP, original price, or exchange price
            if (context.includes('mrp') || context.includes('list price') || 
                context.includes('original') || context.includes('exchange') ||
                context.includes('emi') || context.includes('strike') ||
                context.includes('<s') || context.includes('was')) {
              continue;
            }
            
            if (extractedPrice > 0 && extractedPrice < 1000000 && extractedPrice > 1000) {
              allPrices.push({ price: extractedPrice, type: 'current', priority: 1 });
            }
          }
        }
        
        // Pattern 2: a-offscreen price (usually current price)
        const offscreenMatches = [...productHtml.matchAll(/<span[^>]*class="a-offscreen"[^>]*>₹\s*([\d,]+)/g)];
        for (const match of offscreenMatches) {
          const matchIndex = match.index || 0;
          const context = productHtml.slice(Math.max(0, matchIndex - 200), Math.min(productHtml.length, matchIndex + 200)).toLowerCase();
          
          // Skip if it's MRP or original price
          if (!context.includes('mrp') && !context.includes('list price') && 
              !context.includes('original') && !context.includes('exchange')) {
            const priceText = match[1] ? match[1].replace(/[^\d]/g, '') : '';
            const extractedPrice = parseFloat(priceText);
            if (extractedPrice > 0 && extractedPrice < 1000000 && extractedPrice > 1000) {
              allPrices.push({ price: extractedPrice, type: 'offscreen', priority: 2 });
            }
          }
        }
        
        // Pattern 3: JSON price data
        const jsonPriceMatch = productHtml.match(/"price":\s*"₹\s*([\d,]+)"/);
        if (jsonPriceMatch) {
          const priceText = jsonPriceMatch[1].replace(/[^\d]/g, '');
          const extractedPrice = parseFloat(priceText);
          if (extractedPrice > 0 && extractedPrice < 1000000 && extractedPrice > 1000) {
            allPrices.push({ price: extractedPrice, type: 'json', priority: 3 });
          }
        }
        
        // Sort by priority and select the highest priority price (current selling price)
        if (allPrices.length > 0) {
          allPrices.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return a.price - b.price; // If same priority, prefer lower price (current vs MRP)
          });
          
          price = allPrices[0].price;
          console.log(`Amazon price found: ₹${price} (from ${allPrices[0].type}, total candidates: ${allPrices.length})`);
        }
        
        // Extract title
        const titlePatterns = [
          /<span[^>]*id="productTitle"[^>]*>([^<]+)<\/span>/g,
          /<h1[^>]*id="title"[^>]*>([^<]+)<\/h1>/g,
          /"title":\s*"([^"]+)"/g
        ];
        
        let title = null;
        for (const pattern of titlePatterns) {
          const matches = productHtml.match(pattern);
          if (matches && matches.length > 0) {
            title = matches[0].replace(/<[^>]*>/g, '').replace(/"/g, '').trim();
            break;
          }
        }
        
        if (price) {
          allListings.push({
            price: price,
            title: title || 'Product on Amazon',
            url: productUrl,
            source: 'Amazon',
            seller: 'Amazon'
          });
        }
        
      } catch (productError) {
        console.log('Product URL check failed:', productError.message);
        continue;
      }
    }
    
    return allListings;
    
  } catch (error) {
    return [];
  }
};

// Simple Flipkart scraping using EAN code
const scrapeFlipkartByEAN = async (eanCode) => {
  try {
    console.log('Scraping Flipkart using EAN code:', eanCode);
    
    const cleanEAN = cleanEANCode(eanCode);
    if (!cleanEAN) {
      throw new Error('Invalid EAN code provided');
    }
    
    // Simple Flipkart search with EAN
    const searchUrl = `https://www.flipkart.com/search?q=${cleanEAN}`;
    
    console.log('Trying Flipkart search URL:', searchUrl);
    
    // Use makeRequestWithRetry to handle 429 errors
    const response = await makeRequestWithRetry(searchUrl, {
      timeout: 15000,
      referer: 'https://www.flipkart.com/'
    }, 3);

    const html = response.data;
    
    // Extract product URLs from search results
    const productUrlPatterns = [
      /href="(\/[^"]*\/p\/itm[^"]*)"/g,
      /href="(\/[^"]*\/product\/[^"]*)"/g
    ];
    
    const productUrls = [];
    for (const pattern of productUrlPatterns) {
      const matches = html.match(pattern);
      if (matches) {
        productUrls.push(...matches.map(match => {
          const url = match.replace('href="', '').replace('"', '');
          return `https://www.flipkart.com${url}`;
        }));
      }
    }
    
    // Remove duplicates
    const uniqueUrls = [...new Set(productUrls)];
    console.log('Found product URLs:', uniqueUrls.length);
    
    let allListings = [];
    
    // Check each product URL
    for (const productUrl of uniqueUrls.slice(0, 3)) { // Check first 3 results
      try {
        console.log('Checking product URL:', productUrl);
        
        // Add delay between product checks
        await randomDelay(1500, 3000);
        
        // Use makeRequestWithRetry to handle 429 errors
        const productResponse = await makeRequestWithRetry(productUrl, {
          timeout: 10000,
          referer: searchUrl
        }, 2);

        const productHtml = productResponse.data;
        
        // Extract price
        const pricePatterns = [
          /class="_30jeq3[^"]*">([\d,]+)</g,
          /class="_1_WHN1[^"]*">([\d,]+)</g,
          /class="_16Jk6d[^"]*">([\d,]+)</g,
          /class="_30jeq3[^"]*">₹\s*([\d,]+)/g,
          /class="_1_WHN1[^"]*">₹\s*([\d,]+)/g,
          /class="_16Jk6d[^"]*">₹\s*([\d,]+)/g,
          /"price":\s*"₹\s*([\d,]+)"/g,
          /"price":\s*([\d,]+)/g,
          /₹\s*([\d,]+)/g,
          /data-price="([\d,]+)"/g
        ];
        
        let price = null;
        for (const pattern of pricePatterns) {
          const matches = productHtml.match(pattern);
          if (matches && matches.length > 0) {
            const priceText = matches[0].replace(/[^\d]/g, '');
            const extractedPrice = parseFloat(priceText);
            
            if (extractedPrice > 0 && extractedPrice < 1000000) { // Reasonable price range
              price = extractedPrice;
              console.log('Flipkart price found:', price);
              break;
            }
          }
        }
        
        // Extract title
        const titlePatterns = [
          /<span[^>]*class="_35KyD6[^"]*"[^>]*>([^<]+)<\/span>/g,
          /<h1[^>]*class="_2E8Pvz[^"]*"[^>]*>([^<]+)<\/h1>/g,
          /"title":\s*"([^"]+)"/g
        ];
        
        let title = null;
        for (const pattern of titlePatterns) {
          const matches = productHtml.match(pattern);
          if (matches && matches.length > 0) {
            title = matches[0].replace(/<[^>]*>/g, '').replace(/"/g, '').trim();
            break;
          }
        }
        
        if (price) {
          allListings.push({
            price: price,
            title: title || 'Product on Flipkart',
            url: productUrl,
            source: 'Flipkart',
            seller: 'Flipkart'
          });
        }
        
      } catch (productError) {
        console.log('Product URL check failed:', productError.message);
        continue;
      }
    }
    
    return allListings;
    
  } catch (error) {
    return [];
  }
};

// Main scraping function - Simple EAN search
export const scrapePricesByEAN = async (req, res) => {
  try {
    const { 
      eanCode, 
      sku, 
      productName, 
      productTitle, 
      modelNumber, 
      brandName, 
      manufacturerPartNumber 
    } = req.body;

    console.log('Starting simple EAN-based price scraping for:', eanCode);

    if (!eanCode) {
      return res.status(400).json({
        success: false,
        message: 'EAN code is required'
      });
    }

    if (!isValidEAN(eanCode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid EAN code format. Please provide a valid 8, 12, or 13 digit EAN code.'
      });
    }

    let amazonListings = [];
    let flipkartListings = [];
    let allListings = [];

    // Scrape Amazon
    try {
      console.log('Scraping Amazon...');
      amazonListings = await scrapeAmazonByEAN(eanCode);
      console.log('Amazon listings found:', amazonListings.length);
    } catch (error) {
    }

    // Scrape Flipkart
    try {
      console.log('Scraping Flipkart...');
      flipkartListings = await scrapeFlipkartByEAN(eanCode);
      console.log('Flipkart listings found:', flipkartListings.length);
    } catch (error) {
    }

    // Combine all listings
    allListings = [...amazonListings, ...flipkartListings];
    console.log('Total listings found:', allListings.length);

    // Extract all prices
    const allPrices = allListings.map(listing => listing.price);
    console.log('All prices found:', allPrices);

    // Calculate all price methods
    const priceAnalysis = {
      lowest: calculateCommonPrice(allPrices, 'lowest'),
      average: calculateCommonPrice(allPrices, 'average'),
      median: calculateCommonPrice(allPrices, 'median')
    };

    console.log('Price analysis calculated:', priceAnalysis);

    // Get product details from request or first listing
    const productDetails = {
      title: productTitle || (allListings.length > 0 ? allListings[0].title : 'Product not found'),
      eanCode: eanCode,
      sku: sku,
      productName: productName,
      modelNumber: modelNumber,
      brandName: brandName,
      manufacturerPartNumber: manufacturerPartNumber,
      totalListings: allListings.length,
      amazonListings: amazonListings.length,
      flipkartListings: flipkartListings.length
    };

    const response = {
      success: true,
      message: 'Price scraping completed successfully',
      data: {
        eanCode: eanCode,
        productDetails: productDetails,
        allListings: allListings,
        amazonListings: amazonListings,
        flipkartListings: flipkartListings,
        priceAnalysis: priceAnalysis,
        totalListings: allListings.length,
        allPrices: allPrices,
        timestamp: new Date().toISOString()
      }
    };

    console.log('Scraping completed successfully');
    console.log('Results:', response.data);

    return res.status(200).json(response);

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Price scraping failed',
      error: error.message
    });
  }
};

// Main function to get prices using product title and model number
export const getPricesByProductInfo = async (req, res) => {
  try {
    const { productTitle, modelNumber, sku, productName, brandName, manufacturerPartNumber, eanCode } = req.body;

    console.log('Getting prices using product info:', { productTitle, modelNumber, eanCode });

    // Product title is required, EAN code is optional
    if (!productTitle) {
      return res.status(400).json({
        success: false,
        message: 'Product title is required'
      });
    }

    let amazonResult = null;
    let flipkartResult = null;
    let allListings = [];

    // Optional: If EAN code is provided and valid, try EAN-based scraping first
    if (eanCode && isValidEAN(eanCode)) {
      console.log('EAN code provided (optional), trying EAN-based scraping...');
      try {
        // Scrape Amazon using EAN (optional)
        const amazonListings = await scrapeAmazonByEAN(eanCode);
        if (amazonListings && amazonListings.length > 0) {
          // Use the first/best listing from Amazon
          if (!amazonResult) {
            amazonResult = amazonListings[0];
          }
          allListings.push(...amazonListings);
          console.log('Amazon EAN scraping found:', amazonListings.length, 'listings');
        }
      } catch (amazonEanError) {
        console.log('Amazon EAN scraping failed (optional):', amazonEanError.message);
      }

      try {
        // Scrape Flipkart using EAN (optional)
        const flipkartListings = await scrapeFlipkartByEAN(eanCode);
        if (flipkartListings && flipkartListings.length > 0) {
          // Use the first/best listing from Flipkart
          if (!flipkartResult) {
            flipkartResult = flipkartListings[0];
          }
          allListings.push(...flipkartListings);
          console.log('Flipkart EAN scraping found:', flipkartListings.length, 'listings');
        }
      } catch (flipkartEanError) {
        console.log('Flipkart EAN scraping failed (optional):', flipkartEanError.message);
      }
      
      console.log('EAN scraping completed (optional). Continuing with product title method for better accuracy...');
    }

    // Step 1: Fetch Amazon ASIN
    try {
      console.log('Step 1: Fetching Amazon ASIN...');
      const asin = await fetchAmazonASIN(productTitle, modelNumber);
      
      if (asin) {
        console.log('Amazon ASIN found:', asin);
        
        // Step 2: Get Amazon price using ASIN
        console.log('Step 2: Getting Amazon price...');
        amazonResult = await getAmazonPriceByASIN(asin, productTitle);
        
        if (amazonResult) {
          // Dynamic chip validation - extract chip info from productTitle
          const chipInfo = extractChipInfoFromTitle(productTitle);
          if (chipInfo) {
            const titleLower = (amazonResult.title || '').toLowerCase();
            
            // Check if result contains any other chip models (should be rejected)
            const hasOtherChip = chipInfo.otherChips.some(chip => 
              titleLower.includes(chip.toLowerCase()) || 
              titleLower.includes(`${chip.toLowerCase()} chip`)
            );
            
            if (hasOtherChip) {
              console.log(`Rejecting Amazon result - Found other chip models when searching for ${chipInfo.chipModel}:`, amazonResult.title);
              amazonResult = null;
            }
            
            // Also ensure the correct chip is present in the result
            if (amazonResult && !titleLower.includes(chipInfo.chipLower) && !titleLower.includes(chipInfo.chipWithChip.toLowerCase())) {
              console.log(`Rejecting Amazon result - ${chipInfo.chipModel} not found in result title:`, amazonResult.title);
              amazonResult = null;
            }
            
            // Price validation for MacBook (should be between 80000-400000)
            if (amazonResult && amazonResult.price) {
              if (amazonResult.price < 50000) {
                console.log(`Rejecting Amazon result - Price too low for MacBook: ₹${amazonResult.price} (expected: ₹80000+)`, amazonResult.title);
                amazonResult = null;
              }
            }
          }
          
          if (amazonResult) {
            allListings.push(amazonResult);
          }
        }
      } else {
        console.log('No Amazon ASIN found');
      }
    } catch (error) {
    }

    // Step 3: Fetch Flipkart FSN with retry
    try {
      console.log('Step 3: Fetching Flipkart FSN...');
      let fsn = await fetchFlipkartFSN(productTitle, modelNumber);
      
      if (fsn) {
        console.log('Flipkart FSN found:', fsn);
        
        // Step 4: Get Flipkart price using FSN with retry
        console.log('Step 4: Getting Flipkart price...');
        let retryCount = 0;
        const maxRetries = 3;
        let isValidResult = false;
        
        while (retryCount < maxRetries && !isValidResult) {
          try {
            flipkartResult = await getFlipkartPriceByFSN(fsn, productTitle);
            console.log('Flipkart result:', flipkartResult);
            
            if (flipkartResult && flipkartResult.price) {
              // Dynamic chip validation - extract chip info from productTitle
              const chipInfo = extractChipInfoFromTitle(productTitle);
              if (chipInfo) {
                const titleLower = (flipkartResult.title || '').toLowerCase();
                
                // Check if result contains any other chip models (should be rejected)
                const hasOtherChip = chipInfo.otherChips.some(chip => 
                  titleLower.includes(chip.toLowerCase()) || 
                  titleLower.includes(`${chip.toLowerCase()} chip`)
                );
                
                if (hasOtherChip) {
                  console.log(`Rejecting Flipkart result - Found other chip models when searching for ${chipInfo.chipModel}:`, flipkartResult.title);
                  flipkartResult = null;
                  retryCount++;
                  if (retryCount < maxRetries) {
                    console.log('Waiting 3 seconds before retry...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                  }
                  continue;
                }
                
                // Also ensure the correct chip is present in the result
                if (flipkartResult && !titleLower.includes(chipInfo.chipLower) && !titleLower.includes(chipInfo.chipWithChip.toLowerCase())) {
                  console.log(`Rejecting Flipkart result - ${chipInfo.chipModel} not found in result title:`, flipkartResult.title);
                  flipkartResult = null;
                  retryCount++;
                  if (retryCount < maxRetries) {
                    console.log('Waiting 3 seconds before retry...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                  }
                  continue;
                }
                
                // Price validation for MacBook (should be between 80000-400000)
                if (flipkartResult && flipkartResult.price) {
                  if (flipkartResult.price < 50000) {
                    console.log(`Rejecting Flipkart result - Price too low for MacBook: ₹${flipkartResult.price} (expected: ₹80000+)`, flipkartResult.title);
                    flipkartResult = null;
                    retryCount++;
                    if (retryCount < maxRetries) {
                      console.log('Waiting 3 seconds before retry...');
                      await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                    continue;
                  }
                }
              }
              
              if (flipkartResult && flipkartResult.price) {
                console.log('Flipkart price found:', flipkartResult.price);
                allListings.push(flipkartResult);
                isValidResult = true;
                break;
              }
            } else {
              console.log(`Flipkart retry ${retryCount + 1}/${maxRetries} - No price found, result:`, flipkartResult);
              retryCount++;
              if (retryCount < maxRetries) {
                console.log('Waiting 3 seconds before retry...');
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds before retry
              }
            }
          } catch (retryError) {
            console.log(`Flipkart retry ${retryCount + 1}/${maxRetries} failed:`, retryError.message);
            retryCount++;
            if (retryCount < maxRetries) {
              console.log('Waiting 3 seconds before retry...');
              await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds before retry
            }
          }
        }
        
        if (!flipkartResult || !flipkartResult.price) {
          console.log('Flipkart price extraction failed after all retries');
        }
      } else {
        console.log('No Flipkart FSN found - this might be due to:');
        console.log('1. Product not available on Flipkart');
        console.log('2. Search query not matching any products');
        console.log('3. Flipkart blocking the request');
        console.log('4. Network connectivity issues');
        
        // Try alternative Flipkart search method
        console.log('Trying alternative Flipkart search method...');
        try {
          const alternativeResult = await searchFlipkartAlternative(productTitle, modelNumber);
          if (alternativeResult && alternativeResult.price) {
            console.log('Alternative Flipkart method found price:', alternativeResult.price);
            flipkartResult = alternativeResult;
            allListings.push(alternativeResult);
          }
        } catch (altError) {
          console.log('Alternative Flipkart method also failed:', altError.message);
        }
      }
    } catch (error) {
    }

    // Extract all prices
    const allPrices = allListings.map(listing => listing.price).filter(price => price > 0);
    console.log('All prices found:', allPrices);

    // Calculate all price methods
    const priceAnalysis = {
      lowest: calculateCommonPrice(allPrices, 'lowest'),
      average: calculateCommonPrice(allPrices, 'average'),
      median: calculateCommonPrice(allPrices, 'median')
    };

    console.log('Price analysis calculated:', priceAnalysis);

    // Calculate suggested pricing strategy
    const amazonPrice = amazonResult ? amazonResult.price : null;
    const flipkartPrice = flipkartResult ? flipkartResult.price : null;
    const suggestedPricing = calculateSuggestedPricing(amazonPrice, flipkartPrice);
    console.log('Suggested pricing calculated:', suggestedPricing);

    // Get product details
    const productDetails = {
      title: productTitle,
      sku: sku,
      productName: productName,
      modelNumber: modelNumber,
      brandName: brandName,
      manufacturerPartNumber: manufacturerPartNumber,
      totalListings: allListings.length,
      amazonListings: amazonResult ? 1 : 0,
      flipkartListings: flipkartResult ? 1 : 0
    };

    const response = {
      success: true,
      message: 'Price fetching completed successfully',
      data: {
        productDetails: productDetails,
        amazonResult: amazonResult,
        flipkartResult: flipkartResult,
        suggestedPricing: suggestedPricing
      }
    };

    console.log('Price fetching completed successfully');
    console.log('Results:', response.data);

    return res.status(200).json(response);

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Price fetching failed',
      error: error.message
    });
  }
};


// Get scraping statistics
export const getPriceScrapingStats = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: 'Price scraping statistics',
      data: {
        method: 'Simple EAN-based scraping',
        supportedPlatforms: ['Amazon India', 'Flipkart'],
        priceCalculationMethods: ['lowest', 'average', 'median'],
        features: [
          'Direct EAN code search',
          'Simple and effective scraping',
          'No complex filtering',
          'All seller prices included',
          'Multiple price calculation methods'
        ],
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to get statistics',
      error: error.message
    });
  }
};