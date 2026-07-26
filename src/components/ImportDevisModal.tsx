import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { DEVIS_STATUS_LABELS, fetchDevisList, type DevisSummary } from "../lib/quotes";
import type { AppUser } from "../types";

interface ImportDevisModalProps {
  isOpen: boolean;
  user: AppUser | null;
  onClose: () => void;
  onSelect: (devis: DevisSummary) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleDateString("fr-FR");
}

function formatMontant(totalTTC: number | null): string {
  if (totalTTC === null) {
    return "";
  }
  return totalTTC.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export function ImportDevisModal({ isOpen, user, onClose, onSelect }: ImportDevisModalProps) {
  const [devisList, setDevisList] = useState<DevisSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signedOnly, setSignedOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!isOpen || !user) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    fetchDevisList(user.uid)
      .then((list) => {
        if (!cancelled) {
          setDevisList(list);
        }
      })
      .catch((error) => {
        console.error("Lecture des devis impossible", error);
        if (!cancelled) {
          setLoadError("Impossible de lire les devis. Vérifiez la connexion, puis réessayez.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, user, reloadCount]);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSignedOnly(true);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const term = search.trim().toLowerCase();
  const visible = devisList.filter((devis) => {
    if (signedOnly && devis.status !== "signed") {
      return false;
    }
    if (!term) {
      return true;
    }
    return `${devis.quoteNumber} ${devis.clientName} ${devis.title}`.toLowerCase().includes(term);
  });

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-panel__header">
          <div>
            <p className="eyebrow">Commande</p>
            <h2>Importer depuis un devis</h2>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Fermer
          </button>
        </div>

        <div className="devis-import__filters">
          <label className="search-field devis-import__search">
            <span>Recherche</span>
            <div className="input-with-icon">
              <Search size={18} aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="N° devis, client..."
              />
            </div>
          </label>
          <label className="devis-import__toggle">
            <input
              type="checkbox"
              checked={signedOnly}
              onChange={(event) => setSignedOnly(event.target.checked)}
            />
            <span>Devis signés uniquement</span>
          </label>
        </div>

        {isLoading ? (
          <div className="empty-state">
            <p>Chargement des devis...</p>
          </div>
        ) : loadError ? (
          <div className="empty-state">
            <p>{loadError}</p>
            <button type="button" className="ghost-button" onClick={() => setReloadCount((count) => count + 1)}>
              <RefreshCw size={16} aria-hidden="true" />
              Réessayer
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <p>
              {devisList.length === 0
                ? "Aucun devis trouvé pour ce compte."
                : signedOnly
                  ? "Aucun devis signé ne correspond. Décochez le filtre pour voir tous les devis."
                  : "Aucun devis ne correspond à la recherche."}
            </p>
          </div>
        ) : (
          <div className="devis-import__list" role="list">
            {visible.map((devis) => (
              <button
                key={devis.id}
                type="button"
                role="listitem"
                className="devis-import__row"
                onClick={() => onSelect(devis)}
              >
                <span className="devis-import__number">{devis.quoteNumber || devis.title || "Sans numéro"}</span>
                <span className="devis-import__client">{devis.clientName || "Client inconnu"}</span>
                <span className="devis-import__date">{formatDate(devis.displayDate)}</span>
                <span className={`devis-import__status devis-import__status--${devis.status}`}>
                  {DEVIS_STATUS_LABELS[devis.status] ?? devis.status}
                </span>
                <span className="devis-import__total">{formatMontant(devis.totalTTC)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
