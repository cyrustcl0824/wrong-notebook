import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { getAIService } from "@/lib/ai";
import { unauthorized, forbidden, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:questions:similar');

/**
 * GET /api/questions/[id]/similar
 * 查找相似题目（举一反三）
 * 策略：
 * 1. 获取题目及其知识点标签
 * 2. 查找共享相同标签的其他题目 (same_knowledge)
 * 3. 如果结果不足 5 条，使用 AI 生成相似题
 * Query params: ?limit=5
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

        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get("limit") || "5", 10);

        // 获取题目及其标签
        const question = await prisma.question.findUnique({
            where: { id },
            include: {
                tags: true,
                questionBank: {
                    select: { userId: true },
                },
            },
        });

        if (!question) {
            return notFound("Question not found");
        }

        // 验证所有权
        if (question.questionBank.userId !== user.id) {
            return forbidden("Not authorized to access this question");
        }

        const knowledgePoints = question.tags.map(t => t.name);

        // 策略 1: 查找共享相同标签的其他题目
        const matchedQuestions: Awaited<ReturnType<typeof prisma.question.findMany>> = [];

        if (knowledgePoints.length > 0) {
            const tagMatches = await prisma.question.findMany({
                where: {
                    id: { not: id },
                    questionBank: { userId: user.id },
                    tags: {
                        some: {
                            name: { in: knowledgePoints },
                        },
                    },
                },
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
                take: limit,
            });

            matchedQuestions.push(...tagMatches);

            // 如果标签匹配不足，尝试查找同题库的其他题目
            if (matchedQuestions.length < limit) {
                const sameBankQuestions = await prisma.question.findMany({
                    where: {
                        id: {
                            not: id,
                            notIn: matchedQuestions.map(q => q.id),
                        },
                        questionBankId: question.questionBankId,
                    },
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
                    take: limit - matchedQuestions.length,
                });

                matchedQuestions.push(...sameBankQuestions);
            }
        }

        // 策略 2: 如果仍然不足，使用 AI 生成相似题
        const aiGenerated: Array<{
            questionText: string;
            answerText: string;
            analysis: string;
            knowledgePoints: string[];
            source: string;
        }> = [];

        if (matchedQuestions.length < limit) {
            try {
                const aiService = getAIService();
                const aiResult = await aiService.generateSimilarQuestion(
                    question.questionText,
                    knowledgePoints
                );

                aiGenerated.push({
                    questionText: aiResult.questionText,
                    answerText: aiResult.answerText,
                    analysis: aiResult.analysis,
                    knowledgePoints: aiResult.knowledgePoints,
                    source: "ai_generated",
                });

                logger.info({ questionId: id }, 'AI generated similar question');
            } catch (aiError) {
                logger.error({ error: aiError, questionId: id }, 'AI similar question generation failed');
                // AI 失败不影响已有结果的返回
            }
        }

        return NextResponse.json({
            questionId: id,
            matchedQuestions: matchedQuestions.map(q => ({
                ...q,
                source: "same_knowledge",
            })),
            aiGenerated,
            totalFound: matchedQuestions.length + aiGenerated.length,
        });
    } catch (error) {
        logger.error({ error, id }, 'Error finding similar questions');
        return internalError("Failed to find similar questions");
    }
}
