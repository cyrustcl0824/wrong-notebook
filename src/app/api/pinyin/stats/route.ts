import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:pinyin:stats');

/**
 * GET /api/pinyin/stats
 * 获取用户的拼音练习统计
 */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return unauthorized();
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });
        if (!user) return unauthorized();

        const [totalCharacters, newCharacters, practicingCharacters, masteredCharacters, totalPractice, correctPractice] = await Promise.all([
            prisma.pinyinCharacter.count({ where: { userId: user.id } }),
            prisma.pinyinCharacter.count({ where: { userId: user.id, masteryLevel: 0 } }),
            prisma.pinyinCharacter.count({ where: { userId: user.id, masteryLevel: 1 } }),
            prisma.pinyinCharacter.count({ where: { userId: user.id, masteryLevel: 2 } }),
            prisma.pinyinPracticeRecord.count({ where: { userId: user.id } }),
            prisma.pinyinPracticeRecord.count({ where: { userId: user.id, isCorrect: true } }),
        ]);

        const accuracy = totalPractice > 0 ? Math.round((correctPractice / totalPractice) * 100) : 0;

        return NextResponse.json({
            totalCharacters,
            mastery: {
                new: newCharacters,
                practicing: practicingCharacters,
                mastered: masteredCharacters,
            },
            practice: {
                total: totalPractice,
                correct: correctPractice,
                accuracy,
            },
        });
    } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error fetching stats');
        return internalError();
    }
}
