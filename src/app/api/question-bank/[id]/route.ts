import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, forbidden, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:question-bank:id');

/**
 * GET /api/question-bank/[id]
 * 获取单个题库及其所有题目（包含标签）
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
            include: {
                questions: {
                    include: {
                        tags: true,
                    },
                    orderBy: {
                        pageNumber: 'asc',
                    },
                },
                _count: {
                    select: {
                        questions: true,
                    },
                },
            },
        });

        if (!questionBank) {
            return notFound("Question bank not found");
        }

        if (questionBank.userId !== user.id) {
            return forbidden("Not authorized to access this question bank");
        }

        return NextResponse.json(questionBank);
    } catch (error) {
        logger.error({ error, id }, 'Error fetching question bank');
        return internalError("Failed to fetch question bank");
    }
}

/**
 * DELETE /api/question-bank/[id]
 * 删除题库及其所有题目（级联删除由 Prisma schema 配置）
 */
export async function DELETE(
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
        });

        if (!questionBank) {
            return notFound("Question bank not found");
        }

        if (questionBank.userId !== user.id) {
            return forbidden("Not authorized to delete this question bank");
        }

        await prisma.questionBank.delete({
            where: { id },
        });

        logger.info({ id, userId: user.id }, 'Question bank deleted');

        return NextResponse.json({ message: "Question bank deleted successfully" });
    } catch (error) {
        logger.error({ error, id }, 'Error deleting question bank');
        return internalError("Failed to delete question bank");
    }
}
