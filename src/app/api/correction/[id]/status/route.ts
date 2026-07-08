import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError, notFound } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:correction:status');

/**
 * GET /api/correction/[id]/status
 * 获取批改处理状态（前端轮询用）
 */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return unauthorized();
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });
        if (!user) return unauthorized();

        const { id } = await params;

        const correction = await prisma.correctionSession.findFirst({
            where: { id, userId: user.id },
            select: {
                id: true,
                status: true,
                errorMessage: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!correction) {
            return notFound("Correction session not found");
        }

        return NextResponse.json(correction);
    } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error getting status');
        return internalError();
    }
}
