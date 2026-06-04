import { startTransition, useDeferredValue, useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
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
  createEmptyCommande,
  formatDate,
  formatShortDate,
  getAlertInfo,
  getInterventionEnd,
  getInterventionKind,
  getInterventionLabel,
  getInterventionStart,
  getWeekDays,
  isActiveCommande,
  isArchiveCommande,
  isCommandeInWeek,
  isCommandeOnDay,
  isFacturationCommande,
  isSavCommande,
  matchesSearch,
  toDraft
} from "./lib/business";
import { createCommandesStore } from "./lib/store";
import type { AppUser, Commande, CommandeDraft, ThemeMode, TrashItem } from "./types";

const store = createCommandesStore();

const MAIN_NAV_ITEMS: Array<{ to: string; label: string; end?: boolean }> = [
  { to: "/", label: "Bureau général", end: true },
  { to: "/tv", label: "Planning pose" },
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
  const plannedThisWeek = commandes.filter((commande) => isActiveCommande(commande) && isCommandeInWeek(commande, weekDays)).length;
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
          <StatCard label="Cette semaine" value={String(plannedThisWeek)} detail="Poses, livraisons, enlèvements" />
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
        description="Dossiers SAV à prévoir ou déjà datés."
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
                      <strong>{item.commande.numeroDevis || "Sans devis"}</strong>
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

  return (
    <article className={`calendar-event calendar-event--${kind}`}>
      <span>{getInterventionLabel(commande)}</span>
      <strong>{commande.client || "Client non renseigné"}</strong>
      <small>{commande.numeroDevis || "Sans devis"}</small>
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
  const items = commandes
    .filter((commande) => isActiveCommande(commande) && isCommandeInWeek(commande, weekDays))
    .sort((left, right) => String(getInterventionStart(left)).localeCompare(String(getInterventionStart(right))));

  function changeWeek(days: number) {
    setWeekAnchor((current) => addDays(current, days));
  }

  return (
    <div className="tv-screen">
      <header className="tv-topbar">
        <div>
          <p className="eyebrow">Planning pose</p>
          <h2>Semaine du {formatDate(weekDays[0].toISOString())}</h2>
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

      <section className="week-calendar">
        {weekDays.map((day) => {
          const dayItems = items.filter((commande) => isCommandeOnDay(commande, day));

          return (
            <article key={day.toISOString()} className="calendar-day">
              <header>
                <span>{formatShortDate(day)}</span>
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
