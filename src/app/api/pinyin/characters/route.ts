import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:pinyin:characters');

/**
 * GET /api/pinyin/characters
 * 获取用户的拼音生字列表
 * Query params: ?masteryLevel=0&limit=50&offset=0
 */
export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return unauthorized();
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });
        if (!user) return unauthorized();

        const { searchParams } = new URL(req.url);
        const masteryLevel = searchParams.get('masteryLevel');
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);

        const where = {
            userId: user.id,
            ...(masteryLevel !== null && masteryLevel !== undefined && { masteryLevel: parseInt(masteryLevel, 10) }),
        };

        const [characters, total] = await Promise.all([
            prisma.pinyinCharacter.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.pinyinCharacter.count({ where }),
        ]);

        return NextResponse.json({ characters, total });
    } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error fetching characters');
        return internalError();
    }
}
