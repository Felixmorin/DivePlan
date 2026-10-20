"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { login, type LoginState } from "@/app/login/actions";
import styles from "./login.module.css";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className={styles.form}>
      <label className={styles.fieldLabel} htmlFor="login-email">Nom d’utilisateur (prenom.nom)</label>
      <div className={styles.inputWrap}>
        <UserRound className={styles.inputIcon} aria-hidden="true" />
        <input id="login-email" name="email" type="text" autoComplete="username" placeholder="prenom.nom" />
      </div>

      <label className={styles.fieldLabel} htmlFor="login-password">Mot de passe</label>
      <div className={styles.inputWrap}>
        <LockKeyhole className={styles.inputIcon} aria-hidden="true" />
        <input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Ton mot de passe" />
        <button className={styles.passwordToggle} type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
          {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>

      <div className={styles.formOptions}>
        <label className={styles.remember}>
          <input type="checkbox" />
          <span>Se souvenir de moi</span>
        </label>
        <a href="mailto:?subject=Mot%20de%20passe%20DivePlan">Mot de passe oublié ?</a>
      </div>

      {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? "Connexion..." : "Se connecter"}
        <ArrowRight aria-hidden="true" />
      </button>
    </form>
  );
}
