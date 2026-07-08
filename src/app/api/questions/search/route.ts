import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, badRequest, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:questions:search');

/**
 * GET /api/questions/search
 * 跨题库搜索题目
 * Query params: ?q=keyword&subject=math&questionType=choice&difficulty=easy&page=1&pageSize=20
 * 在 questionText 字段中进行不区分大小文的模糊搜索（SQLite 使用 Prisma contains）
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
        const q = searchParams.get("q");
        const subject = searchParams.get("subject");
        const questionType = searchParams.get("questionType");
        const difficulty = searchParams.get("difficulty");
        const page = parseInt(searchParams.get("page") || "1", 10);
        const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);

        if (!q || !q.trim()) {
            return badRequest("Search query 'q' is required");
        }

        // 构建查询条件
        const where: {
            questionBank: { userId: string; subject?: string };
            questionText: { contains: string };
            questionType?: string;
            difficulty?: string;
        } = {
            questionBank: { userId: user.id },
            questionText: { contains: q.trim() },
        };

        if (subject) {
            where.questionBank.subject = subject;
        }
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
                    questionBank: {
                        select: {
                            id: true,
                            title: true,
                            subject: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
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
        logger.error({ error }, 'Error searching questions');
        return internalError("Failed to search questions");
    }
}
