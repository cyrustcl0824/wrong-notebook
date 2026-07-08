import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError, notFound, badRequest } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import type { CorrectionResult } from "@/lib/ai/types";

const logger = createLogger('api:correction:archive-all');

/**
 * POST /api/correction/[id]/archive-all
 * 一键归档所有错题到错题本
 */
export async function POST(
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

        if (correction.status !== 'completed') {
            return badRequest("Correction is not completed yet");
        }

        let result: CorrectionResult;
        try {
            result = JSON.parse(correction.result || '{}');
        } catch {
            return internalError("Failed to parse correction result");
        }

        // 筛选错题（isCorrect === false）
        const wrongQuestions = result.questions?.filter(q => q.isCorrect === false) || [];

        if (wrongQuestions.length === 0) {
            return NextResponse.json({ success: true, archivedCount: 0, message: "No wrong questions to archive" });
        }

        // 获取或创建学科
        let subjectId: string | undefined;
        if (result.subject) {
            let subject = await prisma.subject.findFirst({
                where: { name: result.subject, userId: user.id },
            });
            if (!subject) {
                subject = await prisma.subject.create({
                    data: { name: result.subject, userId: user.id },
                });
            }
            subjectId = subject.id;
        }

        // 批量创建 ErrorItem
        const createdItems = await Promise.all(
            wrongQuestions.map(question =>
                prisma.errorItem.create({
                    data: {
                        userId: user.id,
                        subjectId,
                        originalImageUrl: correction.imageUrl,
                        questionText: question.questionText,
                        answerText: question.correctAnswer,
                        analysis: question.analysis,
                        wrongAnswerText: question.studentAnswer,
                        mistakeAnalysis: `学生答案：${question.studentAnswer}，正确答案：${question.correctAnswer}`,
                        mistakeStatus: 'wrong_attempt',
                        source: '拍照批改（批量归档）',
                        correctionSessionId: correction.id,
                    },
                })
            )
        );

        logger.info({ sessionId: id, archivedCount: createdItems.length }, 'All wrong questions archived');

        return NextResponse.json({
            success: true,
            archivedCount: createdItems.length,
            errorItems: createdItems,
        });
    } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error archiving all questions');
        return internalError();
    }
}
