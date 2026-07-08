import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, forbidden, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:questions:id');

/**
 * GET /api/questions/[id]
 * 获取单个题目及其标签和所属题库信息
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

        const question = await prisma.question.findUnique({
            where: { id },
            include: {
                tags: true,
                questionBank: {
                    select: {
                        id: true,
                        title: true,
                        subject: true,
                        userId: true,
                    },
                },
            },
        });

        if (!question) {
            return notFound("Question not found");
        }

        // 通过 questionBank.userId 验证所有权
        if (question.questionBank.userId !== user.id) {
            return forbidden("Not authorized to access this question");
        }

        return NextResponse.json(question);
    } catch (error) {
        logger.error({ error, id }, 'Error fetching question');
        return internalError("Failed to fetch question");
    }
}
