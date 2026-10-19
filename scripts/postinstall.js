// Run optional installers — errors must never fail the parent package install
async function runInstallers() {
  try {
    await import('./rtk-installer.mjs');
  } catch (err) {
    console.warn('[postinstall] rtk-installer skipped:', err.message);
  }

  try {
    await import('./sqlite-installer.mjs');
  } catch (err) {
    console.warn('[postinstall] sqlite-installer skipped:', err.message);
  }
}

runInstallers().catch((err) => {
  console.warn('[postinstall] unexpected error (non-fatal):', err.message);
});
