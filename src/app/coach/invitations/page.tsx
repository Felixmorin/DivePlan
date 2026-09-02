import { MailCheck, MailPlus, MailWarning, UserCheck } from "lucide-react";
import type { InvitationEmailDeliveryStatus } from "@prisma/client";
import { CoachShell } from "@/components/coach/coach-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { formatMontrealDate } from "@/lib/timezone";
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
      <PageHeader description="Chemin pilote recommande: invitation par lien, activation du mot de passe, connexion directe." />
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <StepCard step="1" title="Creer le lien" description="Choisis Athlete, son groupe, puis genere l'invitation." />
        <StepCard step="2" title="Envoyer au testeur" description="Copie le lien affiche apres creation. Le lien complet n'est montre qu'a ce moment." />
        <StepCard step="3" title="Activation athlete" description="L'athlete definit son mot de passe et arrive sur son espace DivePlan." />
      </div>
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
            <CardDescription>20 dernieres invitations de ce club. Regenere une invitation si un lien a ete perdu.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {invitations.length > 0 ? (
              <div className="divide-y divide-[var(--color-border)]">
                {invitations.map((invite) => (
                  <div key={invite.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate font-black text-[var(--color-ink)]">{invite.firstName} {invite.lastName}</div>
                      <div className="truncate text-sm font-semibold text-[var(--color-ink-muted)]">{invite.email}</div>
                      <div className="mt-1 text-xs font-bold text-[var(--color-ink-soft)]">Expire le {formatMontrealDate(invite.expiresAt)} · creee le {formatMontrealDate(invite.createdAt)}</div>
                      {invite.emailDeliveryStatus === "FAILED" && invite.emailDeliveryError && (
                        <div className="mt-1 text-xs font-bold text-[var(--color-danger)]">Email en erreur: {invite.emailDeliveryError}</div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{invite.role}</Badge>
                      <Badge variant={invite.acceptedAt ? "success" : "warning"}>{invite.acceptedAt ? "Acceptee" : "En attente"}</Badge>
                      <DeliveryBadge status={invite.emailDeliveryStatus} error={invite.emailDeliveryError} />
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

function DeliveryBadge({ status, error }: { status: InvitationEmailDeliveryStatus; error: string | null }) {
  if (status === "SENT") {
    return <Badge variant="success"><MailCheck className="mr-1 h-3.5 w-3.5" /> Email envoye</Badge>;
  }

  if (status === "SKIPPED_LOCAL") {
    return <Badge variant="outline">Email local ignore</Badge>;
  }

  if (status === "FAILED") {
    return <Badge variant="warning" title={error ?? undefined}><MailWarning className="mr-1 h-3.5 w-3.5" /> Email en erreur</Badge>;
  }

  return <Badge variant="outline">Email non tente</Badge>;
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

function StepCard({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-white p-4">
      <div className="flex items-center gap-3">
        <Badge variant="dark">{step}</Badge>
        <div className="font-black text-[var(--color-ink)]">{title}</div>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">{description}</p>
    </div>
  );
}
