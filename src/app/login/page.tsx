import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Alert } from "@/components/ui/alert";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ passwordChanged?: string }> }) {
  const session = await auth();
  const query = await searchParams;

  if (session?.user?.role === "ATHLETE") {
    redirect(session.user.mustChangePassword ? "/change-password" : "/athlete");
  }

  if (session?.user?.role === "COACH" || session?.user?.role === "ADMIN") {
    redirect("/coach");
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-label="Connexion à DivePlan">
        <div className={styles.panel}>
          <div className={styles.brand} aria-label="DivePlan">
            <Image src="/icons/diveplan-powered-by-light.png" alt="DivePlan" width={360} height={120} priority />
          </div>

          <div className={styles.formCard}>
            <h1>Heureux de te revoir</h1>
            <p className={styles.intro}>Connecte-toi à ton espace DivePlan.</p>
            {query.passwordChanged === "1" && (
              <Alert variant="success" title="Mot de passe enregistré" className="mb-4">
                Reconnecte-toi maintenant avec ton nouveau mot de passe.
              </Alert>
            )}
            <LoginForm />
          </div>

          <p className={styles.accessHelp}>Besoin d’un accès ? <a href="mailto:?subject=Acc%C3%A8s%20%C3%A0%20DivePlan">Contacte ton entraîneur.</a></p>
          <p className={styles.copyright}>© 2026 DivePlan</p>
        </div>
      </section>
    </main>
  );
}
