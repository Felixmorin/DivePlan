import { MailPlus, UserCheck } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { InvitationForm } from "./invitation-form";

export const dynamic = "force-dynamic";

export default async function InvitationsPage() {
  const { clubId } = await requireCoach();
  if (clubId === "dev-club") {
    return (
      <CoachShell active="Invitations">
        <PageHeader description="Mode demo local sans PostgreSQL." />
        <Card>
          <CardHeader>
            <CardTitle>Base de donnees requise</CardTitle>
            <CardDescription>Les invitations doivent etre persistantes pour rester valides et securisees.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState title="Invitations indisponibles en demo" description="Configure un DATABASE_URL valide pour creer et suivre les liens d'activation." icon={MailPlus} />
          </CardContent>
        </Card>
      </CoachShell>
    );
  }

  const [groups, invitations] = await Promise.all([
    prisma.trainingGroup.findMany({ where: { clubId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.userInvitation.findMany({ where: { clubId }, orderBy: { createdAt: "desc" }, take: 20 })
  ]);

  return (
    <CoachShell active="Invitations">
      <PageHeader description="Ajouter un coach ou un athlete avec un lien d'activation." />
      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
            <CardTitle>Nouvelle invitation</CardTitle>
            <CardDescription>Le groupe est applique uniquement aux athletes invites.</CardDescription>
          </CardHeader>
          <CardContent className="p-5"><InvitationForm groups={groups} /></CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-[var(--color-border)] bg-white">
            <CardTitle>Historique recent</CardTitle>
            <CardDescription>20 dernieres invitations de ce club.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {invitations.length > 0 ? (
              <div className="divide-y divide-[var(--color-border)]">
                {invitations.map((invite) => (
                  <div key={invite.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate font-black text-[var(--color-ink)]">{invite.firstName} {invite.lastName}</div>
                      <div className="truncate text-sm font-semibold text-[var(--color-ink-muted)]">{invite.email}</div>
                      <div className="mt-1 text-xs font-bold text-[var(--color-ink-soft)]">Expire le {invite.expiresAt.toLocaleDateString("fr-CA")} · creee le {invite.createdAt.toLocaleDateString("fr-CA")}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{invite.role}</Badge>
                      <Badge variant={invite.acceptedAt ? "success" : "warning"}>{invite.acceptedAt ? "Acceptee" : "En attente"}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-5">
                <EmptyState title="Aucune invitation" description="Cree une invitation pour ajouter quelqu'un au club." icon={UserCheck} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CoachShell>
  );
}

function PageHeader({ description }: { description: string }) {
  return (
    <div className="mb-6">
      <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Acces</p>
      <h1 className="mt-2 text-3xl font-black text-[var(--color-ink)]">Invitations</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{description}</p>
    </div>
  );
}
