import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError, badRequest, notFound } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { extractCharactersFromBank } from "@/lib/character-extractor";

const logger = createLogger('api:pinyin:extract');

/**
 * POST /api/pinyin/extract
 * 从指定题库提取生字，创建 PinyinCharacter 记录
 * Body: { questionBankId: string }
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
        const { questionBankId } = body;

        if (!questionBankId) {
            return badRequest("questionBankId is required");
        }

        // 验证题库归属权
        const bank = await prisma.questionBank.findFirst({
            where: { id: questionBankId, userId: user.id },
        });
        if (!bank) {
            return notFound("Question bank not found");
        }

        if (bank.status !== 'ready') {
            return badRequest("Question bank is not ready. Current status: " + bank.status);
        }

        logger.info({ userId: user.id, questionBankId }, 'Starting character extraction');

        const result = await extractCharactersFromBank(user.id, questionBankId);

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error extracting characters');
        return internalError(error instanceof Error ? error.message : "Failed to extract characters");
    }
}
