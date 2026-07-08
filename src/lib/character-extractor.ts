/**
 * 生字提取器
 * 从题库的 Question 记录中提取中文汉字，创建 PinyinCharacter 记录
 */

import { prisma } from './prisma';
import { extractUniqueCharacters, annotateCharacters, PinyinAnnotation } from './pinyin-utils';
import { createLogger } from './logger';

const logger = createLogger('character-extractor');

/**
 * 从单个题目的文本中提取生字并创建 PinyinCharacter 记录
 * @param userId 用户 ID
 * @param questionId 题目 ID
 * @param questionText 题目文本
 * @returns 创建/更新的 PinyinCharacter 记录数
 */
export async function extractCharactersFromQuestion(
  userId: string,
  questionId: string,
  questionText: string
): Promise<number> {
  // 提取不重复的汉字
  const characters = extractUniqueCharacters(questionText);

  if (characters.length === 0) {
    return 0;
  }

  // 用完整题目文本作为上下文进行拼音标注（多音字消歧）
  const annotations = annotateCharacters(characters, questionText);

  let created = 0;

  for (const annotation of annotations) {
    // upsert: 如果该用户已有这个字，更新来源信息；否则创建新记录
    await prisma.pinyinCharacter.upsert({
      where: {
        userId_character: {
          userId,
          character: annotation.character,
        },
      },
      create: {
        userId,
        character: annotation.character,
        pinyin: annotation.pinyin,
        tone: annotation.tone,
        sourceText: questionText.substring(0, 500), // 保留上下文
        sourceQuestionId: questionId,
      },
      update: {
        // 如果已存在，只更新拼音标注（可能上下文不同导致读音不同）
        pinyin: annotation.pinyin,
        tone: annotation.tone,
      },
    });
    created++;
  }

  logger.info({ questionId, characterCount: created }, 'Characters extracted from question');
  return created;
}

/**
 * 从整个题库批量提取生字
 * @param userId 用户 ID
 * @param questionBankId 题库 ID
 * @returns 提取统计 { totalQuestions, totalCharacters }
 */
export async function extractCharactersFromBank(
  userId: string,
  questionBankId: string
): Promise<{ totalQuestions: number; totalCharacters: number }> {
  // 获取题库中的所有题目
  const questions = await prisma.question.findMany({
    where: {
      questionBankId,
      questionBank: {
        userId,
      },
    },
    select: {
      id: true,
      questionText: true,
    },
  });

  logger.info({ questionBankId, questionCount: questions.length }, 'Starting batch character extraction');

  let totalCharacters = 0;

  for (const question of questions) {
    const count = await extractCharactersFromQuestion(userId, question.id, question.questionText);
    totalCharacters += count;
  }

  logger.info({ questionBankId, totalQuestions: questions.length, totalCharacters }, 'Batch extraction complete');

  return {
    totalQuestions: questions.length,
    totalCharacters,
  };
}

/**
 * 获取用户的拼音生字列表
 * @param userId 用户 ID
 * @param options 筛选选项
 */
export async function getUserPinyinCharacters(
  userId: string,
  options?: {
    masteryLevel?: number;
    limit?: number;
    offset?: number;
  }
) {
  const where = {
    userId,
    ...(options?.masteryLevel !== undefined && { masteryLevel: options.masteryLevel }),
  };

  const [characters, total] = await Promise.all([
    prisma.pinyinCharacter.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    }),
    prisma.pinyinCharacter.count({ where }),
  ]);

  return { characters, total };
}

/**
 * 更新生字的掌握程度
 * @param characterId PinyinCharacter ID
 * @param userId 用户 ID（用于验证）
 * @param isCorrect 本次练习是否正确
 */
export async function updateCharacterMastery(
  characterId: string,
  userId: string,
  isCorrect: boolean
): Promise<void> {
  const character = await prisma.pinyinCharacter.findFirst({
    where: { id: characterId, userId },
  });

  if (!character) {
    throw new Error('Character not found or not owned by user');
  }

  const newPracticeCount = character.practiceCount + 1;
  const newCorrectCount = character.correctCount + (isCorrect ? 1 : 0);
  const accuracy = newCorrectCount / newPracticeCount;

  // 掌握度规则：
  // 0: 新字（练习次数 < 3）
  // 1: 练习中（练习次数 >= 3 但正确率 < 80%）
  // 2: 已掌握（练习次数 >= 5 且正确率 >= 80%）
  let newMasteryLevel = 0;
  if (newPracticeCount >= 5 && accuracy >= 0.8) {
    newMasteryLevel = 2;
  } else if (newPracticeCount >= 3) {
    newMasteryLevel = 1;
  }

  await prisma.pinyinCharacter.update({
    where: { id: characterId },
    data: {
      practiceCount: newPracticeCount,
      correctCount: newCorrectCount,
      masteryLevel: newMasteryLevel,
    },
  });

  logger.info({
    characterId,
    character: character.character,
    practiceCount: newPracticeCount,
    correctCount: newCorrectCount,
    masteryLevel: newMasteryLevel,
  }, 'Character mastery updated');
}
