"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";
import {
    Keyboard,
    Loader2,
    House,
    CheckCircle2,
    XCircle,
    RefreshCw,
    BookOpen,
    ArrowRight,
} from "lucide-react";
import Link from "next/link";

interface PinyinCharacter {
    id: string;
    character: string;
    pinyin: string;
    masteryLevel: number;
    practiceCount: number;
    correctCount: number;
    createdAt: string;
}

interface PinyinStats {
    totalCharacters: number;
    mastery: {
        new: number;
        practicing: number;
        mastered: number;
    };
    practice: {
        total: number;
        correct: number;
        accuracy: number;
    };
}

interface QuestionBank {
    id: string;
    title: string;
    subject: string;
    status: string;
    _count?: { questions: number };
}

const MASTERY_LABELS = ["新学", "练习中", "已掌握"];
const MASTERY_COLORS = [
    "bg-blue-100 text-blue-700",
    "bg-yellow-100 text-yellow-700",
    "bg-green-100 text-green-700",
];

export default function PinyinPage() {
    const [stats, setStats] = useState<PinyinStats | null>(null);
    const [characters, setCharacters] = useState<PinyinCharacter[]>([]);
    const [loading, setLoading] = useState(true);
    const [extractOpen, setExtractOpen] = useState(false);
    const [banks, setBanks] = useState<QuestionBank[]>([]);
    const [selectedBank, setSelectedBank] = useState("");
    const [extracting, setExtracting] = useState(false);

    // Practice mode state
    const [practiceMode, setPracticeMode] = useState(false);
    const [practiceQueue, setPracticeQueue] = useState<PinyinCharacter[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [userInput, setUserInput] = useState("");
    const [showResult, setShowResult] = useState(false);
    const [lastCorrect, setLastCorrect] = useState(false);
    const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 });
    const inputRef = useRef<HTMLInputElement>(null);

    const fetchStats = useCallback(async () => {
        try {
            const data = await apiClient.get<PinyinStats>("/api/pinyin/stats");
            setStats(data);
        } catch (error) {
            console.error("Failed to fetch stats:", error);
        }
    }, []);

    const fetchCharacters = useCallback(async () => {
        try {
            const data = await apiClient.get<{ characters: PinyinCharacter[]; total: number }>(
                "/api/pinyin/characters"
            );
            setCharacters(data.characters);
        } catch (error) {
            console.error("Failed to fetch characters:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        fetchCharacters();
    }, [fetchStats, fetchCharacters]);

    const startPractice = () => {
        if (characters.length === 0) return;
        // Prioritize unmastered characters
        const sorted = [...characters].sort((a, b) => {
            if (a.masteryLevel !== b.masteryLevel) return a.masteryLevel - b.masteryLevel;
            return a.correctCount - b.correctCount;
        });
        const queue = sorted.slice(0, Math.min(20, sorted.length));
        // Shuffle
        for (let i = queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [queue[i], queue[j]] = [queue[j], queue[i]];
        }
        setPracticeQueue(queue);
        setCurrentIndex(0);
        setSessionStats({ correct: 0, total: 0 });
        setPracticeMode(true);
        setUserInput("");
        setShowResult(false);
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    const handleSubmit = async () => {
        if (!userInput.trim() || showResult) return;
        const current = practiceQueue[currentIndex];
        const isCorrect = userInput.trim().toLowerCase() === current.pinyin.toLowerCase();

        setShowResult(true);
        setLastCorrect(isCorrect);
        setSessionStats(prev => ({
            correct: prev.correct + (isCorrect ? 1 : 0),
            total: prev.total + 1,
        }));

        // Record practice
        try {
            await apiClient.post("/api/pinyin/practice", {
                characterId: current.id,
                userInput: userInput.trim(),
                isCorrect,
            });
        } catch (error) {
            console.error("Failed to record practice:", error);
        }
    };

    const handleNext = () => {
        if (currentIndex + 1 >= practiceQueue.length) {
            // Practice complete
            setPracticeMode(false);
            fetchStats();
            fetchCharacters();
            return;
        }
        setCurrentIndex(prev => prev + 1);
        setUserInput("");
        setShowResult(false);
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    const handleExtract = async () => {
        if (!selectedBank) return;
        setExtracting(true);
        try {
            const result = await apiClient.post<{ newCount: number; totalCount: number }>(
                "/api/pinyin/extract",
                { questionBankId: selectedBank }
            );
            alert(`提取完成！新增 ${result.newCount} 个生字，共 ${result.totalCount} 个生字。`);
            setExtractOpen(false);
            fetchStats();
            fetchCharacters();
        } catch (error: any) {
            alert(error?.data?.message || "提取失败");
        } finally {
            setExtracting(false);
        }
    };

    const openExtractDialog = async () => {
        try {
            const data = await apiClient.get<QuestionBank[]>("/api/question-bank");
            setBanks(data.filter(b => b.status === "ready"));
        } catch (error) {
            console.error("Failed to fetch banks:", error);
        }
        setExtractOpen(true);
    };

    // Practice Mode UI
    if (practiceMode && practiceQueue.length > 0) {
        const current = practiceQueue[currentIndex];
        const progress = ((currentIndex) / practiceQueue.length) * 100;

        return (
            <main className="min-h-screen flex items-center justify-center bg-background p-4">
                <div className="w-full max-w-md space-y-6">
                    <div className="flex items-center justify-between">
                        <Button variant="ghost" size="sm" onClick={() => setPracticeMode(false)}>
                            退出练习
                        </Button>
                        <span className="text-sm text-muted-foreground">
                            {currentIndex + 1} / {practiceQueue.length}
                        </span>
                    </div>

                    <Progress value={progress} className="h-2" />

                    <Card className="text-center py-8">
                        <CardContent className="space-y-6 pt-6">
                            <div>
                                <p className="text-sm text-muted-foreground mb-2">请输入下面汉字的拼音</p>
                                <div className="text-7xl font-bold tracking-wider">
                                    {current.character}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Input
                                    ref={inputRef}
                                    value={userInput}
                                    onChange={(e) => setUserInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            if (showResult) handleNext();
                                            else handleSubmit();
                                        }
                                    }}
                                    placeholder="输入拼音（如 ni3 hao3）"
                                    className="text-center text-lg"
                                    disabled={showResult}
                                />

                                {showResult && (
                                    <div className={`rounded-lg p-4 space-y-2 ${
                                        lastCorrect ? "bg-green-50" : "bg-red-50"
                                    }`}>
                                        <div className="flex items-center justify-center gap-2">
                                            {lastCorrect ? (
                                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                                            ) : (
                                                <XCircle className="h-5 w-5 text-red-500" />
                                            )}
                                            <span className={`font-medium ${lastCorrect ? "text-green-700" : "text-red-700"}`}>
                                                {lastCorrect ? "正确！" : "错误"}
                                            </span>
                                        </div>
                                        {!lastCorrect && (
                                            <div className="text-sm">
                                                <span className="text-muted-foreground">你的答案：</span>
                                                <span className="text-red-600 line-through">{userInput}</span>
                                                <br />
                                                <span className="text-muted-foreground">正确答案：</span>
                                                <span className="text-green-600 font-medium">{current.pinyin}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex gap-3">
                        {!showResult ? (
                            <Button className="flex-1" onClick={handleSubmit} disabled={!userInput.trim()}>
                                提交
                            </Button>
                        ) : (
                            <Button className="flex-1" onClick={handleNext}>
                                {currentIndex + 1 >= practiceQueue.length ? "完成练习" : "下一题"}
                                <ArrowRight className="ml-1 h-4 w-4" />
                            </Button>
                        )}
                    </div>

                    <div className="text-center text-sm text-muted-foreground">
                        本轮：{sessionStats.correct} / {sessionStats.total} 正确
                    </div>
                </div>
            </main>
        );
    }

    // Main Page UI
    return (
        <main className="min-h-screen p-4 md:p-8 bg-background">
            <div className="max-w-5xl mx-auto space-y-6">
                <div className="flex items-start gap-4">
                    <BackButton fallbackUrl="/" />
                    <div className="flex-1 space-y-1">
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">拼音练习</h1>
                        <p className="text-muted-foreground text-sm sm:text-base">
                            从题库提取生字，练习拼音输入
                        </p>
                    </div>
                    <Link href="/">
                        <Button variant="ghost" size="icon">
                            <House className="h-5 w-5" />
                        </Button>
                    </Link>
                </div>

                {/* Stats Cards */}
                {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Card>
                            <CardContent className="pt-4 text-center">
                                <div className="text-3xl font-bold">{stats.totalCharacters}</div>
                                <div className="text-xs text-muted-foreground mt-1">总生字数</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4 text-center">
                                <div className="text-3xl font-bold text-green-600">{stats.mastery.mastered}</div>
                                <div className="text-xs text-muted-foreground mt-1">已掌握</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4 text-center">
                                <div className="text-3xl font-bold text-yellow-600">{stats.mastery.practicing}</div>
                                <div className="text-xs text-muted-foreground mt-1">练习中</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4 text-center">
                                <div className="text-3xl font-bold text-blue-600">{stats.practice.accuracy}%</div>
                                <div className="text-xs text-muted-foreground mt-1">正确率</div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                    <Button
                        onClick={startPractice}
                        disabled={characters.length === 0}
                        className="flex-1"
                        size="lg"
                    >
                        <Keyboard className="mr-2 h-5 w-5" />
                        开始练习
                    </Button>
                    <Button
                        onClick={openExtractDialog}
                        variant="outline"
                        size="lg"
                    >
                        <BookOpen className="mr-2 h-5 w-5" />
                        从题库提取生字
                    </Button>
                </div>

                {/* Character List */}
                <div className="space-y-3">
                    <h2 className="text-sm font-medium text-muted-foreground">生字列表</h2>
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : characters.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed rounded-lg">
                            <Keyboard className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                            <p className="text-muted-foreground mb-2">还没有生字</p>
                            <p className="text-xs text-muted-foreground mb-4">
                                从题库提取生字后即可开始练习
                            </p>
                            <Button onClick={openExtractDialog} variant="outline">
                                <BookOpen className="mr-2 h-4 w-4" />
                                提取生字
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
                            {characters.map((ch) => (
                                <div
                                    key={ch.id}
                                    className="flex flex-col items-center gap-1 rounded-lg border p-3 hover:shadow-sm transition-shadow"
                                >
                                    <span className="text-2xl font-bold">{ch.character}</span>
                                    <span className="text-xs text-muted-foreground">{ch.pinyin}</span>
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                        MASTERY_COLORS[ch.masteryLevel] || MASTERY_COLORS[0]
                                    }`}>
                                        {MASTERY_LABELS[ch.masteryLevel] || "新学"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Extract Dialog */}
                <Dialog open={extractOpen} onOpenChange={setExtractOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>从题库提取生字</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            {banks.length === 0 ? (
                                <div className="text-center py-4">
                                    <p className="text-sm text-muted-foreground mb-3">
                                        没有可用的题库，请先上传PDF题库
                                    </p>
                                    <Link href="/question-bank">
                                        <Button variant="outline" size="sm">
                                            前往题库
                                        </Button>
                                    </Link>
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">选择题库</label>
                                        <select
                                            value={selectedBank}
                                            onChange={(e) => setSelectedBank(e.target.value)}
                                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        >
                                            <option value="">请选择题库</option>
                                            {banks.map(b => (
                                                <option key={b.id} value={b.id}>
                                                    {b.title}（{b.subject} · {b._count?.questions || 0}题）
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                                        <p>系统将从题库题目的文本中提取所有汉字，自动标注拼音。</p>
                                        <p className="mt-1">多音字会根据上下文自动消歧，无需手动标注。</p>
                                    </div>
                                </>
                            )}
                        </div>
                        {banks.length > 0 && (
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setExtractOpen(false)}>
                                    取消
                                </Button>
                                <Button
                                    onClick={handleExtract}
                                    disabled={!selectedBank || extracting}
                                >
                                    {extracting ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                    )}
                                    开始提取
                                </Button>
                            </DialogFooter>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </main>
    );
}
