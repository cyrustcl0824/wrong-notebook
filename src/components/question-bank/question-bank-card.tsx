"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BookOpen, FileText, Trash2 } from "lucide-react";

export interface QuestionBankData {
    id: string;
    title: string;
    subject: string;
    gradeLevel: string | null;
    pdfFileName: string;
    totalPageCount: number;
    processedPages: number;
    status: string;
    _count?: { questions: number };
    createdAt: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "等待中", variant: "outline" },
    processing: { label: "处理中", variant: "secondary" },
    ready: { label: "已就绪", variant: "default" },
    failed: { label: "失败", variant: "destructive" },
};

export function QuestionBankCard({ bank, onDelete }: { bank: QuestionBankData; onDelete?: (id: string) => void }) {
    const statusInfo = statusConfig[bank.status] || statusConfig.pending;
    const progress = bank.totalPageCount > 0 ? (bank.processedPages / bank.totalPageCount) * 100 : 0;

    return (
        <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-5 w-5 text-primary shrink-0" />
                        <CardTitle className="truncate text-base">{bank.title}</CardTitle>
                    </div>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BookOpen className="h-4 w-4" />
                    <span>{bank.subject}</span>
                    {bank.gradeLevel && <span>· {bank.gradeLevel}</span>}
                    <span>· {bank._count?.questions || 0} 题</span>
                </div>

                <div className="text-xs text-muted-foreground truncate">
                    {bank.pdfFileName}
                </div>

                {bank.status === "processing" && (
                    <div className="space-y-1">
                        <Progress value={progress} className="h-2" />
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>已处理 {bank.processedPages}/{bank.totalPageCount} 页</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                    </div>
                )}

                {bank.status === "failed" && (
                    <div className="text-xs text-destructive">处理失败</div>
                )}

                <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">
                        {new Date(bank.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                    <div className="flex gap-2">
                        {bank.status === "ready" && (
                            <Link href={`/question-bank/${bank.id}`}>
                                <Button size="sm" variant="outline">
                                    查看题目
                                </Button>
                            </Link>
                        )}
                        {onDelete && (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => onDelete(bank.id)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
