import { AuthPanel } from "@/components/auth-panel";

export default function LoginPage() {
  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Secure access</p>
          <h1>Sign in</h1>
          <p className="hero-copy">Admins manage tournaments and players manage their own match actions.</p>
        </div>
        <AuthPanel />
      </section>
    </main>
  );
}
