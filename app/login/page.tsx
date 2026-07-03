import { AuthPanel } from "@/components/auth-panel";

export default function LoginPage() {
  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Secure access</p>
          <h1>Sign in</h1>
          <p className="hero-copy">Use the account already registered by the club. Admins open the control center, and players open only their own match schedule.</p>
        </div>
        <AuthPanel />
      </section>
    </main>
  );
}
