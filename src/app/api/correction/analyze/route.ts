import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError, badRequest } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { getAIService } from "@/lib/ai";
import { after } from "next/server";
import fs from "fs";
import path from "path";

const logger = createLogger('api:correction:analyze');

/**
 * POST /api/correction/analyze
 * 上传作业图片，AI 批改
 * Body: FormData { image: File }
 * 或 JSON: { imageBase64: string, mimeType?: string }
 */
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return unauthorized();
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });
        if (!user) return unauthorized();

        let imageBase64: string;
        let mimeType: string;
        let imageFileName: string | undefined;

        const contentType = req.headers.get('content-type') || '';

        if (contentType.includes('multipart/form-data')) {
            // FormData 方式上传
            const formData = await req.formData();
            const file = formData.get('image') as File;
            if (!file) {
                return badRequest("Image file is required");
            }
            const arrayBuffer = await file.arrayBuffer();
            imageBase64 = Buffer.from(arrayBuffer).toString('base64');
            mimeType = file.type || 'image/jpeg';
            imageFileName = file.name;
        } else {
            // JSON 方式上传（base64）
            const body = await req.json();
            imageBase64 = body.imageBase64;
            mimeType = body.mimeType || 'image/jpeg';
            if (!imageBase64) {
                return badRequest("imageBase64 is required");
            }
        }

        // 保存图片到文件系统
        const uploadsDir = path.join(process.cwd(), 'data', 'uploads', 'correction', user.id);
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        const timestamp = Date.now();
        const ext = mimeType.includes('png') ? 'png' : 'jpg';
        const imageFileNameFinal = `${timestamp}.${ext}`;
        const imagePath = path.join(uploadsDir, imageFileNameFinal);
        fs.writeFileSync(imagePath, Buffer.from(imageBase64, 'base64'));

        // 创建批改会话
        const correctionSession = await prisma.correctionSession.create({
            data: {
                userId: user.id,
                imageUrl: `/data/uploads/correction/${user.id}/${imageFileNameFinal}`,
                imageFileName: imageFileName || imageFileNameFinal,
                status: 'pending',
            },
        });

        logger.info({ sessionId: correctionSession.id, userId: user.id }, 'Correction session created');

        // 异步处理：AI 批改
        after(async () => {
            try {
                await prisma.correctionSession.update({
                    where: { id: correctionSession.id },
                    data: { status: 'processing' },
                });

                const aiService = getAIService();
                const result = await aiService.correctHomeworkImage(imageBase64, mimeType);

                await prisma.correctionSession.update({
                    where: { id: correctionSession.id },
                    data: {
                        status: 'completed',
                        result: JSON.stringify(result),
                    },
                });

                logger.info({ sessionId: correctionSession.id, questionCount: result.questions.length }, 'Correction completed');
            } catch (error) {
                logger.error({ sessionId: correctionSession.id, error: error instanceof Error ? error.message : String(error) }, 'Correction failed');
                await prisma.correctionSession.update({
                    where: { id: correctionSession.id },
                    data: {
                        status: 'failed',
                        errorMessage: error instanceof Error ? error.message : 'Unknown error',
                    },
                });
            }
        });

        return NextResponse.json({
            id: correctionSession.id,
            status: 'pending',
            message: 'Image uploaded, AI correction in progress',
        });
    } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error in correction analyze');
        return internalError();
    }
}
