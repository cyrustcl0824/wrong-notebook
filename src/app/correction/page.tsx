"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { Badge } from "@/components/ui/badge";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { apiClient } from "@/lib/api-client";
import {
    Camera,
    Upload,
    Loader2,
    CheckCircle2,
    XCircle,
    Archive,
    ArchiveRestore,
    Trash2,
    House,
    ChevronDown,
    ChevronUp,
} from "lucide-react";
import Link from "next/link";
import { processImageFile } from "@/lib/image-utils";

interface CorrectedQuestion {
    questionNumber: number;
    questionText: string;
    questionType: string;
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    analysis: string;
}

interface CorrectionResult {
    questions: CorrectedQuestion[];
    subject: string;
    summary: {
        total: number;
        correct: number;
        wrong: number;
        unattempted: number;
    };
}

interface CorrectionSession {
    id: string;
    imageUrl: string;
    status: string;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
    result: CorrectionResult | null;
    errorItems?: { id: string; questionText: string }[];
}

interface SessionListItem {
    id: string;
    imageUrl: string;
    status: string;
    errorMessage: string | null;
    createdAt: string;
    _count: { errorItems: number };
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "等待中", variant: "outline" },
    processing: { label: "批改中", variant: "secondary" },
    completed: { label: "已完成", variant: "default" },
    failed: { label: "失败", variant: "destructive" },
};

