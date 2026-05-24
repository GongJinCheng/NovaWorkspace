/**
 * Settings Page — 设置页面
 */

import { registerPageInit } from '../../app/router';
import { getThemeMode, setThemeMode } from '../../app/theme';

function initSettingsPage(): void {
  initThemeSelector();
  console.log('[Settings] 页面初始化完成');
}

function initThemeSelector(): void {
  const currentMode = getThemeMode();
  const radios = document.querySelectorAll('input[name="theme-mode"]') as NodeListOf<HTMLInputElement>;
  radios.forEach(radio => {
    radio.checked = radio.value === currentMode;
    radio.addEventListener('change', () => {
      if (radio.checked) {
        setThemeMode(radio.value as 'light' | 'dark' | 'system');
      }
    });
  });
}

registerPageInit('settings', initSettingsPage);

export { initSettingsPage };