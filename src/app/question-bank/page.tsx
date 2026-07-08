"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { QuestionBankCard, QuestionBankData } from "@/components/question-bank/question-bank-card";
import { apiClient } from "@/lib/api-client";
import { Upload, Plus, House, Loader2 } from "lucide-react";
import Link from "next/link";

const SUBJECTS = ["语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理", "政治"];

export default function QuestionBankPage() {
    const [banks, setBanks] = useState<QuestionBankData[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Upload form state
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState("");
    const [subject, setSubject] = useState("语文");
    const [gradeLevel, setGradeLevel] = useState("");

    const fetchBanks = useCallback(async () => {
        try {
            const data = await apiClient.get<QuestionBankData[]>("/api/question-bank");
            setBanks(data);
        } catch (error) {
            console.error("Failed to fetch question banks:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBanks();
    }, [fetchBanks]);

    // Poll for status updates if any bank is processing
    useEffect(() => {
        const hasProcessing = banks.some(b => b.status === "pending" || b.status === "processing");
        if (!hasProcessing) return;

        const interval = setInterval(fetchBanks, 5000);
        return () => clearInterval(interval);
    }, [banks, fetchBanks]);

    const handleUpload = async () => {
        if (!file || !title.trim() || !subject) return;

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("title", title.trim());
            formData.append("subject", subject);
            formData.append("gradeLevel", gradeLevel);

            const response = await fetch("/api/question-bank/upload", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ message: "Upload failed" }));
                throw new Error(error.message || "Upload failed");
            }

            setUploadOpen(false);
            setFile(null);
            setTitle("");
            setGradeLevel("");
            await fetchBanks();
        } catch (error: any) {
            alert(error.message || "上传失败");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("确定删除这个题库吗？所有题目也将被删除。")) return;
        try {
            await apiClient.delete(`/api/question-bank/${id}`);
            await fetchBanks();
        } catch (error) {
            console.error("Delete failed:", error);
            alert("删除失败");
        }
    };

    return (
        <main className="min-h-screen p-4 md:p-8 bg-background">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-start gap-4">
                    <BackButton fallbackUrl="/" />
                    <div className="flex-1 space-y-1">
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">题库资料</h1>
                        <p className="text-muted-foreground text-sm sm:text-base">
                            上传PDF试卷，AI自动提取题目，支持举一反三和拼音提取
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button onClick={() => setUploadOpen(true)} size="sm" className="hidden sm:flex">
                            <Plus className="mr-2 h-4 w-4" />
                            上传题库
                        </Button>
                        <Button onClick={() => setUploadOpen(true)} size="icon" className="sm:hidden">
                            <Plus className="h-4 w-4" />
                        </Button>
                        <Link href="/">
                            <Button variant="ghost" size="icon">
                                <House className="h-5 w-5" />
                            </Button>
                        </Link>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : banks.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg">
                        <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground mb-4">还没有题库资料</p>
                        <Button onClick={() => setUploadOpen(true)}>
                            <Upload className="mr-2 h-4 w-4" />
                            上传第一个PDF题库
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {banks.map((bank) => (
                            <QuestionBankCard
                                key={bank.id}
                                bank={bank}
                                onDelete={handleDelete}
                            />
                        ))}
                    </div>
                )}

                {/* Upload Dialog */}
                <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>上传PDF题库</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <Label htmlFor="title">题库名称</Label>
                                <Input
                                    id="title"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="例如：2024年秋季期中数学试卷"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="subject">学科</Label>
                                <select
                                    id="subject"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                    {SUBJECTS.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="gradeLevel">年级（可选）</Label>
                                <Input
                                    id="gradeLevel"
                                    value={gradeLevel}
                                    onChange={(e) => setGradeLevel(e.target.value)}
                                    placeholder="例如：七年级"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="file">PDF文件</Label>
                                <Input
                                    id="file"
                                    type="file"
                                    accept=".pdf,application/pdf"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) setFile(f);
                                    }}
                                />
                                {file && (
                                    <p className="text-xs text-muted-foreground">
                                        已选择：{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                                    </p>
                                )}
                            </div>

                            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                                <p>PDF将完整上传，后端自动分批处理（每批5页），AI逐页提取题目。</p>
                                <p className="mt-1">处理完成后可在题库中查看题目、举一反三、提取拼音。</p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setUploadOpen(false)}>
                                取消
                            </Button>
                            <Button
                                onClick={handleUpload}
                                disabled={!file || !title.trim() || uploading}
                            >
                                {uploading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        上传中...
                                    </>
                                ) : (
                                    "开始上传"
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </main>
    );
}
