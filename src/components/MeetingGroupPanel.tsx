"use client";

/**
 * FR-26: toplantı grubu (katılımcı roster'ı) yönetimi + gruba/role göre görev atama.
 * Seçili bir inceleme için: katılımcı ekle/çıkar, tüm gruba görev dağıt, role göre görev dağıt.
 * Yetki sunucuda uygulanır; rol-atama bölümü yalnız kurum geneli rollere gösterilir.
 */

import { useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, UserPlus, X, Send } from "lucide-react";
import { ASSIGNABLE_ROLES } from "@/lib/domainTypes";
import {
  getReviewParticipants,
  addReviewParticipant,
  removeReviewParticipant,
  assignTaskToMeeting,
  assignTaskToRole,
} from "@/app/actions/meetingGroupActions";

type UserLite = { id: string; name: string; role?: string };
type Participant = { id: string; userId: string; user: { id: string; name: string; role: string } };

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Yönetici (Admin)",
  PMO: "PMO",
  EXECUTIVE: "İcra Kurulu",
  DEPT_HEAD: "Departman Başkanı",
  KPI_OWNER: "KPI Sahibi",
  USER: "Kullanıcı",
};

export function MeetingGroupPanel({
  reviewId,
  users,
  orgWide,
}: {
  reviewId: string;
  users: UserLite[];
  orgWide: boolean;
}) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [addUserId, setAddUserId] = useState("");
  const [groupTaskTitle, setGroupTaskTitle] = useState("");
  const [roleTaskTitle, setRoleTaskTitle] = useState("");
  const [roleTarget, setRoleTarget] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = () => {
    getReviewParticipants(reviewId).then((p) => setParticipants(p as Participant[]));
  };

  useEffect(() => {
    let cancelled = false;
    getReviewParticipants(reviewId).then((p) => {
      if (!cancelled) setParticipants(p as Participant[]);
    });
    return () => {
      cancelled = true;
    };
  }, [reviewId]);

  const participantIds = new Set(participants.map((p) => p.userId));
  const addableUsers = users.filter((u) => !participantIds.has(u.id));

  const onAdd = () => {
    if (!addUserId) return;
    setMsg(null);
    startTransition(async () => {
      const res = await addReviewParticipant(reviewId, addUserId);
      if (res.success) {
        setAddUserId("");
        refresh();
      } else setMsg(res.error);
    });
  };

  const onRemove = (userId: string) => {
    setMsg(null);
    startTransition(async () => {
      const res = await removeReviewParticipant(reviewId, userId);
      if (res.success) refresh();
      else setMsg(res.error);
    });
  };

  const onAssignGroup = () => {
    if (!groupTaskTitle.trim()) return;
    setMsg(null);
    startTransition(async () => {
      const res = await assignTaskToMeeting(reviewId, { title: groupTaskTitle });
      if (res.success) {
        setGroupTaskTitle("");
        setMsg(`${res.count} katılımcıya görev atandı.`);
      } else setMsg(res.error);
    });
  };

  const onAssignRole = () => {
    if (!roleTaskTitle.trim() || !roleTarget) return;
    setMsg(null);
    startTransition(async () => {
      const res = await assignTaskToRole(roleTarget, { title: roleTaskTitle });
      if (res.success) {
        setRoleTaskTitle("");
        setMsg(`${res.count} kullanıcıya (${ROLE_LABELS[roleTarget] ?? roleTarget}) görev atandı.`);
      } else setMsg(res.error);
    });
  };

  return (
    <Card className="bg-zinc-900/30 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Users size={16} className="text-blue-400" /> Toplantı Grubu
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Katılımcı roster'ı */}
        {participants.length === 0 ? (
          <p className="text-xs text-zinc-500">Henüz katılımcı yok.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {participants.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300"
              >
                {p.user.name}
                <button
                  onClick={() => onRemove(p.userId)}
                  disabled={isPending}
                  className="text-zinc-500 hover:text-rose-400"
                  aria-label="Çıkar"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Katılımcı ekle */}
        <div className="flex gap-2">
          <Select value={addUserId} onValueChange={(v) => setAddUserId(v || "")}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 text-xs h-8 flex-1">
              <SelectValue placeholder="Katılımcı ekle...">
                {addUserId ? (users.find((u) => u.id === addUserId)?.name ?? "Seçili") : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              {addableUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
              {addableUsers.length === 0 && (
                <div className="p-2 text-xs text-zinc-500">Eklenecek kullanıcı yok</div>
              )}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={onAdd}
            disabled={isPending || !addUserId}
            className="h-8 bg-zinc-800 hover:bg-zinc-700"
          >
            <UserPlus size={14} />
          </Button>
        </div>

        {/* Gruba görev ata */}
        <div className="flex flex-col gap-2 border-t border-zinc-800 pt-3">
          <label className="text-[11px] text-zinc-400">Tüm gruba görev ata</label>
          <div className="flex gap-2">
            <Input
              placeholder="Görev başlığı..."
              value={groupTaskTitle}
              onChange={(e) => setGroupTaskTitle(e.target.value)}
              className="bg-zinc-900 border-zinc-800 text-xs h-8 flex-1"
            />
            <Button
              size="sm"
              onClick={onAssignGroup}
              disabled={isPending || !groupTaskTitle.trim()}
              className="h-8 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Send size={13} />
            </Button>
          </div>
        </div>

        {/* Role göre görev ata (yalnız kurum geneli roller) */}
        {orgWide && (
          <div className="flex flex-col gap-2 border-t border-zinc-800 pt-3">
            <label className="text-[11px] text-zinc-400">Role göre görev ata</label>
            <Select value={roleTarget} onValueChange={(v) => setRoleTarget(v || "")}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800 text-xs h-8">
                <SelectValue placeholder="Rol seç...">
                  {roleTarget ? (ROLE_LABELS[roleTarget] ?? roleTarget) : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {ASSIGNABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r] ?? r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                placeholder="Görev başlığı..."
                value={roleTaskTitle}
                onChange={(e) => setRoleTaskTitle(e.target.value)}
                className="bg-zinc-900 border-zinc-800 text-xs h-8 flex-1"
              />
              <Button
                size="sm"
                onClick={onAssignRole}
                disabled={isPending || !roleTaskTitle.trim() || !roleTarget}
                className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Send size={13} />
              </Button>
            </div>
          </div>
        )}

        {msg && <p className="text-[11px] text-zinc-400">{msg}</p>}
      </CardContent>
    </Card>
  );
}
