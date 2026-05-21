/**
 * Settings Page — 设置页面
 */

import { registerPageInit } from '../../app/router';

function initSettingsPage(): void {
  console.log('[Settings] 页面初始化');
  // Settings page is a placeholder for now
}

registerPageInit('settings', initSettingsPage);

export { initSettingsPage };