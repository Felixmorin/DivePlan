import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";
import { AcceptInviteForm } from "./accept-form";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await prisma.userInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { club: true }
  });

  if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
    notFound();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Activer ton compte DivePlan</CardTitle>
          <p className="text-sm text-slate-500">{invitation.club.name} t&apos;a invite comme {invitation.role === "ATHLETE" ? "athlete" : "coach"}.</p>
        </CardHeader>
        <CardContent>
          <AcceptInviteForm token={token} />
        </CardContent>
      </Card>
    </main>
  );
}
