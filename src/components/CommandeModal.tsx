import { useEffect, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import {
  createEmptyCommande,
  ETAT_FACTURATION_OPTIONS,
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

  if (!isOpen) {
    return null;
  }

  function updateField(field: keyof CommandeDraft, value: string) {
    setDraft((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
              <span>Date pose / livraison / enlèvement</span>
              <input
                type="date"
                value={draft.datePosePrevue}
                onChange={(event) => updateField("datePosePrevue", event.target.value)}
              />
            </label>

            <label className="field">
              <span>Date de fin si plusieurs jours</span>
              <input
                type="date"
                value={draft.datePoseFin}
                onChange={(event) => updateField("datePoseFin", event.target.value)}
              />
            </label>

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
            statut "Prêt" et la synchronisation facturation vers suivi.
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
