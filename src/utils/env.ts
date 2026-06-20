import os from 'os';

export function isDevelopmentMode(): boolean {
  const debugDevices = process.env.DEBUG_DEVICES?.split(',')
    .map((device) => device.trim().toUpperCase())
    .filter(Boolean);

  // Default device list if env var is unset or empty
  const allowedDevices = debugDevices && debugDevices.length > 0 ? debugDevices : ['DESKTOP-JVTSJ6I'];

  const currentHostname = os.hostname().toUpperCase();
  return allowedDevices.includes(currentHostname);
}
