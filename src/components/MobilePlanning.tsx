import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Factory } from "lucide-react";
import {
  formatDate,
  formatWeekTitle,
  getInterventionDayCount,
  getInterventionEnd,
  getInterventionKind,
  getInterventionLabel,
  getInterventionStart,
  getPlanningEventState,
  getWeekDays,
  hasPlanningEvent,
  isCommandeInWeek,
  isCommandeOnDay
} from "../lib/business";
import { productionForCommande, useProduction } from "../lib/production";
import type { Commande } from "../types";

/**
 * Planning TÉLÉPHONE : un agenda vertical, jour par jour, à la place de la
 * grille hebdomadaire de la TV (qui reste réservée aux grands écrans).
 * Mêmes règles que la TV : mêmes jours, mêmes types d'intervention, mêmes
 * couleurs ; un tap sur une intervention ouvre la fiche.
 */

const KIND_ORDER: Record<string, number> = { pose: 1, livraison: 2, enlevement: 3, sav: 4, autre: 5, metrage: 6 };

const weekdayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long" });
const dayMonthFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(left: Date, right: Date) {
  return startOfDay(left).getTime() === startOfDay(right).getTime();
}

export function MobilePlanning({ commandes, onOpenEdit }: { commandes: Commande[]; onOpenEdit: (commande: Commande) => void }) {
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const production = useProduction();
  const todayRef = useRef<HTMLElement | null>(null);
  const weekDays = getWeekDays(weekAnchor);
  const today = new Date();
  const hasTodayInWeek = weekDays.some((day) => isSameDay(day, today));

  const items = commandes.filter((commande) => hasPlanningEvent(commande) && isCommandeInWeek(commande, weekDays));

  // À l'ouverture sur la semaine en cours, la liste démarre sur aujourd'hui.
  useEffect(() => {
    if (hasTodayInWeek) {
      todayRef.current?.scrollIntoView({ block: "start" });
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [weekAnchor, hasTodayInWeek]);

  return (
    <section className="agenda" aria-label="Planning de la semaine">
      <header className="agenda__head">
        <button type="button" className="icon-button" onClick={() => setWeekAnchor((current) => addDays(current, -7))} aria-label="Semaine précédente">
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div className="agenda__title">
          <strong>{formatWeekTitle(weekDays)}</strong>
          <span>
            {items.length} intervention{items.length > 1 ? "s" : ""}
            {hasTodayInWeek ? "" : " · "}
            {hasTodayInWeek ? null : (
              <button type="button" className="agenda__today" onClick={() => setWeekAnchor(new Date())}>
                Revenir à aujourd'hui
              </button>
            )}
          </span>
        </div>
        <button type="button" className="icon-button" onClick={() => setWeekAnchor((current) => addDays(current, 7))} aria-label="Semaine suivante">
          <ArrowRight size={20} aria-hidden="true" />
        </button>
      </header>

      <div className="agenda__legend" aria-label="Code couleur">
        <span className="agenda__dot agenda__dot--pose" /> Pose
        <span className="agenda__dot agenda__dot--livraison" /> Livraison
        <span className="agenda__dot agenda__dot--enlevement" /> Enlèvement
        <span className="agenda__dot agenda__dot--sav" /> SAV
        <span className="agenda__dot agenda__dot--metrage" /> Métrage
      </div>

      {weekDays.map((day) => {
        const dayItems = items
          .filter((commande) => isCommandeOnDay(commande, day))
          .sort((left, right) => {
            const orderLeft = KIND_ORDER[getInterventionKind(left)] ?? 99;
            const orderRight = KIND_ORDER[getInterventionKind(right)] ?? 99;
            if (orderLeft !== orderRight) return orderLeft - orderRight;
            return String(getInterventionStart(left)).localeCompare(String(getInterventionStart(right)));
          });
        const isToday = isSameDay(day, today);
        const isPast = startOfDay(day) < startOfDay(today);
        const className = ["agenda__day", isToday ? "agenda__day--today" : "", isPast ? "agenda__day--past" : "", dayItems.length ? "" : "agenda__day--empty"]
          .filter(Boolean)
          .join(" ");

        return (
          <section key={day.toISOString()} className={className} ref={isToday ? todayRef : undefined}>
            <header className="agenda__day-head">
              <span className="agenda__day-name">{weekdayFormatter.format(day)}</span>
              <span className="agenda__day-date">{dayMonthFormatter.format(day)}</span>
              {isToday ? <span className="agenda__day-today">Aujourd'hui</span> : null}
              {dayItems.length ? <span className="agenda__day-count">{dayItems.length}</span> : null}
            </header>

            {dayItems.length === 0 ? (
              <p className="agenda__empty">Rien de prévu</p>
            ) : (
              <div className="agenda__events">
                {dayItems.map((commande) => {
                  const kind = getInterventionKind(commande);
                  const state = getPlanningEventState(commande);
                  const start = getInterventionStart(commande);
                  const end = getInterventionEnd(commande);
                  const hasRange = Boolean(start && end && start !== end);
                  const chantier = productionForCommande(production, commande);
                  const comment = commande.commentaireSuivi.trim();
                  return (
                    <button
                      key={commande.id}
                      type="button"
                      className={`agenda__event agenda__event--${kind} agenda__event--${state}`}
                      onClick={() => onOpenEdit(commande)}
                    >
                      <span className="agenda__event-kind">{getInterventionLabel(commande)}</span>
                      <strong className="agenda__event-client">{commande.client || "Client non renseigné"}</strong>
                      <span className="agenda__event-meta">
                        {commande.numeroDevis ? <span>{commande.numeroDevis}</span> : null}
                        <span>{commande.statutCommande}</span>
                        {chantier && chantier.totalPieces > 0 ? (
                          <span className={chantier.alertes.length ? "agenda__fab agenda__fab--alerte" : "agenda__fab"}>
                            <Factory size={12} aria-hidden="true" />
                            {chantier.terminePieces}/{chantier.totalPieces}
                            {chantier.alertes.length ? ` · ${chantier.alertes.length} bloqué${chantier.alertes.length > 1 ? "s" : ""}` : ""}
                          </span>
                        ) : null}
                      </span>
                      {hasRange ? (
                        <span className="agenda__event-range">
                          {getInterventionDayCount(commande)} jours jusqu'au {formatDate(end)}
                        </span>
                      ) : null}
                      {comment ? <span className="agenda__event-comment">{comment}</span> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </section>
  );
}
