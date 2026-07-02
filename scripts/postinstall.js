import('./rtk-installer.js').then(() => {
  return import('./sqlite-installer.js');
});
