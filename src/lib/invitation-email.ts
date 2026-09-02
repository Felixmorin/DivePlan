import { Resend } from "resend";

type InvitationEmailInput = {
  activationUrl: string;
  clubName: string;
  email: string;
  firstName: string;
  invitationId: string;
  invitedByName: string;
  roleLabel: string;
};

export type InvitationEmailDeliveryResult =
  | { status: "SENT"; providerMessageId: string }
  | { status: "SKIPPED_LOCAL"; error: string }
  | { status: "FAILED"; error: string };

export async function sendInvitationEmail(input: InvitationEmailInput): Promise<InvitationEmailDeliveryResult> {
  const shouldSend = process.env.NODE_ENV === "production" || process.env.INVITATION_EMAIL_SEND_IN_DEVELOPMENT === "true";

  if (!shouldSend) {
    return {
      status: "SKIPPED_LOCAL",
      error: "Email non envoye en environnement local. Le lien d'activation reste disponible ci-dessous."
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVITATION_EMAIL_FROM;

  if (!apiKey) {
    return { status: "FAILED", error: "RESEND_API_KEY n'est pas configure." };
  }

  if (!from) {
    return { status: "FAILED", error: "INVITATION_EMAIL_FROM n'est pas configure." };
  }

  const resend = new Resend(apiKey);
  const subject = `${input.invitedByName} t'invite sur DivePlan`;
  const escapedFirstName = escapeHtml(input.firstName);
  const escapedClubName = escapeHtml(input.clubName);
  const escapedInvitedByName = escapeHtml(input.invitedByName);
  const escapedRoleLabel = escapeHtml(input.roleLabel);
  const escapedActivationUrl = escapeHtml(input.activationUrl);

  const text = [
    `Bonjour ${input.firstName},`,
    "",
    `${input.invitedByName} t'invite a rejoindre ${input.clubName} sur DivePlan comme ${input.roleLabel}.`,
    "Active ton compte et choisis ton mot de passe avec ce lien:",
    input.activationUrl,
    "",
    "Ce lien expire dans 14 jours.",
    "",
    "DivePlan"
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#102033;max-width:560px">
      <p>Bonjour ${escapedFirstName},</p>
      <p>${escapedInvitedByName} t'invite a rejoindre <strong>${escapedClubName}</strong> sur DivePlan comme ${escapedRoleLabel}.</p>
      <p>
        <a href="${escapedActivationUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px">
          Activer mon compte
        </a>
      </p>
      <p>Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur:</p>
      <p><a href="${escapedActivationUrl}">${escapedActivationUrl}</a></p>
      <p style="color:#64748b;font-size:14px">Ce lien expire dans 14 jours.</p>
    </div>
  `;

  try {
    const { data, error } = await resend.emails.send(
      {
        from,
        to: input.email,
        replyTo: process.env.INVITATION_EMAIL_REPLY_TO || undefined,
        subject,
        text,
        html
      },
      {
        headers: {
          "Idempotency-Key": `coach-invitation-${input.invitationId}`
        }
      }
    );

    if (error) {
      return { status: "FAILED", error: normalizeError(error) };
    }

    if (!data?.id) {
      return { status: "FAILED", error: "Resend n'a pas retourne d'identifiant de message." };
    }

    return { status: "SENT", providerMessageId: data.id };
  } catch (error) {
    return { status: "FAILED", error: normalizeError(error) };
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Erreur inconnue pendant l'envoi de l'email.";
}
