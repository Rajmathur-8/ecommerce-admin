// Configuration file for the ecommerce backend

export const config = {
  // Scraping API Keys - Get free API key from https://www.scrapingbee.com/
  SCRAPING_BEE_API_KEY: process.env.SCRAPING_BEE_API_KEY,
  SCRAPER_API_KEY: process.env.SCRAPER_API_KEY , 
  
  // Other API configurations
  AMAZON_BASE_URL: 'https://www.amazon.in',
  FLIPKART_BASE_URL: 'https://www.flipkart.com',
  
  // Scraping settings
  SCRAPING_TIMEOUT: 10000, // 10 seconds
  SCRAPING_RETRY_ATTEMPTS: 3,
  
  // Price calculation settings
  COMPETITIVE_PRICE_DISCOUNT: 0.9, // 10% less than competitor
  SUGGESTED_PRICE_DISCOUNT: 0.9, // 10% less than lowest competitor
};

// Helper function to get scraping configuration
export const getScrapingConfig = () => {
  return {
    apiKey: config.SCRAPING_BEE_API_KEY,
    timeout: config.SCRAPING_TIMEOUT,
    retryAttempts: config.SCRAPING_RETRY_ATTEMPTS,
  };
};

// Helper function to calculate competitive price
export const calculateCompetitivePrice = (competitorPrice) => {
  return Math.round(competitorPrice * config.COMPETITIVE_PRICE_DISCOUNT);
};

// Helper function to calculate suggested price
export const calculateSuggestedPrice = (competitorPrices) => {
  if (!competitorPrices || competitorPrices.length === 0) {
    return null;
  }
  
  const lowestPrice = Math.min(...competitorPrices.filter(price => price !== null));
  return Math.round(lowestPrice * config.SUGGESTED_PRICE_DISCOUNT);
};
