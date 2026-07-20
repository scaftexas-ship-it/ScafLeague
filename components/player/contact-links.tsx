import { MessageSquareText } from "lucide-react";
import { normalizePhone } from "@/lib/format";
import type { PlayerProfileRow } from "@/lib/admin-data";

/** The actual WhatsApp glyph, not a generic chat-bubble stand-in -- kept in WhatsApp's brand green since that's most of what makes it recognizable at a glance. */
function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg aria-hidden="true" fill="#25D366" height={size} viewBox="0 0 24 24" width={size}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.13-2.9-7C17.18 3.04 14.7 2 12.04 2zm5.8 14.02c-.24.68-1.4 1.33-1.93 1.4-.5.07-1.12.1-1.8-.11-.42-.13-.96-.31-1.65-.6-2.9-1.25-4.8-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-3 0-1.42.75-2.12 1.01-2.41.27-.29.58-.36.78-.36h.55c.18 0 .42-.03.65.5.24.56.8 1.94.87 2.08.07.14.12.3.02.48-.1.19-.15.3-.29.46-.14.16-.3.36-.43.48-.14.14-.29.29-.13.57.17.29.75 1.24 1.6 2.01 1.1 1 2.03 1.31 2.31 1.46.29.14.46.12.63-.07.17-.19.72-.84.92-1.13.19-.29.38-.24.65-.14.27.1 1.73.82 2.02.97.29.14.48.22.55.34.07.12.07.7-.17 1.38z" />
    </svg>
  );
}

export function ContactLinks({ players }: { players: PlayerProfileRow[] }) {
  const withPhones = players.filter((player) => normalizePhone(player.mobile_number));
  if (withPhones.length === 0) return null;

  return (
    <div className="contact-links">
      {withPhones.map((player) => {
        const phone = normalizePhone(player.mobile_number);
        return (
          <div className="contact-row" key={player.id}>
            <span>{player.display_name}</span>
            <a className="contact-button" href={`https://wa.me/${phone}`} rel="noreferrer" target="_blank" aria-label={`WhatsApp ${player.display_name}`}>
              <WhatsAppIcon size={16} />
            </a>
            <a className="contact-button" href={`sms:${phone}`} aria-label={`Message ${player.display_name}`}>
              <MessageSquareText size={16} aria-hidden />
            </a>
          </div>
        );
      })}
    </div>
  );
}
