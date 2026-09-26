/**
 * portability-csv.ts —— 导出用的 CSV 拼装（纯函数，无服务端依赖）。
 *
 * 独立成文件只有一个理由：它是能被 node --test 直接跑的那部分。
 * 转义规则错了不会抛异常，只会让导出的表格列错位——学生看到自己一学期
 * 的挑战记录串成一行，比导不出更糟。
 */

/** 单元格转义：教学正文里必然出现逗号、引号与换行（学生问题、老师的话）。 */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  // BOM：Excel 打开无 BOM 的 UTF-8 CSV 会把中文显示成乱码。
  // BOM 用转义写而不是字面量：Excel 靠它识别 UTF-8 中文，
  // 但字面量 U+FEFF 会被 lint 判成不规则空白。
  return `\ufeff${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
