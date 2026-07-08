/**
 * PDF 处理工具库
 * 使用 pdfjs-dist 在 Node.js 端将 PDF 逐页转为 PNG 图片
 * 支持后端自动拆批处理
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// pdfjs-dist 的 legacy build 适配 Node.js
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
const { createCanvas, Canvas, Image } = require('@napi-rs/canvas');

import { createLogger } from './logger';

const logger = createLogger('pdf-processor');

/**
 * Node.js Canvas Factory for pdfjs-dist
 * 让 pdfjs-dist 在 Node.js 环境中使用 @napi-rs/canvas 渲染
 */
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  }

  reset(canvasAndContext: { canvas: any; context: any }, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: { canvas: any; context: any }) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

export interface PdfPageImage {
  pageNumber: number;
  imageBuffer: Buffer;
  width: number;
  height: number;
}

export interface PdfProcessBatchOptions {
  /** 渲染缩放比例，默认 2.0（约 150dpi） */
  scale?: number;
  /** 每批处理的页数，默认 5 */
  batchSize?: number;
  /** 起始页码（1-based），默认 1 */
  startPage?: number;
  /** 结束页码（1-based，包含），默认最后一页 */
  endPage?: number;
}

/**
 * 获取 PDF 总页数
 */
export async function getPdfPageCount(pdfPath: string): Promise<number> {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const count = doc.numPages;
  await doc.destroy();
  return count;
}

/**
 * 将 PDF 指定页范围转为 PNG 图片
 * @param pdfPath PDF 文件路径
 * @param options 批次选项
 * @returns 图片数组
 */
export async function pdfPagesToImages(
  pdfPath: string,
  options?: PdfProcessBatchOptions
): Promise<PdfPageImage[]> {
  const scale = options?.scale ?? 2.0;
  const startPage = options?.startPage ?? 1;
  const batchSize = options?.batchSize ?? 5;

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const totalPages = doc.numPages;
  const endPage = options?.endPage ?? totalPages;

  logger.info({
    pdfPath: path.basename(pdfPath),
    totalPages,
    range: `${startPage}-${endPage}`,
    scale,
  }, 'Processing PDF pages');

  const factory = new NodeCanvasFactory();
  const images: PdfPageImage[] = [];

  for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const canvasAndContext = factory.create(viewport.width, viewport.height);

      await page.render({
        canvasContext: canvasAndContext.context,
        viewport,
        canvasFactory: factory,
      }).promise;

      const imageBuffer = canvasAndContext.canvas.toBuffer('image/png');

      images.push({
        pageNumber: pageNum,
        imageBuffer,
        width: viewport.width,
        height: viewport.height,
      });

      logger.debug({ pageNumber: pageNum, bufferSize: imageBuffer.length }, 'Page rendered');

      // 清理资源
      page.cleanup();
      factory.destroy(canvasAndContext);
    } catch (err) {
      logger.error({ pageNumber: pageNum, error: err instanceof Error ? err.message : String(err) }, 'Failed to render page');
      // 继续处理下一页，不要因为一页失败就中断
    }
  }

  await doc.destroy();

  logger.info({ pagesRendered: images.length }, 'PDF processing complete');
  return images;
}

/**
 * 按批次处理 PDF
 * 每批处理 batchSize 页，处理完一批后调用 onBatchComplete 回调
 * 适合异步处理大 PDF
 */
export async function processPdfInBatches(
  pdfPath: string,
  onBatchComplete: (images: PdfPageImage[], batchInfo: { startPage: number; endPage: number; totalPages: number }) => Promise<void>,
  options?: PdfProcessBatchOptions
): Promise<{ totalPages: number; processedPages: number }> {
  const batchSize = options?.batchSize ?? 5;
  const scale = options?.scale ?? 2.0;

  const totalPages = await getPdfPageCount(pdfPath);
  let processedPages = 0;

  logger.info({ totalPages, batchSize, scale }, 'Starting batch PDF processing');

  for (let startPage = 1; startPage <= totalPages; startPage += batchSize) {
    const endPage = Math.min(startPage + batchSize - 1, totalPages);

    const images = await pdfPagesToImages(pdfPath, {
      scale,
      startPage,
      endPage,
    });

    await onBatchComplete(images, { startPage, endPage, totalPages });

    processedPages += images.length;

    logger.info({
      batch: `${startPage}-${endPage}`,
      processedPages,
      totalPages,
      progress: `${Math.round((processedPages / totalPages) * 100)}%`,
    }, 'Batch complete');
  }

  return { totalPages, processedPages };
}

/**
 * 将图片 Buffer 转为 base64 字符串（用于发送给 AI）
 */
export function imageBufferToBase64(imageBuffer: Buffer): string {
  return imageBuffer.toString('base64');
}

/**
 * 保存图片到文件
 */
export function saveImageToFile(imageBuffer: Buffer, outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, imageBuffer);
}
