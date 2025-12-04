import { logger } from './logger.js';

export async function getServerTime() {
  logger.info('开始获取华为服务器时间');
  const response = await fetch('https://openapi.vmall.com/serverTime.json');
  if (response.ok) {
    const data = await response.json();
    return data.serverTimeMs;
  }
  logger.error('华为服务器获取时间失败！');
  return Date.now();
}

export function getLocalTime() {
  return Date.now();
}

export async function getLocalHwTimeDiff() {
  const startTimestamp = getLocalTime();
  const serverTimestamp = await getServerTime();
  const endTimestamp = getLocalTime();
  
  const localTimestamp = Math.round((startTimestamp + endTimestamp) / 2);
  const msDiff = localTimestamp - serverTimestamp;
  
  logger.info(`当前华为服务器时间为：[${timestampToTime(serverTimestamp)}]`);
  logger.info(`当前本地时间为：[${timestampToTime(localTimestamp)}]`);
  
  const compareRes = msDiff >= 0 ? '晚于' : '早于';
  logger.info(`本地时间【${compareRes}】华为服务器时间【${Math.abs(msDiff)}】毫秒`);
  
  return { serverTimestamp, localTimestamp, msDiff };
}

export function timestampToTime(timestamp) {
  const date = new Date(timestamp);
  return date.toISOString().replace('T', ' ').slice(0, 23);
}

export function calcCountdownMsDiff(targetDateTime, msDiff) {
  const localTimestamp = getLocalTime() - msDiff;
  const targetTimestamp = targetDateTime.getTime();
  return targetTimestamp - localTimestamp;
}

export function calcCountdownTimes(targetDateTime, msDiff) {
  const localTimestamp = getLocalTime() - msDiff;
  const targetTimestamp = targetDateTime.getTime();
  let secDiff = Math.floor((targetTimestamp - localTimestamp) / 1000);
  
  const days = Math.max(Math.floor(secDiff / 86400), 0);
  secDiff -= days * 86400;
  const hours = Math.max(Math.floor(secDiff / 3600), 0);
  secDiff -= hours * 3600;
  const minutes = Math.max(Math.floor(secDiff / 60), 0);
  const seconds = Math.max(secDiff - minutes * 60, 0);
  const ms = Math.max(Math.floor(((targetTimestamp - localTimestamp) / 1000 - days * 86400 - hours * 3600 - minutes * 60 - seconds) * 1000), 0);
  
  return [
    String(days).padStart(2, '0'),
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
    String(ms).padStart(3, '0')
  ];
}

export function formatCountdownTime(times) {
  const units = ['天', '时', '分', '秒', '毫秒'];
  return times.map((t, i) => `${t}${units[i]}`).join(' ');
}