export default function CorrectionPage() {
    const [sessions, setSessions] = useState<SessionListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [activeSession, setActiveSession] = useState<CorrectionSession | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [archivingIndex, setArchivingIndex] = useState<number | null>(null);
    const [archivingAll, setArchivingAll] = useState(false);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchSessions = useCallback(async () => {
        try {
            const data = await apiClient.get<{ sessions: SessionListItem[]; total: number }>("/api/correction");
            setSessions(data.sessions);
        } catch (error) {
            console.error("Failed to fetch sessions:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    // Poll if any session is processing
    useEffect(() => {
        const hasProcessing = sessions.some(s => s.status === "pending" || s.status === "processing");
        if (!hasProcessing) return;
        const interval = setInterval(fetchSessions, 5000);
        return () => clearInterval(interval);
    }, [sessions, fetchSessions]);

    const handleUpload = async (file: File) => {
        setUploading(true);
        try {
            const base64 = await processImageFile(file);
            const response = await fetch("/api/correction/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imageBase64: base64, mimeType: "image/jpeg" }),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ message: "Upload failed" }));
                throw new Error(error.message || "Upload failed");
            }

            const data = await response.json();
            await fetchSessions();

            // Auto-open the new session to watch progress
            loadSessionDetail(data.id);
        } catch (error: any) {
            alert(error.message || "上传失败");
        } finally {
            setUploading(false);
        }
    };

    const loadSessionDetail = async (id: string) => {
        setLoadingDetail(true);
        try {
            const detail = await apiClient.get<CorrectionSession>(`/api/correction/${id}`);
            setActiveSession(detail);
        } catch (error) {
            console.error("Failed to load session:", error);
        } finally {
            setLoadingDetail(false);
        }
    };

    // Poll active session if still processing
    useEffect(() => {
        if (!activeSession || (activeSession.status !== "pending" && activeSession.status !== "processing")) return;
        const interval = setInterval(async () => {
            try {
                const detail = await apiClient.get<CorrectionSession>(`/api/correction/${activeSession.id}`);
                setActiveSession(detail);
                if (detail.status === "completed" || detail.status === "failed") {
                    await fetchSessions();
                }
            } catch (error) {
                console.error("Poll failed:", error);
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [activeSession, fetchSessions]);

    const handleArchive = async (questionIndex: number) => {
        if (!activeSession) return;
        setArchivingIndex(questionIndex);
        try {
            await apiClient.post(`/api/correction/${activeSession.id}/archive`, {
                questionIndex,
            });
            alert("已归档到错题本");
            // Refresh detail
            await loadSessionDetail(activeSession.id);
            await fetchSessions();
        } catch (error: any) {
            alert(error?.data?.message || "归档失败");
        } finally {
            setArchivingIndex(null);
        }
    };

    const handleArchiveAll = async () => {
        if (!activeSession?.result) return;
        if (!confirm("将所有错题一键归档到错题本？")) return;
        setArchivingAll(true);
        try {
            const result = await apiClient.post<{ archivedCount: number }>(
                `/api/correction/${activeSession.id}/archive-all`,
                {}
            );
            alert(`已归档 ${result.archivedCount} 道错题到错题本`);
            await loadSessionDetail(activeSession.id);
            await fetchSessions();
        } catch (error: any) {
            alert(error?.data?.message || "批量归档失败");
        } finally {
            setArchivingAll(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("删除这条批改记录？")) return;
        try {
            await apiClient.delete(`/api/correction/${id}`);
            if (activeSession?.id === id) setActiveSession(null);
            await fetchSessions();
        } catch (error) {
            alert("删除失败");
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <main className="min-h-screen p-4 md:p-8 bg-background">
            <div className="max-w-5xl mx-auto space-y-6">
                <div className="flex items-start gap-4">
                    <BackButton fallbackUrl="/" />
                    <div className="flex-1 space-y-1">
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">拍照批改</h1>
                        <p className="text-muted-foreground text-sm sm:text-base">
                            拍照上传作业，AI自动批改，错题可手动归档到错题本
                        </p>
                    </div>
                    <Link href="/">
                        <Button variant="ghost" size="icon">
                            <House className="h-5 w-5" />
                        </Button>
                    </Link>
                </div>

                {/* Upload Area */}
                <Card>
                    <CardContent className="pt-6">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUpload(file);
                                e.target.value = "";
                            }}
                        />
                        <div
                            className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer hover:border-primary/50 transition-colors"
                            onClick={() => !uploading && fileInputRef.current?.click()}
                        >
                            {uploading ? (
                                <>
                                    <Loader2 className="h-10 w-10 text-primary animate-spin mb-3" />
                                    <p className="text-sm text-muted-foreground">正在上传并分析...</p>
                                </>
                            ) : (
                                <>
                                    <Camera className="h-10 w-10 text-muted-foreground mb-3" />
                                    <p className="text-sm font-medium">点击拍照或选择作业图片</p>
                                    <p className="text-xs text-muted-foreground mt-1">支持 JPG / PNG 格式</p>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Active Session Detail */}
                {activeSession && (
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base">批改结果</CardTitle>
                                <Badge variant={STATUS_CONFIG[activeSession.status]?.variant || "outline"}>
                                    {STATUS_CONFIG[activeSession.status]?.label || activeSession.status}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Image Preview */}
                            {activeSession.imageUrl && (
                                <img
                                    src={activeSession.imageUrl}
                                    alt="作业图片"
                                    className="w-full max-h-64 object-contain rounded-md border"
                                />
                            )}

                            {/* Processing State */}
                            {(activeSession.status === "pending" || activeSession.status === "processing") && (
                                <div className="space-y-2">
                                    <Progress value={50} className="h-2 animate-pulse" />
                                    <p className="text-sm text-muted-foreground text-center">
                                        AI正在批改中，请稍候...
                                    </p>
                                </div>
                            )}

                            {/* Failed State */}
                            {activeSession.status === "failed" && (
                                <div className="text-sm text-destructive">
                                    批改失败：{activeSession.errorMessage || "未知错误"}
                                </div>
                            )}

                            {/* Results */}
                            {activeSession.status === "completed" && activeSession.result && (
                                <>
                                    {/* Summary */}
                                    <div className="grid grid-cols-4 gap-3">
                                        <div className="rounded-lg bg-muted/50 p-3 text-center">
                                            <div className="text-2xl font-bold">{activeSession.result.summary.total}</div>
                                            <div className="text-xs text-muted-foreground">总题数</div>
                                        </div>
                                        <div className="rounded-lg bg-green-50 p-3 text-center">
                                            <div className="text-2xl font-bold text-green-600">{activeSession.result.summary.correct}</div>
                                            <div className="text-xs text-muted-foreground">正确</div>
                                        </div>
                                        <div className="rounded-lg bg-red-50 p-3 text-center">
                                            <div className="text-2xl font-bold text-red-600">{activeSession.result.summary.wrong}</div>
                                            <div className="text-xs text-muted-foreground">错误</div>
                                        </div>
                                        <div className="rounded-lg bg-gray-50 p-3 text-center">
                                            <div className="text-2xl font-bold text-gray-600">{activeSession.result.summary.unattempted}</div>
                                            <div className="text-xs text-muted-foreground">未答</div>
                                        </div>
                                    </div>

                                    {/* Archive All Button */}
                                    {activeSession.result.summary.wrong > 0 && (
                                        <Button
                                            onClick={handleArchiveAll}
                                            disabled={archivingAll}
                                            className="w-full"
                                            variant="default"
                                        >
                                            {archivingAll ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <ArchiveRestore className="mr-2 h-4 w-4" />
                                            )}
                                            一键归档全部错题（{activeSession.result.summary.wrong}题）
                                        </Button>
                                    )}

                                    {/* Question List */}
                                    <div className="space-y-2">
                                        {activeSession.result.questions.map((q, idx) => {
                                            const isArchived = activeSession.errorItems?.some(
                                                ei => ei.questionText === q.questionText
                                            );
                                            return (
                                                <div
                                                    key={idx}
                                                    className={`rounded-lg border p-3 space-y-2 ${
                                                        q.isCorrect ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            {q.isCorrect ? (
                                                                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                                                            ) : (
                                                                <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                                                            )}
                                                            <span className="text-sm font-medium">
                                                                第{q.questionNumber}题
                                                            </span>
                                                            <Badge variant="outline" className="text-xs">
                                                                {q.questionType}
                                                            </Badge>
                                                        </div>
                                                        {!q.isCorrect && !isArchived && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleArchive(idx)}
                                                                disabled={archivingIndex === idx}
                                                            >
                                                                {archivingIndex === idx ? (
                                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                                ) : (
                                                                    <Archive className="h-3 w-3" />
                                                                )}
                                                                <span className="ml-1">归档</span>
                                                            </Button>
                                                        )}
                                                        {isArchived && (
                                                            <Badge variant="secondary" className="text-xs">
                                                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                                                已归档
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    <p className="text-sm">{q.questionText}</p>

                                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                                        <div>
                                                            <span className="text-muted-foreground">学生答案：</span>
                                                            <span className={q.isCorrect ? "text-green-600" : "text-red-600"}>
                                                                {q.studentAnswer || "（未作答）"}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <span className="text-muted-foreground">正确答案：</span>
                                                            <span className="text-green-600 font-medium">
                                                                {q.correctAnswer}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {q.analysis && (
                                                        <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                                                            {q.analysis}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* History List */}
                <div className="space-y-3">
                    <h2 className="text-sm font-medium text-muted-foreground">批改历史</h2>
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="text-center py-8 border-2 border-dashed rounded-lg">
                            <Camera className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">还没有批改记录</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {sessions.map((s) => {
                                const expanded = expandedIds.has(s.id);
                                const statusInfo = STATUS_CONFIG[s.status] || STATUS_CONFIG.pending;
                                return (
                                    <Card key={s.id} className="overflow-hidden">
                                        <CardContent className="p-3">
                                            <div className="flex items-center gap-3">
                                                <img
                                                    src={s.imageUrl}
                                                    alt="作业"
                                                    className="h-12 w-12 rounded object-cover border shrink-0"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                                                        {s._count.errorItems > 0 && (
                                                            <Badge variant="outline" className="text-xs">
                                                                已归档 {s._count.errorItems} 题
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {new Date(s.createdAt).toLocaleString("zh-CN")}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => loadSessionDetail(s.id)}
                                                    >
                                                        查看
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-destructive hover:text-destructive"
                                                        onClick={() => handleDelete(s.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
