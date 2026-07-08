"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { Badge } from "@/components/ui/badge";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";
import { Loader2, ChevronLeft, ChevronRight, Lightbulb, Keyboard, FileText, House } from "lucide-react";
import Link from "next/link";
import { MarkdownRenderer } from "@/components/markdown-renderer";

interface Question {
    id: string;
    questionNumber: number;
    questionText: string;
    questionType: string;
    options: string | null;
    correctAnswer: string | null;
    analysis: string | null;
    difficulty: string;
    pageNumber: number;
    tags: { id: string; name: string }[];
}

interface QuestionsResponse {
    questions: Question[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}

interface BankInfo {
    id: string;
    title: string;
    subject: string;
    status: string;
}

const QUESTION_TYPE_LABELS: Record<string, string> = {
    choice: "选择题",
    fill_blank: "填空题",
    true_false: "判断题",
    short_answer: "简答题",
    essay: "论述题",
};

const DIFFICULTY_LABELS: Record<string, string> = {
    easy: "简单",
    medium: "中等",
    hard: "困难",
    harder: "挑战",
};

const DIFFICULTY_COLORS: Record<string, string> = {
    easy: "bg-green-100 text-green-700",
    medium: "bg-yellow-100 text-yellow-700",
    hard: "bg-orange-100 text-orange-700",
    harder: "bg-red-100 text-red-700",
};

export default function QuestionBankDetailPage() {
    const params = useParams();
    const router = useRouter();
    const bankId = params.id as string;

    const [bank, setBank] = useState<BankInfo | null>(null);
    const [data, setData] = useState<QuestionsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [questionType, setQuestionType] = useState("");
    const [difficulty, setDifficulty] = useState("");
    const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
    const [similarQuestions, setSimilarQuestions] = useState<any[] | null>(null);
    const [loadingSimilar, setLoadingSimilar] = useState(false);
    const [extractingPinyin, setExtractingPinyin] = useState(false);

    const fetchQuestions = useCallback(async () => {
        try {
            const params: Record<string, string> = { page: String(page), pageSize: "20" };
            if (questionType) params.questionType = questionType;
            if (difficulty) params.difficulty = difficulty;

            const result = await apiClient.get<QuestionsResponse>(
                `/api/question-bank/${bankId}/questions`,
                { params }
            );
            setData(result);
        } catch (error) {
            console.error("Failed to fetch questions:", error);
        } finally {
            setLoading(false);
        }
    }, [bankId, page, questionType, difficulty]);

    useEffect(() => {
        // Fetch bank info
        apiClient.get<BankInfo>(`/api/question-bank/${bankId}`)
            .then(setBank)
            .catch(console.error);
    }, [bankId]);

    useEffect(() => {
        fetchQuestions();
    }, [fetchQuestions]);

    const handleSimilar = async (question: Question) => {
        setSelectedQuestion(question);
        setSimilarQuestions(null);
        setLoadingSimilar(true);
        try {
            const result = await apiClient.get<{ questions: any[] }>(
                `/api/questions/${question.id}/similar`
            );
            setSimilarQuestions(result.questions || []);
        } catch (error) {
            console.error("Failed to fetch similar questions:", error);
            setSimilarQuestions([]);
        } finally {
            setLoadingSimilar(false);
        }
    };

    const handleExtractPinyin = async () => {
        if (!confirm("从该题库提取生字用于拼音练习？")) return;
        setExtractingPinyin(true);
        try {
            const result = await apiClient.post<{ newCount: number; totalCount: number }>(
                "/api/pinyin/extract",
                { questionBankId: bankId }
            );
            alert(`提取完成！新增 ${result.newCount} 个生字，共 ${result.totalCount} 个生字。`);
            router.push("/pinyin");
        } catch (error: any) {
            alert(error?.data?.message || "提取失败");
        } finally {
            setExtractingPinyin(false);
        }
    };

    const parseOptions = (options: string | null): string[] => {
        if (!options) return [];
        try {
            return JSON.parse(options);
        } catch {
            return [];
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <main className="min-h-screen p-4 md:p-8 bg-background">
            <div className="max-w-5xl mx-auto space-y-6">
                <div className="flex items-start gap-4">
                    <BackButton fallbackUrl="/question-bank" />
                    <div className="flex-1 space-y-1">
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                            {bank?.title || "题库详情"}
                        </h1>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{bank?.subject}</span>
                            {data && <span>· 共 {data.pagination.total} 题</span>}
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExtractPinyin}
                        disabled={extractingPinyin}
                    >
                        {extractingPinyin ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Keyboard className="mr-2 h-4 w-4" />
                        )}
                        提取拼音
                    </Button>
                    <Link href="/">
                        <Button variant="ghost" size="icon">
                            <House className="h-5 w-5" />
                        </Button>
                    </Link>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-3">
                    <select
                        value={questionType}
                        onChange={(e) => { setQuestionType(e.target.value); setPage(1); }}
                        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                    >
                        <option value="">全部题型</option>
                        {Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                    <select
                        value={difficulty}
                        onChange={(e) => { setDifficulty(e.target.value); setPage(1); }}
                        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                    >
                        <option value="">全部难度</option>
                        {Object.entries(DIFFICULTY_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                </div>

                {/* Questions List */}
                {data && data.questions.length > 0 ? (
                    <div className="space-y-3">
                        {data.questions.map((q) => (
                            <Card key={q.id} className="hover:shadow-md transition-shadow">
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Badge variant="outline">
                                                第{q.pageNumber}页 · 第{q.questionNumber}题
                                            </Badge>
                                            <Badge variant="secondary">
                                                {QUESTION_TYPE_LABELS[q.questionType] || q.questionType}
                                            </Badge>
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_COLORS[q.difficulty] || ""}`}>
                                                {DIFFICULTY_LABELS[q.difficulty] || q.difficulty}
                                            </span>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleSimilar(q)}
                                        >
                                            <Lightbulb className="mr-1 h-4 w-4" />
                                            举一反三
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <div className="text-sm leading-relaxed">
                                        <MarkdownRenderer content={q.questionText} />
                                    </div>

                                    {parseOptions(q.options).length > 0 && (
                                        <div className="space-y-1 ml-4">
                                            {parseOptions(q.options).map((opt, i) => (
                                                <p key={i} className="text-sm text-muted-foreground">
                                                    {String.fromCharCode(65 + i)}. {opt}
                                                </p>
                                            ))}
                                        </div>
                                    )}

                                    {q.correctAnswer && (
                                        <div className="text-sm">
                                            <span className="font-medium text-green-600">正确答案：</span>
                                            <span>{q.correctAnswer}</span>
                                        </div>
                                    )}

                                    {q.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 pt-1">
                                            {q.tags.map(tag => (
                                                <Badge key={tag.id} variant="outline" className="text-xs">
                                                    {tag.name}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg">
                        <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground">
                            {data?.pagination.total === 0 ? "该题库暂无题目" : "没有符合条件的题目"}
                        </p>
                    </div>
                )}

                {/* Pagination */}
                {data && data.pagination.totalPages > 1 && (
                    <div className="flex items-center justify-center gap-4">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => setPage(p => p - 1)}
                        >
                            <ChevronLeft className="h-4 w-4" />
                            上一页
                        </Button>
                        <span className="text-sm text-muted-foreground">
                            {page} / {data.pagination.totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= data.pagination.totalPages}
                            onClick={() => setPage(p => p + 1)}
                        >
                            下一页
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                )}

                {/* Similar Questions Dialog */}
                <Dialog open={!!selectedQuestion} onOpenChange={(open) => { if (!open) setSelectedQuestion(null); }}>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>举一反三</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            {loadingSimilar ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : similarQuestions && similarQuestions.length > 0 ? (
                                similarQuestions.map((sq, i) => (
                                    <Card key={sq.id || i}>
                                        <CardContent className="pt-4 space-y-2">
                                            <div className="text-sm font-medium">
                                                {sq.questionText}
                                            </div>
                                            {sq.correctAnswer && (
                                                <div className="text-sm text-green-600">
                                                    答案：{sq.correctAnswer}
                                                </div>
                                            )}
                                            {sq.analysis && (
                                                <div className="text-sm text-muted-foreground">
                                                    {sq.analysis}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))
                            ) : (
                                <p className="text-center text-muted-foreground py-8">
                                    暂无类似题目
                                </p>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </main>
    );
}
