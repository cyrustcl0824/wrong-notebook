import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError, badRequest, notFound } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { updateCharacterMastery } from "@/lib/character-extractor";

const logger = createLogger('api:pinyin:practice');

/**
 * POST /api/pinyin/practice
 * 记录一次拼音练习
 * Body: { characterId: string, userInput: string, isCorrect: boolean, responseTimeMs?: number }
 */
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return unauthorized();
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });
        if (!user) return unauthorized();

        const body = await req.json();
        const { characterId, userInput, isCorrect, responseTimeMs } = body;

        if (!characterId || typeof isCorrect !== 'boolean') {
            return badRequest("characterId and isCorrect are required");
        }

        // 验证生字归属权
        const character = await prisma.pinyinCharacter.findFirst({
            where: { id: characterId, userId: user.id },
        });
        if (!character) {
            return notFound("Character not found");
        }

        // 创建练习记录
        await prisma.pinyinPracticeRecord.create({
            data: {
                userId: user.id,
                characterId,
                userInput: userInput || '',
                isCorrect,
                responseTimeMs: responseTimeMs || null,
            },
        });

        // 更新掌握度
        await updateCharacterMastery(characterId, user.id, isCorrect);

        // 返回更新后的生字信息
        const updated = await prisma.pinyinCharacter.findUnique({
            where: { id: characterId },
        });

        return NextResponse.json({
            success: true,
            character: updated,
        });
    } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error recording practice');
        return internalError();
    }
}
