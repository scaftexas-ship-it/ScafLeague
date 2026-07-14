export function StatusBanner({ message, tone = "neutral", testId }: { message: string; tone?: "neutral" | "success" | "error"; testId?: string }) {
  if (!message) return null;
  return (
    <p className="status-banner" data-tone={tone} data-testid={testId} role="status">
      {message}
    </p>
  );
}
