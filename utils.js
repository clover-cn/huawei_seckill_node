import fs from 'fs';
import path from 'path';
import { COOKIES_FILE } from './constants.js';

export function getProfilePath(baseProfilePath, browserType, serialNo = 1) {
  return path.join(baseProfilePath, browserType, `profile_${serialNo}`);
}

export function createDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function writeCookies(cookies) {
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}

export function readCookies() {
  if (!fs.existsSync(COOKIES_FILE)) return null;
  return JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}