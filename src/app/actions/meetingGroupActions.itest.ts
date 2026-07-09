import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getSession: async () => (h.userId ? { userId: h.userId } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import prisma from "@/lib/prisma";
import {
  getReviewParticipants,
  addReviewParticipant,
  removeReviewParticipant,
  assignTaskToMeeting,
  assignTaskToRole,
} from "@/app/actions/meetingGroupActions";
import { seedGovernance } from "../../../test/fixtures/seedGovernance";

async function makeReview(organizerId?: string) {
  return prisma.review.create({
    data: { title: "FR26 Oturum", type: "MEETING", date: new Date(), organizerId },
  });
}

describe("meetingGroupActions (FR-26 entegrasyon)", () => {
  afterEach(() => {
    h.userId = null;
  });

  // --- katılımcı roster'ı ---

  it("kurum geneli rol katılımcı ekler; tekrar ekleme idempotenttir", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;
    const review = await makeReview();

    expect((await addReviewParticipant(review.id, seed.ownerId)).success).toBe(true);
    expect((await addReviewParticipant(review.id, seed.ownerId)).success).toBe(true); // idempotent
    expect((await addReviewParticipant(review.id, seed.managerId)).success).toBe(true);

    const parts = await getReviewParticipants(review.id);
    expect(parts).toHaveLength(2);
    expect(parts.map((p) => p.userId).sort()).toEqual([seed.ownerId, seed.managerId].sort());
  });

  it("katılımcı çıkarılır", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;
    const review = await makeReview();
    await addReviewParticipant(review.id, seed.ownerId);

    expect((await removeReviewParticipant(review.id, seed.ownerId)).success).toBe(true);
    expect(await getReviewParticipants(review.id)).toHaveLength(0);
  });

  it("organizatör (kurum geneli olmayan) kendi toplantısının katılımcılarını düzenleyebilir", async () => {
    const seed = await seedGovernance(prisma);
    const review = await makeReview(seed.ownerId); // organizatör = KPI_OWNER
    h.userId = seed.ownerId;

    expect((await addReviewParticipant(review.id, seed.managerId)).success).toBe(true);
  });

  it("kurum geneli olmayan ve organizatör olmayan kullanıcı katılımcı ekleyemez", async () => {
    const seed = await seedGovernance(prisma);
    const review = await makeReview(seed.pmoId); // organizatör başkası
    h.userId = seed.ownerId; // KPI_OWNER, organizatör değil

    const res = await addReviewParticipant(review.id, seed.managerId);
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toMatch(/yetkiniz yok/);
  });

  // --- gruba görev ata ---

  it("toplantı grubuna görev, tüm katılımcılara dağıtılır (fan-out)", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;
    const review = await makeReview();
    await addReviewParticipant(review.id, seed.ownerId);
    await addReviewParticipant(review.id, seed.managerId);

    const res = await assignTaskToMeeting(review.id, { title: "Sunum hazırla" });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.count).toBe(2);

    const tasks = await prisma.task.findMany({
      where: { title: "Sunum hazırla", source: "MANUAL" },
    });
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.assigneeId).sort()).toEqual([seed.ownerId, seed.managerId].sort());

    const audits = await prisma.auditLog.count({
      where: { action: "CREATE", entityType: "Task", context: "assignTaskToMeeting" },
    });
    expect(audits).toBe(2);
  });

  it("boş toplantı grubuna görev atanamaz", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;
    const review = await makeReview();

    const res = await assignTaskToMeeting(review.id, { title: "Boş" });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toMatch(/katılımcı yok/);
  });

  // --- role göre görev ata ---

  it("role göre görev, o roldeki tüm kullanıcılara dağıtılır ve assigneeRole kaydeder", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;

    // KPI_OWNER rolüne ikinci bir kullanıcı ekle → fan-out 2 olmalı.
    const owner2 = await prisma.user.create({
      data: { name: "Sahip2", email: "fr26_owner2@test.local", role: "KPI_OWNER" },
    });

    const res = await assignTaskToRole("KPI_OWNER", { title: "Aylık giriş" });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.count).toBe(2);

    const tasks = await prisma.task.findMany({ where: { assigneeRole: "KPI_OWNER" } });
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.assigneeId).sort()).toEqual([seed.ownerId, owner2.id].sort());
  });

  it("geçersiz rol reddedilir", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.pmoId;
    const res = await assignTaskToRole("SUPERHERO", { title: "x" });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toMatch(/Geçersiz rol/);
  });

  it("kurum geneli olmayan rol, role göre görev atayamaz", async () => {
    const seed = await seedGovernance(prisma);
    h.userId = seed.ownerId; // KPI_OWNER
    const res = await assignTaskToRole("USER", { title: "x" });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toMatch(/kurum geneli/);
  });

  it("oturum yoksa katılımcı işlemi reddedilir", async () => {
    const seed = await seedGovernance(prisma);
    const review = await makeReview();
    h.userId = null;
    const res = await addReviewParticipant(review.id, seed.ownerId);
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toMatch(/Oturum bulunamadı/);
  });
});
