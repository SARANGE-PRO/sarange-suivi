import { useEffect, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import {
  createEmptyCommande,
  ETAT_FACTURATION_OPTIONS,
  formatShortDate,
  listRangeDays,
  parseDateInput,
  STATUT_COMMANDE_OPTIONS,
  TYPE_COMMANDE_OPTIONS
} from "../lib/business";
import type { CommandeDraft } from "../types";

interface CommandeModalProps {
  initialValue: CommandeDraft | null;
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onDelete: (draft: CommandeDraft) => Promise<void>;
  onSubmit: (draft: CommandeDraft) => Promise<void>;
}

export function CommandeModal({
  initialValue,
  isOpen,
  isSaving,
  onClose,
  onDelete,
  onSubmit
}: CommandeModalProps) {
  const [draft, setDraft] = useState<CommandeDraft>(createEmptyCommande());

  useEffect(() => {
    if (isOpen) {
      setDraft(initialValue ?? createEmptyCommande());
    }
  }, [initialValue, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    document.body.classList.add("modal-open");

    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  function updateField(field: keyof CommandeDraft, value: string) {
    setDraft((current) => ({
      ...current,
      [field]: value
    }));
  }

  function toggleJourExclu(day: string) {
    setDraft((current) => ({
      ...current,
      joursExclus: current.joursExclus.includes(day)
        ? current.joursExclus.filter((item) => item !== day)
        : [...current.joursExclus, day].sort()
    }));
  }

  const rangeDays = listRangeDays(draft.datePosePrevue, draft.datePoseFin);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (draft.datePosePrevue && draft.datePoseFin && draft.datePoseFin < draft.datePosePrevue) {
      const confirmed = window.confirm(
        "La date de fin de pose est antérieure à la date de pose / livraison / enlèvement. Enregistrer quand même ?"
      );
      if (!confirmed) {
        return;
      }
    }

    await onSubmit(draft);
  }

  async function handleDelete() {
    await onDelete(draft);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-panel__header">
          <div>
            <p className="eyebrow">Commande</p>
            <h2>{draft.id ? "Modifier la commande" : "Nouvelle commande"}</h2>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Fermer
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="field">
              <span>N° devis</span>
              <input value={draft.numeroDevis} onChange={(event) => updateField("numeroDevis", event.target.value)} />
            </label>

            <label className="field">
              <span>Client</span>
              <input value={draft.client} onChange={(event) => updateField("client", event.target.value)} />
            </label>

            <label className="field">
              <span>Type commande</span>
              <select value={draft.typeCommande} onChange={(event) => updateField("typeCommande", event.target.value)}>
                {TYPE_COMMANDE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Statut commande</span>
              <select value={draft.statutCommande} onChange={(event) => updateField("statutCommande", event.target.value)}>
                {STATUT_COMMANDE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Date commande</span>
              <input
                type="date"
                value={draft.dateCommande}
                onChange={(event) => updateField("dateCommande", event.target.value)}
              />
            </label>

            <label className="field">
              <span>Date métrage / pose / livraison / enlèvement</span>
              <input
                type="date"
                value={draft.datePosePrevue}
                onChange={(event) => updateField("datePosePrevue", event.target.value)}
              />
            </label>

            <label className="field">
              <span>Date de fin pose si plusieurs jours</span>
              <input
                type="date"
                value={draft.datePoseFin}
                onChange={(event) => updateField("datePoseFin", event.target.value)}
              />
            </label>

            {rangeDays.length > 1 ? (
              <div className="field field--full">
                <span>Jours d'intervention sur la période</span>
                <div className="day-chips" role="group" aria-label="Jours d'intervention sur la période">
                  {rangeDays.map((day, index) => {
                    const isBoundary = index === 0 || index === rangeDays.length - 1;
                    const isExcluded = !isBoundary && draft.joursExclus.includes(day);
                    const date = parseDateInput(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        className={isExcluded ? "day-chip day-chip--off" : "day-chip"}
                        onClick={isBoundary ? undefined : () => toggleJourExclu(day)}
                        disabled={isBoundary}
                        aria-pressed={!isExcluded}
                        title={
                          isBoundary
                            ? "Jour de début ou de fin : modifiez les dates pour le changer"
                            : isExcluded
                              ? "Jour sans intervention — cliquer pour réactiver"
                              : "Cliquer pour retirer ce jour du planning"
                        }
                      >
                        {date ? formatShortDate(date) : day}
                      </button>
                    );
                  })}
                </div>
                <small className="field-hint">Cliquez sur un jour pour le retirer du planning (jour non travaillé sur ce chantier).</small>
              </div>
            ) : null}

            <label className="field">
              <span>Date SAV prévue</span>
              <input
                type="date"
                value={draft.dateSavPrevue}
                onChange={(event) => updateField("dateSavPrevue", event.target.value)}
              />
            </label>

            <label className="field">
              <span>État facturation</span>
              <select
                value={draft.etatFacturation}
                onChange={(event) => updateField("etatFacturation", event.target.value)}
              >
                {ETAT_FACTURATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>N° facture</span>
              <input
                value={draft.numeroFacture}
                onChange={(event) => updateField("numeroFacture", event.target.value)}
              />
            </label>

            <label className="field">
              <span>Date facture</span>
              <input type="date" value={draft.dateFacture} onChange={(event) => updateField("dateFacture", event.target.value)} />
            </label>

            <label className="field field--full">
              <span>Commentaire suivi</span>
              <textarea
                rows={4}
                value={draft.commentaireSuivi}
                onChange={(event) => updateField("commentaireSuivi", event.target.value)}
              />
            </label>

            <label className="field field--full">
              <span>Commentaire facturation</span>
              <textarea
                rows={3}
                value={draft.commentaireFacturation}
                onChange={(event) => updateField("commentaireFacturation", event.target.value)}
              />
            </label>
          </div>

          <div className="info-banner">
            La sauvegarde applique automatiquement la date de commande, la dernière mise à jour, le renommage du
            statut prêt selon le type de commande et la synchronisation facturation vers suivi.
          </div>

          <div className="modal-actions">
            <div>
              {draft.id ? (
                <button type="button" className="danger-button danger-button--text" onClick={handleDelete} disabled={isSaving}>
                  <Trash2 size={18} aria-hidden="true" />
                  Supprimer
                </button>
              ) : null}
            </div>
            <div className="modal-actions__main">
              <button type="button" className="ghost-button" onClick={onClose}>
                Annuler
              </button>
              <button type="submit" className="primary-button" disabled={isSaving}>
                {isSaving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
