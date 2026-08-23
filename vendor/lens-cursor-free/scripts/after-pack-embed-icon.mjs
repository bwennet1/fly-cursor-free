#!/usr/bin/env node
/**
 * electron-builder afterPack — embed Relay icon into Relay.exe on Windows.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { rcedit } from 'rcedit';

/** @param {import('app-builder-lib').AfterPackContext} context */
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const projectDir = context.packager.projectDir;
  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = join(context.appOutDir, exeName);
  const iconPath = join(projectDir, 'resources', 'icon.ico');

  if (!existsSync(exePath)) {
    console.warn(`after-pack-embed-icon: skip, missing ${exePath}`);
    return;
  }
  if (!existsSync(iconPath)) {
    console.warn(`after-pack-embed-icon: skip, missing ${iconPath}`);
    return;
  }

  await rcedit(exePath, { icon: iconPath });
  console.log(`after-pack-embed-icon: embedded icon into ${exeName}`);
}
