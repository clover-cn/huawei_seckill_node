import fs from 'fs';
import ini from 'ini';
import { logger } from './logger.js';

export class Config {
  constructor(filename) {
    logger.info('开始解析配置文件');
    this.config = ini.parse(fs.readFileSync(filename, 'utf-8'));
    logger.info('结束解析配置文件');
  }

  get(section, option, defaultValue = null) {
    const value = this.config[section]?.[option];
    return value !== undefined ? value : defaultValue;
  }

  getBoolean(section, option, defaultValue = false) {
    const value = this.get(section, option);
    if (value === null) return defaultValue;
    return value === 'yes' || value === 'true' || value === '1';
  }

  getInt(section, option, defaultValue = 0) {
    const value = this.get(section, option);
    return value !== null ? parseInt(value, 10) : defaultValue;
  }

  getFloat(section, option, defaultValue = 0) {
    const value = this.get(section, option);
    return value !== null ? parseFloat(value) : defaultValue;
  }
}