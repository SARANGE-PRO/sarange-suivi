import { startTransition, useDeferredValue, useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Plus,
  RotateCcw,
  Search,
  SidebarClose,
  Sun,
  Trash2,
} from "lucide-react";
import { CommandeModal } from "./components/CommandeModal";
import { CommandesTable } from "./components/CommandesTable";
import {
  STATUT_COMMANDE_OPTIONS,
  createSequentialFabricationOrderUpdates,
  createEmptyCommande,
  formatDate,
  formatShortDate,
  formatWeekTitle,
  getInterventionEnd,
  getInterventionKind,
  getInterventionLabel,
  getInterventionStart,
  getManualFabricationOrderValue,
  getPlanningEventState,
  getWeekDays,
  hasPlanningEvent,
  hasManualFabricationOrder,
  isActiveCommande,
  isArchiveCommande,
  isCommandeInWeek,
  isCommandeOnDay,
  isFabricationCommande,
  isFacturationCommande,
  isSavCommande,
  matchesSearch,
  sortFabricationCommandes,
  toDraft
} from "./lib/business";
import { createCommandesStore } from "./lib/store";
import type { AppUser, Commande, CommandeDraft, FabricationOrderUpdate, ThemeMode, TrashItem } from "./types";

const store = createCommandesStore();

const MAIN_NAV_ITEMS: Array<{ to: string; label: string; end?: boolean }> = [
  { to: "/", label: "Bureau général", end: true },
  { to: "/tv", label: "Planning Sarange" },
  { to: "/fabrication", label: "Ordres fabrication" },
  { to: "/facturation", label: "Facturation" },
  { to: "/sav", label: "SAV" },
  { to: "/archives", label: "Archives" },
];

const TRASH_NAV_ITEM = { to: "/corbeille", label: "Corbeille" };

function useThemeMode() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = window.localStorage.getItem("sarange-theme");
    return stored === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("sarange-theme", theme);
  }, [theme]);

  return {
    theme,
    toggleTheme: () => setTheme((current) => (current === "light" ? "dark" : "light"))
  };
}

