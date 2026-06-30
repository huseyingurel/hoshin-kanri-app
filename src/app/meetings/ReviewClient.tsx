"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CalendarDays, CheckCircle2, ChevronRight, FileText, PlusCircle, Target, Users } from "lucide-react";
import { createReview, createDecision } from "../actions/reviewActions";

export function ReviewClient({ reviews, activeRedKpis, openCountermeasures, overdueTasks = [], users }: any) {
  const [activeTab, setActiveTab] = useState("agenda"); // agenda, history
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

  // Yeni Review Form State
  const [newReviewTitle, setNewReviewTitle] = useState("");
  const [newReviewType, setNewReviewType] = useState("MEETING");
  // FR-30: toplantı meta verisi — sıklık / başkan / koordinatör (opsiyonel)
  const [newReviewFrequency, setNewReviewFrequency] = useState("");
  const [newReviewChairId, setNewReviewChairId] = useState("");
  const [newReviewCoordinatorId, setNewReviewCoordinatorId] = useState("");
  const [isCreatingReview, setIsCreatingReview] = useState(false);

  // Yeni Karar Form State
  const [decisionText, setDecisionText] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [selectedKpiId, setSelectedKpiId] = useState<string | null>(null);
  const [isDecisionDialogOpen, setIsDecisionDialogOpen] = useState(false);

  const handleCreateReview = async () => {
    if (!newReviewTitle) return;
    setIsCreatingReview(true);
    const review = await createReview({
      title: newReviewTitle,
      type: newReviewType,
      date: new Date(),
      frequency: newReviewFrequency || undefined,
      chairUserId: newReviewChairId || undefined,
      coordinatorUserId: newReviewCoordinatorId || undefined,
    });
    if (review) setSelectedReviewId(review.id);
    setNewReviewTitle("");
    setNewReviewFrequency("");
    setNewReviewChairId("");
    setNewReviewCoordinatorId("");
    setIsCreatingReview(false);
  };

  const handleCreateDecision = async () => {
    if (!decisionText || !selectedReviewId) return;
    await createDecision({
      reviewId: selectedReviewId,
      decisionText,
      kpiId: selectedKpiId || undefined,
      assigneeId: assigneeId || undefined,
    });
    setDecisionText("");
    setIsDecisionDialogOpen(false);
  };

  const openDecisionDialog = (kpiId: string) => {
    setSelectedKpiId(kpiId);
    setIsDecisionDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Üst Sekmeler */}
      <div className="flex border-b border-zinc-800">
        <button 
          onClick={() => setActiveTab("agenda")}
          className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'agenda' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
        >
          Gündem & Kararlar
        </button>
        <button 
          onClick={() => setActiveTab("history")}
          className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'history' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
        >
          Geçmiş Değerlendirmeler
        </button>
      </div>

      {activeTab === "agenda" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Sol Panel: Aktif Değerlendirme Seçimi */}
          <div className="lg:col-span-1 flex flex-col gap-4">
            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-lg">Aktif Oturum</CardTitle>
                <CardDescription>Kararların işleneceği oturumu seçin</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Select 
                  key={`select-${reviews.length}-${selectedReviewId}`}
                  value={selectedReviewId || ""} 
                  onValueChange={(val) => setSelectedReviewId(val || null)}
                >
                  <SelectTrigger className="bg-zinc-900 border-zinc-800">
                    <SelectValue placeholder="Bir değerlendirme seçin...">
                      {selectedReviewId 
                        ? (reviews.find((r: any) => r.id === selectedReviewId)?.title || "Oturum Seçildi") 
                        : "Bir değerlendirme seçin..."}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {reviews.map((review: any) => (
                      <SelectItem key={review.id} value={review.id}>
                        {review.title} ({review.type === 'MEETING' ? 'Toplantı' : 'İnceleme'})
                      </SelectItem>
                    ))}
                    {reviews.length === 0 && <div className="p-2 text-xs text-zinc-500">Henüz oturum yok</div>}
                  </SelectContent>
                </Select>

                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-zinc-800"></div>
                  <span className="flex-shrink-0 mx-4 text-zinc-600 text-xs">veya yeni oluştur</span>
                  <div className="flex-grow border-t border-zinc-800"></div>
                </div>

                <div className="flex flex-col gap-3">
                  <Input 
                    placeholder="Oturum Adı (örn: Ekim Ops Toplantısı)" 
                    value={newReviewTitle}
                    onChange={(e) => setNewReviewTitle(e.target.value)}
                    className="bg-zinc-900 border-zinc-800"
                  />
                  <Select value={newReviewType} onValueChange={(val) => setNewReviewType(val || "")}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-800">
                      <SelectValue>
                        {newReviewType === 'MEETING' ? 'Kurul Toplantısı' : 'Uzman Değerlendirmesi'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      <SelectItem value="MEETING">Kurul Toplantısı</SelectItem>
                      <SelectItem value="EXPERT_REVIEW">Uzman Değerlendirmesi</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* FR-30: opsiyonel toplantı meta verisi — sıklık / başkan / koordinatör */}
                  <Select value={newReviewFrequency} onValueChange={(val) => setNewReviewFrequency(val || "")}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-800">
                      <SelectValue placeholder="Sıklık (opsiyonel)...">
                        {newReviewFrequency
                          ? ({ MONTHLY: "Aylık", QUARTERLY: "Üç Aylık", HALF_YEAR: "Yarıyıl", ANNUAL: "Yıllık" } as Record<string, string>)[newReviewFrequency]
                          : null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      <SelectItem value="MONTHLY">Aylık</SelectItem>
                      <SelectItem value="QUARTERLY">Üç Aylık</SelectItem>
                      <SelectItem value="HALF_YEAR">Yarıyıl</SelectItem>
                      <SelectItem value="ANNUAL">Yıllık</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={newReviewChairId} onValueChange={(val) => setNewReviewChairId(val || "")}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-800">
                      <SelectValue placeholder="Başkan (opsiyonel)...">
                        {newReviewChairId ? (users.find((u: any) => u.id === newReviewChairId)?.name || "Seçili") : null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      {users.map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={newReviewCoordinatorId} onValueChange={(val) => setNewReviewCoordinatorId(val || "")}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-800">
                      <SelectValue placeholder="Koordinatör (opsiyonel)...">
                        {newReviewCoordinatorId ? (users.find((u: any) => u.id === newReviewCoordinatorId)?.name || "Seçili") : null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      {users.map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleCreateReview} 
                    disabled={isCreatingReview || !newReviewTitle}
                    className="w-full bg-zinc-800 hover:bg-zinc-700"
                  >
                    <PlusCircle size={16} className="mr-2" /> Oturum Başlat
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Seçili Oturum Özeti ve Genel Karar Girişi */}
            {selectedReviewId && (
              <div className="flex flex-col gap-4">
                <Card className="bg-blue-950/20 border-blue-900/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-blue-400 flex items-center gap-2">
                      <Target size={16} /> Aktif Oturum Özeti
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold mb-1">
                      {reviews.find((r: any) => r.id === selectedReviewId)?.decisions.length || 0} 
                      <span className="text-sm font-normal text-zinc-400 ml-2">Alınan Karar</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-zinc-900/30 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-zinc-300">Genel Karar / Aksiyon Ekle</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <Input 
                      placeholder="Toplantı genel kararı..." 
                      value={selectedKpiId === null ? decisionText : ""}
                      onChange={(e) => {
                        setSelectedKpiId(null);
                        setDecisionText(e.target.value);
                      }}
                      className="bg-zinc-900 border-zinc-800 text-sm"
                    />
                    <Select value={selectedKpiId === null ? assigneeId : ""} onValueChange={(val) => {
                      setSelectedKpiId(null);
                      setAssigneeId(val || "");
                    }}>
                      <SelectTrigger className="bg-zinc-900 border-zinc-800 text-xs h-8">
                        <SelectValue placeholder="Sorumlu Ata...">
                          {assigneeId ? (users.find((u: any) => u.id === assigneeId)?.name || "Sorumlu Seçildi") : null}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800">
                        {users.map((u: any) => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      size="sm" 
                      onClick={handleCreateDecision} 
                      disabled={!decisionText || !!selectedKpiId}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Kararı Kaydet
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* Sağ Panel: Otomatik Gündem (Kırmızı KPI'lar) */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-rose-400">
              <AlertCircle size={20} /> Müdahale Gerektiren Metrikler
            </h3>
            
            {activeRedKpis.length === 0 ? (
              <Card className="bg-zinc-950 border-zinc-800">
                <CardContent className="py-8 text-center text-zinc-500">
                  Şu anda kırmızı statüde olan KPI bulunmamaktadır.
                </CardContent>
              </Card>
            ) : (
              activeRedKpis.map((kpi: any) => (
                <Card key={kpi.id} className="bg-zinc-950 border-rose-900/30">
                  <CardHeader className="pb-2 flex flex-row items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{kpi.name}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <span className="text-rose-400">Gerçekleşen: {kpi.periodRecords[0]?.actualValue}{kpi.unit}</span>
                        <span className="text-zinc-500">|</span>
                        <span>Hedef: {kpi.targetYear}{kpi.unit}</span>
                      </CardDescription>
                    </div>
                    <Badge variant="destructive" className="bg-rose-500/20 text-rose-400 hover:bg-rose-500/30">
                      Sapan Metrik
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-end mt-2">
                      <div className="text-sm text-zinc-400">
                        <strong>Son Yorum:</strong> {kpi.periodRecords[0]?.ownerComment || "Yorum girilmemiş"}
                      </div>
                      <Dialog open={isDecisionDialogOpen && selectedKpiId === kpi.id} onOpenChange={(open) => {
                        setIsDecisionDialogOpen(open);
                        if(open) setSelectedKpiId(kpi.id);
                      }}>
                        <DialogTrigger
                          render={
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!selectedReviewId}
                              className="bg-blue-600/10 text-blue-400 border-blue-600/30 hover:bg-blue-600/20"
                            />
                          }
                        >
                          <FileText size={14} className="mr-2" /> Karar Ekle
                        </DialogTrigger>
                        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-200">
                          <DialogHeader>
                            <DialogTitle>Yeni Karar / Aksiyon</DialogTitle>
                          </DialogHeader>
                          <div className="flex flex-col gap-4 py-4">
                            <div className="flex flex-col gap-2">
                              <Label>Karar Metni</Label>
                              <Input 
                                value={decisionText} 
                                onChange={(e) => setDecisionText(e.target.value)} 
                                className="bg-zinc-900 border-zinc-800"
                                placeholder="Örn: Pazarlama bütçesi %10 artırılacak"
                              />
                            </div>
                            <div className="flex flex-col gap-2">
                              <Label>Sorumlu Kişi (Opsiyonel)</Label>
                              <Select value={assigneeId} onValueChange={(val) => setAssigneeId(val || "")}>
                                <SelectTrigger className="bg-zinc-900 border-zinc-800">
                                  <SelectValue placeholder="Atanacak kişiyi seçin...">
                                    {assigneeId ? (users.find((u: any) => u.id === assigneeId)?.name || "Seçili") : null}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800">
                                  {users.map((u: any) => (
                                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDecisionDialogOpen(false)} className="bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-800">İptal</Button>
                            <Button onClick={handleCreateDecision} className="bg-blue-600 hover:bg-blue-700 text-white">Kaydet</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}

            {/* FR-24: gündeme açık karşı önlemleri ekle. */}
            <h3 className="text-lg font-semibold flex items-center gap-2 text-orange-400 mt-4">
              <FileText size={20} /> Açık Karşı Önlemler
            </h3>
            {openCountermeasures.length === 0 ? (
              <Card className="bg-zinc-950 border-zinc-800">
                <CardContent className="py-6 text-center text-zinc-500 text-sm">
                  Açık karşı önlem yok.
                </CardContent>
              </Card>
            ) : (
              openCountermeasures.map((cm: any) => (
                <Card key={cm.id} className="bg-zinc-950 border-orange-900/30">
                  <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{cm.problemStatement}</CardTitle>
                      <CardDescription className="mt-1 flex items-center gap-2 flex-wrap">
                        {cm.kpi?.name && <span>KPI: {cm.kpi.name}</span>}
                        {cm.ownerUser?.name && <span className="text-zinc-500">• Sorumlu: {cm.ownerUser.name}</span>}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/20">
                        {cm.status === "IN_PROGRESS" ? "Devam Ediyor" : "Açık"}
                      </Badge>
                      {cm.dueDate && (
                        <span className="text-[10px] text-zinc-500">
                          Vade: {new Date(cm.dueDate).toLocaleDateString("tr-TR")}
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  {cm.actionSummary && (
                    <CardContent className="pt-0 text-sm text-zinc-400">
                      <strong>Aksiyon:</strong> {cm.actionSummary}
                    </CardContent>
                  )}
                </Card>
              ))
            )}

            {/* G7: gündeme vadesi geçmiş görevler (kabul kriteri #5). */}
            <h3 className="text-lg font-semibold flex items-center gap-2 text-amber-400 mt-4">
              <AlertCircle size={20} /> Vadesi Geçmiş Görevler
            </h3>
            {overdueTasks.length === 0 ? (
              <Card className="bg-zinc-950 border-zinc-800">
                <CardContent className="py-6 text-center text-zinc-500 text-sm">
                  Vadesi geçmiş açık görev yok.
                </CardContent>
              </Card>
            ) : (
              overdueTasks.map((task: any) => (
                <Card key={task.id} className="bg-zinc-950 border-amber-900/30">
                  <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{task.title}</CardTitle>
                      <CardDescription className="mt-1 flex items-center gap-2">
                        {task.assignee?.name && <span>Sorumlu: {task.assignee.name}</span>}
                        {task.kpi?.name && <span className="text-zinc-500">• KPI: {task.kpi.name}</span>}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 shrink-0">
                      Vade: {task.dueDate ? new Date(task.dueDate).toLocaleDateString("tr-TR") : "-"}
                    </Badge>
                  </CardHeader>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div className="flex flex-col gap-4">
          {reviews.map((review: any) => (
            <Card key={review.id} className="bg-zinc-950 border-zinc-800">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    {review.type === 'MEETING' ? (
                      <Users className="text-indigo-400" size={24} />
                    ) : (
                      <CheckCircle2 className="text-emerald-400" size={24} />
                    )}
                    <div>
                      <CardTitle>{review.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {new Date(review.date).toLocaleDateString('tr-TR')} • {review.type === 'MEETING' ? 'Kurul Toplantısı' : 'Uzman Görüşü'}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-zinc-900">{review.status}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {review.decisions.length > 0 ? (
                  <div className="flex flex-col gap-3 mt-4 border-t border-zinc-800/50 pt-4">
                    <h4 className="text-sm font-medium text-zinc-400 mb-2">Alınan Kararlar & Sorumlular:</h4>
                    <div className="grid grid-cols-1 gap-2">
                      {review.decisions.map((decision: any) => (
                        <div key={decision.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/50">
                          <div className="flex items-start gap-3 flex-1">
                            <ChevronRight size={16} className="text-blue-500 mt-1 shrink-0" />
                            <span className="text-zinc-200 font-medium">{decision.decisionText}</span>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            {decision.assignee ? (
                              <div className="flex flex-col items-end">
                                <span className="text-xs font-bold text-zinc-300">{decision.assignee.name}</span>
                                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{decision.assignee.department?.name || 'Genel'}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-zinc-600">Sorumlu atanmadı</span>
                            )}
                            <Badge variant="outline" className="text-[10px] border-zinc-800 text-zinc-500 uppercase">
                              {decision.status === 'OPEN' ? 'Beklemede' : 'Tamamlandı'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-zinc-500 mt-2 italic">Bu oturumda kayıtlı bir karar bulunmuyor.</div>
                )}
              </CardContent>
            </Card>
          ))}
          {reviews.length === 0 && (
            <div className="text-center text-zinc-500 py-12">Henüz geçmiş bir değerlendirme kaydı yok.</div>
          )}
        </div>
      )}
    </div>
  );
}
