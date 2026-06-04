import { useState } from "react";
import {
  formatDate,
  getAlertInfo,
  getDaysSinceCommande,
  getInterventionLabel,
  getInterventionStart
} from "../lib/business";
import type { Commande, TableView } from "../types";

interface CommandesTableProps {
  items: Commande[];
  view: TableView;
  onEdit: (commande: Commande) => void;
}

type ColumnKey = "identity" | "type" | "status" | "alert" | "intervention" | "billing" | "updated" | "notes";
type SortDirection = "asc" | "desc";

interface ColumnDefinition {
  key: ColumnKey;
  label: string;
  getValue: (commande: Commande) => string;
  getSortValue?: (commande: Commande) => string;
}

function AlertBadge({ commande }: { commande: Commande }) {
  const alert = getAlertInfo(commande);
  return <span className={`badge badge--${alert.tone}`}>{alert.label}</span>;
}

function getColumns(view: TableView): ColumnDefinition[] {
  const baseColumns: ColumnDefinition[] = [
    {
      key: "identity",
      label: view === "bureau" ? "Devis / Client / Date" : "Devis / Client",
      getValue: (commande) => `${commande.numeroDevis} ${commande.client} ${formatDate(commande.dateCommande)}`,
      getSortValue: (commande) => (view === "bureau" ? commande.dateCommande ?? "" : `${commande.numeroDevis} ${commande.client}`)
    },
    {
      key: "type",
      label: "Type",
      getValue: (commande) => commande.typeCommande
    },
    {
      key: "status",
      label: "Statut",
      getValue: (commande) => commande.statutCommande
    },
    {
      key: "alert",
      label: "Alerte",
      getValue: (commande) => getAlertInfo(commande).label
    },
    {
      key: "intervention",
      label: view === "sav" ? "SAV prévu" : "Intervention prévue",
      getValue: (commande) => `${getInterventionLabel(commande)} ${formatDate(getInterventionStart(commande))}`
    }
  ];

  if (view === "facturation" || view === "archives") {
    baseColumns.push({
      key: "billing",
      label: "Facturation",
      getValue: (commande) => `${commande.etatFacturation} ${commande.numeroFacture} ${formatDate(commande.dateFacture)}`
    });
  }

  baseColumns.push(
    {
      key: "updated",
      label: "Dernière MAJ",
      getValue: (commande) => formatDate(commande.derniereMaj, true)
    },
    {
      key: "notes",
      label: "Notes",
      getValue: (commande) =>
        view === "facturation"
          ? commande.commentaireFacturation
          : `${commande.commentaireSuivi} ${view === "sav" ? formatDate(commande.dateSavPrevue) : ""}`
    }
  );

  return baseColumns;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function MobileCard({
  commande,
  view,
  onEdit
}: {
  commande: Commande;
  view: TableView;
  onEdit: (commande: Commande) => void;
}) {
  const daysSince = getDaysSinceCommande(commande);

  return (
    <article className="commande-card">
      <div className="commande-card__top">
        <div>
          <p className="commande-card__devis">{commande.numeroDevis || "Sans devis"}</p>
          <h3>{commande.client}</h3>
        </div>
        <AlertBadge commande={commande} />
      </div>

      <div className="commande-card__meta">
        <span>{commande.typeCommande}</span>
        <span>{commande.statutCommande}</span>
      </div>

      <div className="commande-card__grid">
        <div>
          <small>{getInterventionLabel(commande)}</small>
          <strong>{formatDate(getInterventionStart(commande))}</strong>
        </div>
        <div>
          <small>Dernière MAJ</small>
          <strong>{formatDate(commande.derniereMaj, true)}</strong>
        </div>
        {view === "facturation" || view === "archives" ? (
          <div>
            <small>Facturation</small>
            <strong>{commande.etatFacturation}</strong>
          </div>
        ) : null}
        {view === "bureau" ? (
          <div>
            <small>Jours depuis commande</small>
            <strong>{daysSince ?? "-"}</strong>
          </div>
        ) : null}
        {view === "sav" ? (
          <div>
            <small>Date SAV</small>
            <strong>{formatDate(commande.dateSavPrevue)}</strong>
          </div>
        ) : null}
      </div>

      <p className="commande-card__comment">
        {view === "facturation" ? commande.commentaireFacturation || "Aucun commentaire facturation." : commande.commentaireSuivi || "Aucun commentaire suivi."}
      </p>

      <button type="button" className="ghost-button ghost-button--stretch" onClick={() => onEdit(commande)}>
        Modifier
      </button>
    </article>
  );
}

export function CommandesTable({ items, onEdit, view }: CommandesTableProps) {
  const columns = getColumns(view);
  const [sortKey, setSortKey] = useState<ColumnKey>("intervention");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filters, setFilters] = useState<Record<string, string>>({});

  function updateFilter(key: ColumnKey, value: string) {
    setFilters((current) => ({
      ...current,
      [key]: value
    }));
  }

  function toggleSort(key: ColumnKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  }

  const visibleItems = items
    .filter((commande) =>
      columns.every((column) => {
        const filterValue = filters[column.key];
        if (!filterValue) {
          return true;
        }

        return normalize(column.getValue(commande)).includes(normalize(filterValue));
      })
    )
    .sort((left, right) => {
      const column = columns.find((candidate) => candidate.key === sortKey);
      if (!column) {
        return 0;
      }

      const leftValue = column.getSortValue ? column.getSortValue(left) : column.getValue(left);
      const rightValue = column.getSortValue ? column.getSortValue(right) : column.getValue(right);
      const comparison = normalize(leftValue).localeCompare(normalize(rightValue));
      return sortDirection === "asc" ? comparison : -comparison;
    });

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <p>Aucune commande dans cette vue pour le moment.</p>
      </div>
    );
  }

  return (
    <>
      <div className="commandes-cards">
        {visibleItems.map((commande) => (
          <MobileCard key={commande.id} commande={commande} view={view} onEdit={onEdit} />
        ))}
      </div>

      <div className="table-wrap">
        <table className="commandes-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>
                  <button type="button" className="table-sort-button" onClick={() => toggleSort(column.key)}>
                    <span>{column.label}</span>
                    {sortKey === column.key ? <span aria-hidden="true">{sortDirection === "asc" ? "↑" : "↓"}</span> : null}
                  </button>
                </th>
              ))}
              <th />
            </tr>
            <tr className="table-filter-row">
              {columns.map((column) => (
                <th key={column.key}>
                  <input
                    value={filters[column.key] ?? ""}
                    onChange={(event) => updateFilter(column.key, event.target.value)}
                    placeholder="Filtrer"
                  />
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((commande) => {
              const daysSince = getDaysSinceCommande(commande);

              return (
                <tr key={commande.id}>
                  <td>
                    <div className="table-primary">
                      <strong>{commande.numeroDevis || "Sans devis"}</strong>
                      <span>{commande.client}</span>
                      {view === "bureau" ? <small>Commande : {formatDate(commande.dateCommande)}</small> : null}
                      {view === "bureau" && daysSince !== null ? <small>{daysSince} jours depuis commande</small> : null}
                    </div>
                  </td>
                  <td>{commande.typeCommande}</td>
                  <td>{commande.statutCommande}</td>
                  <td>
                    <AlertBadge commande={commande} />
                  </td>
                  <td>
                    <div className="table-primary">
                      <strong>{getInterventionLabel(commande)}</strong>
                      <span>{formatDate(getInterventionStart(commande))}</span>
                      {commande.datePoseFin ? <small>Fin : {formatDate(commande.datePoseFin)}</small> : null}
                    </div>
                  </td>
                  {view === "facturation" || view === "archives" ? (
                    <td>
                      <div className="table-primary">
                        <strong>{commande.etatFacturation}</strong>
                        <span>{commande.numeroFacture || "Sans facture"}</span>
                        <small>{formatDate(commande.dateFacture)}</small>
                      </div>
                    </td>
                  ) : null}
                  <td>{formatDate(commande.derniereMaj, true)}</td>
                  <td className="notes-cell">
                    {view === "facturation"
                      ? commande.commentaireFacturation || "Aucun commentaire."
                      : commande.commentaireSuivi || "Aucun commentaire."}
                  </td>
                  <td>
                    <button type="button" className="ghost-button" onClick={() => onEdit(commande)}>
                      Modifier
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