function statusPath(status: string) {
  return `/statut/${encodeURIComponent(status)}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isSameCalendarDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function isBeforeCalendarDay(left: Date, right: Date) {
  return new Date(left.getFullYear(), left.getMonth(), left.getDate()).getTime() < new Date(right.getFullYear(), right.getMonth(), right.getDate()).getTime();
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function ShellLayout({
  children,
  commandes,
  trashItems,
  user,
  theme,
  onToggleTheme,
  onSignOut,
  onOpenCreate
}: {
  children: ReactNode;
  commandes: Commande[];
  trashItems: TrashItem[];
  user: AppUser | null;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onSignOut: () => void;
  onOpenCreate: () => void;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return window.localStorage.getItem("sarange-sidebar-collapsed") === "true";
  });
  const activeCount = commandes.filter(isActiveCommande).length;
  const weekDays = getWeekDays();
  const plannedThisWeek = commandes.filter((commande) => hasPlanningEvent(commande) && isCommandeInWeek(commande, weekDays)).length;
  const savCount = commandes.filter(isSavCommande).length;

  useEffect(() => {
    window.localStorage.setItem("sarange-sidebar-collapsed", String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  function closeSidebarOnMobile() {
    if (window.matchMedia("(max-width: 1100px)").matches) {
      setIsSidebarCollapsed(true);
    }
  }

  return (
    <div className={isSidebarCollapsed ? "app-shell app-shell--sidebar-collapsed" : "app-shell"}>
      {isSidebarCollapsed ? null : <button type="button" className="sidebar-backdrop" onClick={() => setIsSidebarCollapsed(true)} aria-label="Fermer le menu" />}

      <button
        type="button"
        className="sidebar-floating-toggle"
        onClick={() => setIsSidebarCollapsed((current) => !current)}
        aria-label={isSidebarCollapsed ? "Ouvrir le menu" : "Fermer le menu"}
        title={isSidebarCollapsed ? "Ouvrir le menu" : "Fermer le menu"}
      >
        {isSidebarCollapsed ? <Menu size={22} aria-hidden="true" /> : <SidebarClose size={22} aria-hidden="true" />}
      </button>

      <aside className="app-sidebar" aria-hidden={isSidebarCollapsed}>
        <div className="brand-lockup">
          <div className="brand-lockup__mark">S.</div>
          <div className="sidebar-content">
            <p className="eyebrow">Sarange</p>
            <h1>Suivi commandes</h1>
          </div>
        </div>

        <nav className="sidebar-nav sidebar-content">
          {MAIN_NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={closeSidebarOnMobile} className={({ isActive }) => (isActive ? "nav-link nav-link--active" : "nav-link")}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-statuses sidebar-content">
          <p className="sidebar-title">Par statut</p>
          <nav className="sidebar-nav sidebar-nav--compact">
            {STATUT_COMMANDE_OPTIONS.filter((status) => status !== "Facturé" && status !== "Archivé").map((status) => (
              <NavLink key={status} to={statusPath(status)} onClick={closeSidebarOnMobile} className={({ isActive }) => (isActive ? "nav-link nav-link--active" : "nav-link")}>
                {status}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-panel sidebar-content">
          <p className="eyebrow">Source</p>
          <strong>{store.mode === "firebase" ? "Firebase Firestore" : "Mode local synchronisé"}</strong>
          <small>
            {store.mode === "firebase"
              ? "Les changements bureau et TV remontent instantanément."
              : "Le fallback local synchronise les onglets avec BroadcastChannel."}
          </small>
          <small>Corbeille locale : {trashItems.length} dossier{trashItems.length > 1 ? "s" : ""}</small>
          {store.mode === "firebase" && user ? <small>Connecté : {user.email}</small> : null}
        </div>

        <div className="sidebar-actions sidebar-content">
          <button type="button" className="primary-button primary-button--stretch" onClick={onOpenCreate}>
            <Plus size={18} aria-hidden="true" />
            Ajouter une commande
          </button>
          <button type="button" className="ghost-button ghost-button--stretch" onClick={onToggleTheme}>
            {theme === "light" ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
            {theme === "light" ? "Passer en sombre" : "Passer en clair"}
          </button>
          {store.mode === "firebase" && user ? (
            <button type="button" className="ghost-button ghost-button--stretch" onClick={onSignOut}>
              <LogOut size={18} aria-hidden="true" />
              Déconnexion
            </button>
          ) : null}
          <NavLink
            to={TRASH_NAV_ITEM.to}
            onClick={closeSidebarOnMobile}
            className={({ isActive }) => (isActive ? "nav-link nav-link--active nav-link--trash" : "nav-link nav-link--trash")}
          >
            {TRASH_NAV_ITEM.label}
          </NavLink>
        </div>
      </aside>

      <main className="app-main">
        <section className="quick-stats" aria-label="Synthèse discrète">
          <StatCard label="Dossiers actifs" value={String(activeCount)} detail="Hors facturés et archivés" />
          <StatCard label="Cette semaine" value={String(plannedThisWeek)} detail="Interventions Sarange" />
          <StatCard label="SAV" value={String(savCount)} detail="Dossiers SAV en suivi" />
        </section>

        {children}
      </main>
    </div>
  );
}

function AuthGate({
  isSigningIn,
  onSignIn,
  onToggleTheme,
  theme
}: {
  isSigningIn: boolean;
  onSignIn: () => void;
  onToggleTheme: () => void;
  theme: ThemeMode;
}) {
  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-lockup__mark">S.</div>
          <div>
            <p className="eyebrow">Sarange</p>
            <h1>Connexion au suivi</h1>
          </div>
        </div>

        <div>
          <h2>Connecte-toi avec le compte Google Sarange.</h2>
          <p>
            L’accès aux dossiers est protégé par Firebase. Une fois connecté, le planning et les commandes se
            synchronisent avec Firestore.
          </p>
        </div>

        <div className="auth-actions">
          <button type="button" className="primary-button" onClick={onSignIn} disabled={isSigningIn}>
            <LogIn size={18} aria-hidden="true" />
            {isSigningIn ? "Connexion..." : "Se connecter avec Google"}
          </button>
          <button type="button" className="ghost-button" onClick={onToggleTheme}>
            {theme === "light" ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
            {theme === "light" ? "Mode sombre" : "Mode clair"}
          </button>
        </div>
      </section>
    </main>
  );
}

function ViewToolbar({
  title,
  description,
  search,
  onSearchChange,
  onOpenCreate
}: {
  title: string;
  description: string;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenCreate: () => void;
}) {
  return (
    <section className="view-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Vue</p>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <button type="button" className="primary-button" onClick={onOpenCreate}>
          <Plus size={18} aria-hidden="true" />
          Nouvelle commande
        </button>
      </div>

      <label className="search-field search-field--wide">
        <span>Recherche</span>
        <div className="input-with-icon">
          <Search size={18} aria-hidden="true" />
          <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Devis, client, statut, note..." />
        </div>
      </label>
    </section>
  );
}

function BureauPage({
  commandes,
  onOpenCreate,
  onOpenEdit
}: {
  commandes: Commande[];
  onOpenCreate: () => void;
  onOpenEdit: (commande: Commande) => void;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const items = commandes.filter((commande) => isActiveCommande(commande) && matchesSearch(commande, deferredSearch));

  return (
    <>
      <ViewToolbar
        title="Bureau général"
        description="Saisie et suivi général des dossiers actifs. La facturation est volontairement masquée ici."
        search={search}
        onSearchChange={setSearch}
        onOpenCreate={onOpenCreate}
      />

      <CommandesTable items={items} view="bureau" onEdit={onOpenEdit} />
    </>
  );
}

function StatusPage({
  commandes,
  onOpenCreate,
  onOpenEdit
}: {
  commandes: Commande[];
  onOpenCreate: () => void;
  onOpenEdit: (commande: Commande) => void;
}) {
  const { status = "" } = useParams();
  const selectedStatus = decodeURIComponent(status);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const items = commandes.filter(
    (commande) => commande.statutCommande === selectedStatus && matchesSearch(commande, deferredSearch)
  );

  if (!STATUT_COMMANDE_OPTIONS.includes(selectedStatus as (typeof STATUT_COMMANDE_OPTIONS)[number])) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <ViewToolbar
        title={selectedStatus}
        description="Liste filtrée sur un seul état d'avancement."
        search={search}
        onSearchChange={setSearch}
        onOpenCreate={onOpenCreate}
      />

      <CommandesTable items={items} view="bureau" onEdit={onOpenEdit} />
    </>
  );
}

function SavPage({
  commandes,
  onOpenCreate,
  onOpenEdit
}: {
  commandes: Commande[];
  onOpenCreate: () => void;
  onOpenEdit: (commande: Commande) => void;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const items = commandes.filter((commande) => isSavCommande(commande) && matchesSearch(commande, deferredSearch));

  return (
    <>
      <ViewToolbar
        title="SAV"
        description="Dossiers SAV à prévoir, prévus ou déjà datés."
        search={search}
        onSearchChange={setSearch}
        onOpenCreate={onOpenCreate}
      />

      <CommandesTable items={items} view="sav" onEdit={onOpenEdit} />
    </>
  );
}

function FacturationPage({
  commandes,
  onOpenCreate,
  onOpenEdit
}: {
  commandes: Commande[];
  onOpenCreate: () => void;
  onOpenEdit: (commande: Commande) => void;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const items = commandes.filter((commande) => isFacturationCommande(commande) && matchesSearch(commande, deferredSearch));

  return (
    <>
      <ViewToolbar
        title="Facturation"
        description="La facturation apparaît seulement quand le dossier est passé à facturer ou déjà engagé en facture."
        search={search}
        onSearchChange={setSearch}
        onOpenCreate={onOpenCreate}
      />

      <CommandesTable items={items} view="facturation" onEdit={onOpenEdit} />
    </>
  );
}

function FabricationPage({
  commandes,
  onOpenCreate,
  onOpenEdit,
  onUpdateFabricationOrder
}: {
  commandes: Commande[];
  onOpenCreate: () => void;
  onOpenEdit: (commande: Commande) => void;
  onUpdateFabricationOrder: (updates: FabricationOrderUpdate[]) => Promise<void>;
}) {
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);
  const items = sortFabricationCommandes(commandes.filter(isFabricationCommande));
  const manualOrderCount = items.filter(hasManualFabricationOrder).length;

  async function applyOrderUpdates(updates: FabricationOrderUpdate[]) {
    if (updates.length === 0) {
      return;
    }

    setIsUpdatingOrder(true);

    try {
      await onUpdateFabricationOrder(updates);
    } finally {
      setIsUpdatingOrder(false);
    }
  }

  async function moveCommande(commandeId: string, direction: "up" | "down") {
    const currentIndex = items.findIndex((commande) => commande.id === commandeId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= items.length) {
      return;
    }

    const reorderedItems = [...items];
    const [movedCommande] = reorderedItems.splice(currentIndex, 1);
    reorderedItems.splice(targetIndex, 0, movedCommande);

    const nextOrderValue = getManualFabricationOrderValue(reorderedItems, targetIndex);
    const updates =
      nextOrderValue === null
        ? createSequentialFabricationOrderUpdates(reorderedItems)
        : [{ id: movedCommande.id, ordreFabrication: nextOrderValue }];

    await applyOrderUpdates(updates);
  }

  async function resetManualOrder() {
    await applyOrderUpdates(
      items
        .filter(hasManualFabricationOrder)
        .map((commande) => ({
          id: commande.id,
          ordreFabrication: null
        }))
    );
  }

  return (
    <>
      <section className="view-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Atelier</p>
            <h3>Ordres fabrication</h3>
            <p>
              Les dossiers au statut Fabrication en cours sont triés par date de commande, du plus ancien au plus
              récent. Les déplacements haut/bas posent une priorité manuelle, réinitialisable à tout moment.
            </p>
          </div>
          <div className="fabrication-toolbar">
            <button type="button" className="ghost-button" onClick={resetManualOrder} disabled={manualOrderCount === 0 || isUpdatingOrder}>
              <RotateCcw size={18} aria-hidden="true" />
              Ordre par date
            </button>
            <button type="button" className="primary-button" onClick={onOpenCreate}>
              <Plus size={18} aria-hidden="true" />
              Nouvelle commande
            </button>
          </div>
        </div>

        <div className="fabrication-summary" aria-label="Synthèse ordres fabrication">
          <span>{items.length} ordre{items.length > 1 ? "s" : ""} à traiter</span>
          <span>{manualOrderCount} priorité{manualOrderCount > 1 ? "s" : ""} manuelle{manualOrderCount > 1 ? "s" : ""}</span>
        </div>
      </section>

      {items.length === 0 ? (
        <div className="empty-state">
          <p>Aucun dossier en fabrication pour le moment.</p>
        </div>
      ) : (
        <section className="fabrication-list" aria-label="Ordres de fabrication à traiter">
          {items.map((commande, index) => {
            const isManualOrder = hasManualFabricationOrder(commande);

            return (
              <article key={commande.id} className={isManualOrder ? "fabrication-item fabrication-item--manual" : "fabrication-item"}>
                <div className="fabrication-rank" aria-label={`Priorité ${index + 1}`}>
                  {index + 1}
                </div>

                <div className="fabrication-item__body">
                  <div className="fabrication-item__title">
                    <div>
                      {commande.numeroDevis ? <p className="commande-card__devis">{commande.numeroDevis}</p> : null}
                      <h3>{commande.client || "Client non renseigné"}</h3>
                    </div>
                    <span className="badge badge--mint">{commande.statutCommande}</span>
                  </div>

                  <div className="fabrication-item__meta">
                    <span>Commande : {formatDate(commande.dateCommande)}</span>
                    <span>{commande.typeCommande}</span>
                    <span>{isManualOrder ? "Priorité manuelle" : "Ordre date commande"}</span>
                  </div>

                  <p className="fabrication-item__comment">{commande.commentaireSuivi || "Aucun commentaire suivi."}</p>
                </div>

                <div className="fabrication-item__actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => moveCommande(commande.id, "up")}
                    disabled={index === 0 || isUpdatingOrder}
                    title="Remonter"
                    aria-label={`Remonter ${commande.numeroDevis || commande.client || "ce dossier"}`}
                  >
                    <ArrowUp size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => moveCommande(commande.id, "down")}
                    disabled={index === items.length - 1 || isUpdatingOrder}
                    title="Descendre"
                    aria-label={`Descendre ${commande.numeroDevis || commande.client || "ce dossier"}`}
                  >
                    <ArrowDown size={18} aria-hidden="true" />
                  </button>
                  <button type="button" className="ghost-button" onClick={() => onOpenEdit(commande)}>
                    Modifier
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}

function ArchivesPage({
  commandes,
  onOpenCreate,
  onOpenEdit
}: {
  commandes: Commande[];
  onOpenCreate: () => void;
  onOpenEdit: (commande: Commande) => void;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const items = commandes.filter((commande) => isArchiveCommande(commande) && matchesSearch(commande, deferredSearch));

  return (
    <>
      <ViewToolbar
        title="Archives"
        description="Historique des dossiers clôturés."
        search={search}
        onSearchChange={setSearch}
        onOpenCreate={onOpenCreate}
      />

      <CommandesTable items={items} view="archives" onEdit={onOpenEdit} />
    </>
  );
}

function TrashPage({
  trashItems,
  onRestore,
  onDeleteForever
}: {
  trashItems: TrashItem[];
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
}) {
  return (
    <>
      <section className="view-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Locale</p>
            <h3>Corbeille</h3>
            <p>Les dossiers supprimés sont retirés du cloud et conservés ici pendant 30 jours sur cet ordinateur.</p>
          </div>
        </div>
      </section>

      {trashItems.length === 0 ? (
        <div className="empty-state">
          <p>La corbeille est vide.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="commandes-table trash-table">
            <thead>
              <tr>
                <th>Devis / Client</th>
                <th>Type</th>
                <th>Statut</th>
                <th>Supprimé le</th>
                <th>Suppression auto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {trashItems.map((item) => (
                <tr key={item.commande.id}>
                  <td>
                    <div className="table-primary">
                      {item.commande.numeroDevis ? <strong>{item.commande.numeroDevis}</strong> : null}
                      <span>{item.commande.client || "Client non renseigné"}</span>
                    </div>
                  </td>
                  <td>{item.commande.typeCommande}</td>
                  <td>{item.commande.statutCommande}</td>
                  <td>{formatDate(item.deletedAt, true)}</td>
                  <td>{formatDate(item.expiresAt, true)}</td>
                  <td>
                    <div className="table-actions">
                      <button type="button" className="ghost-button" onClick={() => onRestore(item.commande.id)}>
                        <RotateCcw size={18} aria-hidden="true" />
                        Restaurer
                      </button>
                      <button type="button" className="danger-button danger-button--text" onClick={() => onDeleteForever(item.commande.id)}>
                        <Trash2 size={18} aria-hidden="true" />
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function CalendarEvent({ commande }: { commande: Commande }) {
  const kind = getInterventionKind(commande);
  const start = getInterventionStart(commande);
  const end = getInterventionEnd(commande);
  const hasRange = start && end && start !== end;
  const suivi = commande.commentaireSuivi.trim();
  const planningState = getPlanningEventState(commande);

  return (
    <article className={`calendar-event calendar-event--${kind} calendar-event--${planningState}`}>
      <span className="calendar-event__kind">{getInterventionLabel(commande)}</span>
      <strong>{commande.client || "Client non renseigné"}</strong>
      <div className="calendar-event__meta">
        {commande.numeroDevis ? <small>{commande.numeroDevis}</small> : null}
        <small>{commande.statutCommande}</small>
      </div>
      {suivi ? <small className="calendar-event__comment">{suivi}</small> : null}
      {hasRange ? <small>Date de fin pose : {formatDate(end)}</small> : null}
    </article>
  );
}

function TvPage({
  commandes,
  theme,
  onToggleTheme
}: {
  commandes: Commande[];
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const weekDays = getWeekDays(weekAnchor);
  const today = new Date();
  const hasTodayInWeek = weekDays.some((day) => isSameCalendarDay(day, today));
  const weekCalendarStyle = hasTodayInWeek
    ? {
        gridTemplateColumns: weekDays
          .map((day) => (isBeforeCalendarDay(day, today) ? "minmax(7.5rem, 0.72fr)" : "minmax(11rem, 1.18fr)"))
          .join(" ")
      }
    : undefined;
  const items = commandes
    .filter((commande) => hasPlanningEvent(commande) && isCommandeInWeek(commande, weekDays))
    .sort((left, right) => String(getInterventionStart(left)).localeCompare(String(getInterventionStart(right))));

  function changeWeek(days: number) {
    setWeekAnchor((current) => addDays(current, days));
  }

  return (
    <div className="tv-screen">
      <div className="tv-background-effects" aria-hidden="true">
        <div className="tv-galaxy-dots" />
        <div className="tv-wave tv-wave--one" />
        <div className="tv-wave tv-wave--two" />
        <div className="tv-wave tv-wave--three" />
      </div>

      <header className="tv-topbar">
        <div>
          <p className="eyebrow">Planning Sarange</p>
          <h2>{formatWeekTitle(weekDays)}</h2>
        </div>
        <div className="tv-actions">
          <button type="button" className="icon-button" onClick={() => changeWeek(-7)} title="Semaine précédente" aria-label="Semaine précédente">
            <ArrowLeft size={22} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" onClick={() => setWeekAnchor(new Date())} title="Semaine actuelle" aria-label="Semaine actuelle">
            <CalendarDays size={22} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" onClick={() => changeWeek(7)} title="Semaine suivante" aria-label="Semaine suivante">
            <ArrowRight size={22} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" onClick={onToggleTheme} title={theme === "light" ? "Mode sombre" : "Mode clair"} aria-label={theme === "light" ? "Mode sombre" : "Mode clair"}>
            {theme === "light" ? <Moon size={22} aria-hidden="true" /> : <Sun size={22} aria-hidden="true" />}
          </button>
          <Link to="/" className="ghost-button">
            Retour bureau
          </Link>
        </div>
      </header>

      <section className="calendar-legend" aria-label="Code couleur">
        <span className="legend-dot legend-dot--pose" /> Pose
        <span className="legend-dot legend-dot--livraison" /> Livraison
        <span className="legend-dot legend-dot--enlevement" /> Enlèvement
        <span className="legend-dot legend-dot--sav" /> SAV
      </section>

      <section className={hasTodayInWeek ? "week-calendar week-calendar--current" : "week-calendar"} style={weekCalendarStyle}>
        {weekDays.map((day) => {
          const dayItems = items.filter((commande) => isCommandeOnDay(commande, day));
          const isToday = isSameCalendarDay(day, today);
          const isPastWeekday = hasTodayInWeek && isBeforeCalendarDay(day, today);
          const dayClassName = [
            "calendar-day",
            isToday ? "calendar-day--today" : "",
            isPastWeekday ? "calendar-day--past-weekday" : ""
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <article key={day.toISOString()} className={dayClassName}>
              <header>
                <span>
                  {formatShortDate(day)}
                  {isToday ? <small>Aujourd'hui</small> : null}
                </span>
                <strong>{dayItems.length}</strong>
              </header>

              <div className="calendar-day__events">
                {dayItems.length === 0 ? <p>Aucune intervention</p> : dayItems.map((commande) => <CalendarEvent key={`${commande.id}-${day.toISOString()}`} commande={commande} />)}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function AppContent() {
  const [commandes, setCommandes] = useState<Commande[]>(store.getSnapshot());
  const [trashItems, setTrashItems] = useState<TrashItem[]>(store.getTrashSnapshot());
  const [user, setUser] = useState<AppUser | null>(store.getUser());
  const [draft, setDraft] = useState<CommandeDraft | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const { theme, toggleTheme } = useThemeMode();

  useEffect(() => {
    return store.subscribe((next) => {
      startTransition(() => {
        setCommandes(next);
      });
    });
  }, []);

  useEffect(() => {
    return store.subscribeTrash((next) => {
      startTransition(() => {
        setTrashItems(next);
      });
    });
  }, []);

  useEffect(() => {
    return store.subscribeUser((next) => {
      startTransition(() => {
        setUser(next);
      });
    });
  }, []);

  function openCreateModal() {
    setDraft(createEmptyCommande());
    setIsModalOpen(true);
  }

  function openEditModal(commande: Commande) {
    setDraft(toDraft(commande));
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
  }

  async function handleSave(nextDraft: CommandeDraft) {
    setIsSaving(true);

    try {
      await store.upsert(nextDraft);
      setIsModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      window.alert(`Impossible d'enregistrer la commande : ${message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateFabricationOrder(updates: FabricationOrderUpdate[]) {
    try {
      await store.updateFabricationOrder(updates);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      window.alert(`Impossible de mettre à jour l'ordre de fabrication : ${message}`);
    }
  }

  async function handleSignIn() {
    setIsSigningIn(true);

    try {
      await store.signInWithGoogle();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      window.alert(`Impossible de se connecter : ${message}`);
    } finally {
      setIsSigningIn(false);
    }
  }

  async function handleSignOut() {
    await store.signOutUser();
    setIsModalOpen(false);
  }

  async function handleDeleteDraft(nextDraft: CommandeDraft) {
    if (!nextDraft.id) {
      return;
    }

    const commande = commandes.find((item) => item.id === nextDraft.id);
    if (!commande) {
      window.alert("Impossible de retrouver ce dossier dans la liste active.");
      return;
    }

    const confirmed = window.confirm(
      `Supprimer le dossier ${commande.numeroDevis || commande.client || "sans nom"} ? Il sera retiré du cloud et gardé 30 jours dans la corbeille locale.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await store.delete(commande);
      setIsModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      window.alert(`Impossible de supprimer le dossier : ${message}`);
    }
  }

  async function handleRestore(id: string) {
    try {
      await store.restoreFromTrash(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      window.alert(`Impossible de restaurer le dossier : ${message}`);
    }
  }

  async function handleDeleteForever(id: string) {
    const confirmed = window.confirm("Supprimer définitivement ce dossier de la corbeille locale ?");
    if (!confirmed) {
      return;
    }

    await store.deleteFromTrash(id);
  }

  if (store.mode === "firebase" && !user) {
    return <AuthGate isSigningIn={isSigningIn} onSignIn={handleSignIn} onToggleTheme={toggleTheme} theme={theme} />;
  }

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={
            <ShellLayout commandes={commandes} trashItems={trashItems} user={user} theme={theme} onToggleTheme={toggleTheme} onSignOut={handleSignOut} onOpenCreate={openCreateModal}>
              <BureauPage commandes={commandes} onOpenCreate={openCreateModal} onOpenEdit={openEditModal} />
            </ShellLayout>
          }
        />
        <Route
          path="/statut/:status"
          element={
            <ShellLayout commandes={commandes} trashItems={trashItems} user={user} theme={theme} onToggleTheme={toggleTheme} onSignOut={handleSignOut} onOpenCreate={openCreateModal}>
              <StatusPage commandes={commandes} onOpenCreate={openCreateModal} onOpenEdit={openEditModal} />
            </ShellLayout>
          }
        />
        <Route
          path="/fabrication"
          element={
            <ShellLayout commandes={commandes} trashItems={trashItems} user={user} theme={theme} onToggleTheme={toggleTheme} onSignOut={handleSignOut} onOpenCreate={openCreateModal}>
              <FabricationPage
                commandes={commandes}
                onOpenCreate={openCreateModal}
                onOpenEdit={openEditModal}
                onUpdateFabricationOrder={handleUpdateFabricationOrder}
              />
            </ShellLayout>
          }
        />
        <Route
          path="/sav"
          element={
            <ShellLayout commandes={commandes} trashItems={trashItems} user={user} theme={theme} onToggleTheme={toggleTheme} onSignOut={handleSignOut} onOpenCreate={openCreateModal}>
              <SavPage commandes={commandes} onOpenCreate={openCreateModal} onOpenEdit={openEditModal} />
            </ShellLayout>
          }
        />
        <Route
          path="/facturation"
          element={
            <ShellLayout commandes={commandes} trashItems={trashItems} user={user} theme={theme} onToggleTheme={toggleTheme} onSignOut={handleSignOut} onOpenCreate={openCreateModal}>
              <FacturationPage commandes={commandes} onOpenCreate={openCreateModal} onOpenEdit={openEditModal} />
            </ShellLayout>
          }
        />
        <Route
          path="/archives"
          element={
            <ShellLayout commandes={commandes} trashItems={trashItems} user={user} theme={theme} onToggleTheme={toggleTheme} onSignOut={handleSignOut} onOpenCreate={openCreateModal}>
              <ArchivesPage commandes={commandes} onOpenCreate={openCreateModal} onOpenEdit={openEditModal} />
            </ShellLayout>
          }
        />
        <Route
          path="/corbeille"
          element={
            <ShellLayout commandes={commandes} trashItems={trashItems} user={user} theme={theme} onToggleTheme={toggleTheme} onSignOut={handleSignOut} onOpenCreate={openCreateModal}>
              <TrashPage trashItems={trashItems} onRestore={handleRestore} onDeleteForever={handleDeleteForever} />
            </ShellLayout>
          }
        />
        <Route path="/tv" element={<TvPage commandes={commandes} theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <CommandeModal
        initialValue={draft}
        isOpen={isModalOpen}
        isSaving={isSaving}
        onClose={closeModal}
        onDelete={handleDeleteDraft}
        onSubmit={handleSave}
      />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
