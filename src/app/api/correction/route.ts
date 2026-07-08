import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError, notFound } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:correction');

/**
 * GET /api/correction
 * 获取用户的批改会话列表
 * Query: ?limit=20&offset=0
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
        const limit = parseInt(searchParams.get('limit') || '20', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);

        const [sessions, total] = await Promise.all([
            prisma.correctionSession.findMany({
                where: { userId: user.id },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
                select: {
                    id: true,
                    imageUrl: true,
                    status: true,
                    errorMessage: true,
                    createdAt: true,
                    updatedAt: true,
                    _count: { select: { errorItems: true } },
                },
            }),
            prisma.correctionSession.count({ where: { userId: user.id } }),
        ]);

        return NextResponse.json({ sessions, total });
    } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error listing corrections');
        return internalError();
    }
}
