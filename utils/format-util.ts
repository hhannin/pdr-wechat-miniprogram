// utils/format-util.ts

/**
 * 个位数补零
 * @param num 数字
 * @returns 补零后的字符串，如 3 -> "03"
 */
export function pad(num: number): string {
  return num.toString().padStart(2, '0')
}

/**
 * 格式化时间戳为可读字符串
 * @param timestamp 时间戳
 * @returns 格式化的时间字符串
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${date.getMilliseconds()}`
}