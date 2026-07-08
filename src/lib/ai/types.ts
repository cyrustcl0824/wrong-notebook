// Re-export the Zod-validated type from schema.ts
export type { ParsedQuestionFromSchema as ParsedQuestion } from './schema';
import type { ParsedQuestionFromSchema } from './schema';

// Import and re-export MistakeStatus from the single source of truth
import type { MistakeStatus } from '../mistake-status';
export type { MistakeStatus };

export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'harder';

export interface ReanswerQuestionResult {
    answerText: string;
    analysis: string;
    knowledgePoints: string[];
    wrongAnswerText: string;
    mistakeAnalysis: string;
    mistakeStatus: MistakeStatus;
}

export interface GeogebraAnalysisResult {
    suitable: boolean;
    commands: string[];
    description: string;
}

// === 新功能：题库提取 ===

export interface ExtractedQuestion {
    questionNumber: number;
    questionText: string;
    questionType: string; // choice, fill_blank, true_false, short_answer, essay
    options: string[];
    correctAnswer: string;
    analysis: string;
    knowledgePoints: string[];
    difficulty: string; // easy, medium, hard
}

export interface ExtractQuestionsResult {
    questions: ExtractedQuestion[];
    subject: string;
}

// === 新功能：拍照批改 ===

export interface CorrectedQuestion {
    questionNumber: number;
    questionText: string;
    questionType: string;
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    analysis: string;
}

export interface CorrectionResult {
    questions: CorrectedQuestion[];
    subject: string;
    summary: {
        total: number;
        correct: number;
        wrong: number;
        unattempted: number;
    };
}

export interface AIService {
    analyzeImage(imageBase64: string, mimeType?: string, language?: 'zh' | 'en', grade?: 7 | 8 | 9 | 10 | 11 | 12 | null, subject?: string | null, gradeSemester?: string | null): Promise<ParsedQuestionFromSchema>;
    generateSimilarQuestion(originalQuestion: string, knowledgePoints: string[], language?: 'zh' | 'en', difficulty?: DifficultyLevel, gradeSemester?: string | null): Promise<ParsedQuestionFromSchema>;
    reanswerQuestion(questionText: string, language?: 'zh' | 'en', subject?: string | null, imageBase64?: string, gradeSemester?: string | null): Promise<ReanswerQuestionResult>;
    analyzeForGeogebra(questionText: string, answerText: string, analysis: string): Promise<GeogebraAnalysisResult>;
    // === 新功能 ===
    extractQuestionsFromImage(imageBase64: string, mimeType?: string, subject?: string | null): Promise<ExtractQuestionsResult>;
    correctHomeworkImage(imageBase64: string, mimeType?: string): Promise<CorrectionResult>;
}

export interface AIConfig {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    // Azure OpenAI 特有字段
    azureDeployment?: string;   // Azure 部署名称
    azureApiVersion?: string;   // API 版本 (如 2024-02-15-preview)
}
