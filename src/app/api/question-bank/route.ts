import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:question-bank');

/**
 * GET /api/question-bank
 * 获取用户所有题库，支持按学科筛选
 * Query params: ?subject=math
 */
export async function GET(req: Request) {
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

        const { searchParams } = new URL(req.url);
        const subject = searchParams.get("subject");

        const where: { userId: string; subject?: string } = { userId: user.id };
        if (subject) {
            where.subject = subject;
        }

        const questionBanks = await prisma.questionBank.findMany({
            where,
            include: {
                _count: {
                    select: {
                        questions: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return NextResponse.json(questionBanks);
    } catch (error) {
        logger.error({ error }, 'Error fetching question banks');
        return internalError("Failed to fetch question banks");
    }
}
