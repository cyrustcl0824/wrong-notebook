import { NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { getAIService } from "@/lib/ai";
import { processPdfInBatches, imageBufferToBase64, getPdfPageCount } from "@/lib/pdf-processor";
import { unauthorized, badRequest, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import fs from "fs";
import path from "path";

const logger = createLogger('api:question-bank:upload');

/**
 * POST /api/question-bank/upload
 * 上传 PDF 文件，创建题库记录，异步处理 PDF 提取题目
 * Multipart form data: file (PDF), title, subject, gradeLevel
 */
export async function POST(req: Request) {
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

        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const title = formData.get("title") as string | null;
        const subject = formData.get("subject") as string | null;
        const gradeLevel = formData.get("gradeLevel") as string | null;

        if (!file) {
            return badRequest("PDF file is required");
        }
        if (!title || !title.trim()) {
            return badRequest("Title is required");
        }
        if (!subject) {
            return badRequest("Subject is required");
        }

        // 验证文件类型
        if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
            return badRequest("Only PDF files are accepted");
        }

        // 创建上传目录
        const uploadsDir = path.join(process.cwd(), "data", "uploads", user.id);
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // 保存 PDF 文件
        const timestamp = Date.now();
        const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const pdfFileName = `${timestamp}-${safeFileName}`;
        const pdfPath = path.join(uploadsDir, pdfFileName);

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(pdfPath, buffer);

        logger.info({ userId: user.id, pdfPath, fileSize: buffer.length }, 'PDF file saved');

        // 获取 PDF 页数
        const totalPageCount = await getPdfPageCount(pdfPath);

        // 创建题库记录
        const questionBank = await prisma.questionBank.create({
            data: {
                userId: user.id,
                title: title.trim(),
                subject,
                gradeLevel: gradeLevel || null,
                pdfUrl: pdfPath,
                pdfFileName: file.name,
                totalPageCount,
                processedPages: 0,
                status: "pending",
            },
        });

        logger.info({ questionBankId: questionBank.id, totalPageCount }, 'Question bank created');

        // 使用 after() 在响应发送后异步处理 PDF
        after(async () => {
            const bankId = questionBank.id;

            try {
                // 更新状态为 processing
                await prisma.questionBank.update({
                    where: { id: bankId },
                    data: { status: "processing" },
                });

                logger.info({ bankId }, 'Started PDF processing');

                const aiService = getAIService();

                // 按批次处理 PDF
                await processPdfInBatches(
                    pdfPath,
                    async (images, batchInfo) => {
                        logger.info({
                            bankId,
                            batch: `${batchInfo.startPage}-${batchInfo.endPage}`,
                            totalPages: batchInfo.totalPages,
                        }, 'Processing batch');

                        // 对每页图片调用 AI 提取题目
                        for (const pageImage of images) {
                            try {
                                const imageBase64 = imageBufferToBase64(pageImage.imageBuffer);
                                const result = await aiService.extractQuestionsFromImage(
                                    imageBase64,
                                    "image/png",
                                    subject
                                );

                                logger.info({
                                    bankId,
                                    pageNumber: pageImage.pageNumber,
                                    questionsFound: result.questions.length,
                                }, 'AI extracted questions from page');

                                // 为每道提取的题目创建 Question 记录
                                for (const extractedQ of result.questions) {
                                    // 处理知识点标签：查找或创建
                                    const tagConnections: { id: string }[] = [];

                                    for (const tagName of extractedQ.knowledgePoints) {
                                        let tag = await prisma.knowledgeTag.findFirst({
                                            where: {
                                                name: tagName,
                                                OR: [
                                                    { isSystem: true },
                                                    { userId: user.id },
                                                ],
                                            },
                                        });

                                        if (!tag) {
                                            tag = await prisma.knowledgeTag.create({
                                                data: {
                                                    name: tagName,
                                                    subject,
                                                    isSystem: false,
                                                    userId: user.id,
                                                },
                                            });
                                        }

                                        tagConnections.push({ id: tag.id });
                                    }

                                    await prisma.question.create({
                                        data: {
                                            questionBankId: bankId,
                                            pageNumber: pageImage.pageNumber,
                                            questionNumber: extractedQ.questionNumber,
                                            questionText: extractedQ.questionText,
                                            questionType: extractedQ.questionType,
                                            options: extractedQ.options.length > 0
                                                ? JSON.stringify(extractedQ.options)
                                                : null,
                                            correctAnswer: extractedQ.correctAnswer || null,
                                            analysis: extractedQ.analysis || null,
                                            difficulty: extractedQ.difficulty || "medium",
                                            tags: {
                                                connect: tagConnections,
                                            },
                                        },
                                    });
                                }
                            } catch (pageError) {
                                logger.error({
                                    bankId,
                                    pageNumber: pageImage.pageNumber,
                                    error: pageError instanceof Error ? pageError.message : String(pageError),
                                }, 'Failed to process page');
                                // 继续处理下一页
                            }
                        }

                        // 更新已处理页数
                        await prisma.questionBank.update({
                            where: { id: bankId },
                            data: {
                                processedPages: { increment: images.length },
                            },
                        });

                        logger.info({
                            bankId,
                            processedPages: batchInfo.startPage - 1 + images.length,
                            totalPages: batchInfo.totalPages,
                        }, 'Batch processed, pages updated');
                    },
                    { batchSize: 5 }
                );

                // 处理完成
                await prisma.questionBank.update({
                    where: { id: bankId },
                    data: { status: "ready" },
                });

                logger.info({ bankId }, 'PDF processing complete, status set to ready');
            } catch (error) {
                logger.error({
                    bankId,
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                }, 'PDF processing failed');

                // 更新状态为 failed
                await prisma.questionBank.update({
                    where: { id: bankId },
                    data: {
                        status: "failed",
                        errorMessage: error instanceof Error ? error.message : "Unknown processing error",
                    },
                });
            }
        });

        // 立即返回题库记录
        return NextResponse.json(questionBank, { status: 201 });
    } catch (error) {
        logger.error({ error }, 'Error uploading PDF');
        return internalError("Failed to upload PDF");
    }
}
