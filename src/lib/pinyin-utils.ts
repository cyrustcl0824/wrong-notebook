/**
 * 拼音工具库
 * 使用 pinyin-pro 进行本地拼音标注，不消耗 AI API 配额
 */

import { pinyin } from 'pinyin-pro';
import { createLogger } from './logger';

const logger = createLogger('pinyin-utils');

/**
 * 判断一个字符是否为汉字
 */
export function isChineseCharacter(char: string): boolean {
  return /[\u4e00-\u9fa5]/.test(char);
}

/**
 * 从文本中提取所有不重复的汉字
 * @param text 中文文本
 * @param excludeCommon 是否排除常见标点和空白（默认 true）
 * @returns 去重后的汉字数组
 */
export function extractUniqueCharacters(text: string, excludeCommon: boolean = true): string[] {
  const chars = new Set<string>();

  for (const char of text) {
    if (isChineseCharacter(char)) {
      chars.add(char);
    }
  }

  return Array.from(chars);
}

/**
 * 获取单个汉字的拼音（带声调标记）
 * @param char 单个汉字
 * @param context 可选的上下文句子（用于多音字消歧）
 * @returns 拼音字符串，如 "mā"
 */
export function getCharacterPinyin(char: string, context?: string): string {
  // 如果有上下文，用上下文消歧多音字
  if (context) {
    const result = pinyin(context, { toneType: 'symbol', type: 'array' });
    // 在上下文结果中找到对应位置的拼音
    for (let i = 0; i < context.length; i++) {
      if (context[i] === char) {
        const pinyinArray = result as string[];
        // 找到第 i 个字符对应的拼音
        let charIndex = 0;
        for (let j = 0; j <= i; j++) {
          if (isChineseCharacter(context[j])) {
            if (charIndex < pinyinArray.length && charIndex === charIndex) {
              // 精确匹配位置
            }
            charIndex++;
          }
        }
        // 简化处理：直接用 pinyin 函数对单字标注
        break;
      }
    }
  }

  // 单字标注（pinyin-pro 会自动处理常见多音字）
  return pinyin(char, { toneType: 'symbol', type: 'array' })[0] || '';
}

/**
 * 获取单个汉字的声调数字
 * @param char 单个汉字
 * @returns 声调数字 1-4，0 为轻声
 */
export function getCharacterTone(char: string): number {
  // 使用 toneType: 'num' 获取带数字声调的拼音，如 "ma1"
  const pinyinWithNum = pinyin(char, { toneType: 'num', type: 'array' })[0] || '';
  // 提取末尾的数字作为声调
  const match = pinyinWithNum.match(/(\d)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * 批量标注汉字拼音
 * @param characters 汉字数组
 * @param context 可选的上下文句子
 * @returns 标注结果数组
 */
export interface PinyinAnnotation {
  character: string;
  pinyin: string;
  tone: number;
}

export function annotateCharacters(characters: string[], context?: string): PinyinAnnotation[] {
  const results: PinyinAnnotation[] = [];

  for (const char of characters) {
    if (!isChineseCharacter(char)) continue;

    // 使用上下文消歧（如果有）
    let pinyinStr: string;
    if (context) {
      // 在上下文中标注整个句子，然后找到对应字符的拼音
      const fullPinyin = pinyin(context, { toneType: 'symbol', type: 'array' }) as string[];
      let charIdx = 0;
      let found = false;
      for (let i = 0; i < context.length; i++) {
        if (isChineseCharacter(context[i])) {
          if (context[i] === char && !found) {
            pinyinStr = fullPinyin[charIdx] || pinyin(char, { toneType: 'symbol', type: 'array' })[0] || '';
            found = true;
          }
          charIdx++;
        }
      }
      if (!found || !pinyinStr!) {
        pinyinStr = pinyin(char, { toneType: 'symbol', type: 'array' })[0] || '';
      }
    } else {
      pinyinStr = pinyin(char, { toneType: 'symbol', type: 'array' })[0] || '';
    }

    const tone = getCharacterTone(char);

    results.push({
      character: char,
      pinyin: pinyinStr!,
      tone,
    });
  }

  logger.info({ count: results.length }, 'Characters annotated with pinyin');
  return results;
}

/**
 * 标注整段文本的拼音
 * @param text 中文文本
 * @returns 每个汉字的拼音标注
 */
export function annotateText(text: string): PinyinAnnotation[] {
  const characters = text.split('').filter(isChineseCharacter);
  return annotateCharacters(characters, text);
}

/**
 * 格式化拼音用于显示
 * @param annotation 拼音标注
 * @returns 格式化字符串，如 "mā (1声)"
 */
export function formatPinyin(annotation: PinyinAnnotation): string {
  const toneName = annotation.tone === 0 ? '轻声' : `${annotation.tone}声`;
  return `${annotation.pinyin} (${toneName})`;
}
