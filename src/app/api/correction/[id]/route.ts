import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError, notFound } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:correction:id');

/**
 * GET /api/correction/[id]
 * 获取批改会话详情（含 AI 批改结果）
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
            include: {
                errorItems: {
                    select: {
                        id: true,
                        questionText: true,
                        answerText: true,
                        analysis: true,
                        createdAt: true,
                    },
                },
            },
        });

        if (!correction) {
            return notFound("Correction session not found");
        }

        // 解析 result JSON
        let result = null;
        if (correction.result) {
            try {
                result = JSON.parse(correction.result);
            } catch {
                result = null;
            }
        }

        return NextResponse.json({
            ...correction,
            result,
        });
    } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error getting correction');
        return internalError();
    }
}

/**
 * DELETE /api/correction/[id]
 * 删除批改会话
 */
export async function DELETE(
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
        });

        if (!correction) {
            return notFound("Correction session not found");
        }

        await prisma.correctionSession.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error deleting correction');
        return internalError();
    }
}
