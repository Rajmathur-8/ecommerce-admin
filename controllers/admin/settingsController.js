import Settings from '../../models/settings.js';

// Get all settings
export const getSettings = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    
    res.json({
      success: true,
      message: 'Settings retrieved successfully',
      data: settings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve settings',
      error: error.message
    });
  }
};

// Update settings
export const updateSettings = async (req, res) => {
  try {
    const updates = req.body;
  

    const settings = await Settings.updateSettings(updates);
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: settings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update settings',
      error: error.message
    });
  }
};

// Get specific setting category
export const getSettingCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const settings = await Settings.getSettings();
    
    const validCategories = [
      'emailSettings',
      'stockAlertSettings',
      'activeUserSettings',
      'generalSettings',
      'orderSettings',
      'notificationSettings',
      'codSettings'
    ];
    
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Valid categories: ${validCategories.join(', ')}`
      });
    }
    
    res.json({
      success: true,
      message: `${category} retrieved successfully`,
      data: settings[category]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve setting category',
      error: error.message
    });
  }
};

// Update specific setting category
export const updateSettingCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const updates = req.body;
    

    const validCategories = [
      'emailSettings',
      'stockAlertSettings',
      'activeUserSettings',
      'generalSettings',
      'orderSettings',
      'notificationSettings',
      'codSettings'
    ];
    
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Valid categories: ${validCategories.join(', ')}`
      });
    }

    const settings = await Settings.updateSettings(
      { [category]: updates },
 
    );
    
    res.json({
      success: true,
      message: `${category} updated successfully`,
      data: settings[category]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update setting category',
      error: error.message
    });
  }
};

// Reset settings to default
export const resetSettings = async (req, res) => {
  try {
   

    // Delete existing settings and create new default
    await Settings.deleteMany({});
  
    
    res.json({
      success: true,
      message: 'Settings reset to default successfully',
      data: settings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to reset settings',
      error: error.message
    });
  }
};

export default {
  getSettings,
  updateSettings,
  getSettingCategory,
  updateSettingCategory,
  resetSettings
};

