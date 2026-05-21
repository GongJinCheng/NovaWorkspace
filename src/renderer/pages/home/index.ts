/**
 * Home Page - index
 */

import { registerPageInit } from '../../app/router';

function initHomePage(): void {
  console.log('[Home] init');
}

registerPageInit('home', initHomePage);

export { initHomePage };
