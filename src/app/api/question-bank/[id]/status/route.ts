import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, forbidden, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:question-bank:status');

/**
 * GET /api/question-bank/[id]/status
 * 获取题库处理状态（用于前端轮询）
 * 返回: { status, totalPageCount, processedPages, errorMessage }
 */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    try {
        let user;
        if (session?.user?.email) {
            user = await prisma.user.findUnique({
                where: { email: session.user.email },
            });
        }

        if (!user) {
            return unauthorized("Authentication required");
        }

        const questionBank = await prisma.questionBank.findUnique({
            where: { id },
            select: {
                id: true,
                userId: true,
                status: true,
                totalPageCount: true,
                processedPages: true,
                errorMessage: true,
            },
        });

        if (!questionBank) {
            return notFound("Question bank not found");
        }

        if (questionBank.userId !== user.id) {
            return forbidden("Not authorized to access this question bank");
        }

        return NextResponse.json({
            status: questionBank.status,
            totalPageCount: questionBank.totalPageCount,
            processedPages: questionBank.processedPages,
            errorMessage: questionBank.errorMessage,
        });
    } catch (error) {
        logger.error({ error, id }, 'Error fetching question bank status');
        return internalError("Failed to fetch question bank status");
    }
}
