import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, forbidden, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:question-bank:questions');

/**
 * GET /api/question-bank/[id]/questions
 * 获取题库中的题目列表，支持筛选和分页
 * Query params: ?questionType=choice&difficulty=easy&page=1&pageSize=20
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
            select: { id: true, userId: true },
        });

        if (!questionBank) {
            return notFound("Question bank not found");
        }

        if (questionBank.userId !== user.id) {
            return forbidden("Not authorized to access this question bank");
        }

        const { searchParams } = new URL(req.url);
        const questionType = searchParams.get("questionType");
        const difficulty = searchParams.get("difficulty");
        const page = parseInt(searchParams.get("page") || "1", 10);
        const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);

        const where: {
            questionBankId: string;
            questionType?: string;
            difficulty?: string;
        } = { questionBankId: id };

        if (questionType) {
            where.questionType = questionType;
        }
        if (difficulty) {
            where.difficulty = difficulty;
        }

        const [questions, total] = await Promise.all([
            prisma.question.findMany({
                where,
                include: {
                    tags: true,
                },
                orderBy: [
                    { pageNumber: 'asc' },
                    { questionNumber: 'asc' },
                ],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            prisma.question.count({ where }),
        ]);

        return NextResponse.json({
            questions,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
            },
        });
    } catch (error) {
        logger.error({ error, id }, 'Error fetching questions');
        return internalError("Failed to fetch questions");
    }
}
