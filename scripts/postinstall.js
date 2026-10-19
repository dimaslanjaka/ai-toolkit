import('./rtk-installer.mjs').then(() => {
  return import('./sqlite-installer.mjs');
});
