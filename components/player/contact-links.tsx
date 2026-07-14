import { MessageCircle, Send } from "lucide-react";
import { normalizePhone } from "@/lib/format";
import type { PlayerProfileRow } from "@/lib/admin-data";

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
              <MessageCircle size={16} aria-hidden />
            </a>
            <a className="contact-button" href={`sms:${phone}`} aria-label={`Message ${player.display_name}`}>
              <Send size={16} aria-hidden />
            </a>
          </div>
        );
      })}
    </div>
  );
}
