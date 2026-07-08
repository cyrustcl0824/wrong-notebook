import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError, badRequest, notFound } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import type { CorrectionResult, CorrectedQuestion } from "@/lib/ai/types";

const logger = createLogger('api:correction:archive');

/**
 * POST /api/correction/[id]/archive
 * 手动归档指定错题到错题本
 * Body: { questionIndex: number } (批改结果中的题目序号)
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
        const body = await req.json();
        const { questionIndex } = body;

        if (typeof questionIndex !== 'number') {
            return badRequest("questionIndex is required");
        }

        // 获取批改会话
        const correction = await prisma.correctionSession.findFirst({
            where: { id, userId: user.id },
        });

        if (!correction) {
            return notFound("Correction session not found");
        }

        if (correction.status !== 'completed') {
            return badRequest("Correction is not completed yet");
        }

        // 解析批改结果
        let result: CorrectionResult;
        try {
            result = JSON.parse(correction.result || '{}');
        } catch {
            return internalError("Failed to parse correction result");
        }

        // 获取指定题目
        const question: CorrectedQuestion | undefined = result.questions?.[questionIndex];
        if (!question) {
            return notFound("Question not found in correction result");
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

        // 创建 ErrorItem
        const errorItem = await prisma.errorItem.create({
            data: {
                userId: user.id,
                subjectId,
                originalImageUrl: correction.imageUrl,
                questionText: question.questionText,
                answerText: question.correctAnswer,
                analysis: question.analysis,
                wrongAnswerText: question.studentAnswer,
                mistakeAnalysis: question.isCorrect === false
                    ? `学生答案：${question.studentAnswer}，正确答案：${question.correctAnswer}`
                    : '',
                mistakeStatus: question.isCorrect === false ? 'wrong_attempt' : 'unknown',
                source: '拍照批改',
                correctionSessionId: correction.id,
            },
        });

        logger.info({ errorItemId: errorItem.id, questionIndex }, 'Question archived to error notebook');

        return NextResponse.json({
            success: true,
            errorItem,
        });
    } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error archiving question');
        return internalError();
    }
}
