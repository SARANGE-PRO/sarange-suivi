import type { AlertInfo, Commande, CommandeDraft, FabricationOrderUpdate } from "../types";

export const TYPE_COMMANDE_OPTIONS = [
  "Fourniture seule - livraison",
  "Fourniture seule - enlèvement",
  "Fourniture & Pose",
  "SAV",
  "Autre"
] as const;

export const STATUT_COMMANDE_OPTIONS = [
  "Métrage à faire",
  "Fiche fabrication à faire",
  "Fiche fabrication à vérifier",
  "Matériel à commander",
  "En attente de livraison matériel",
  "Fabrication en cours",
  "Prêt à poser",
  "Prêt à livrer",
  "Prêt à l'enlèvement",
  "Pose / livraison terminée",
  "À facturer",
  "Facturé",
  "Archivé",
  "SAV à prévoir",
  "SAV prévu"
] as const;

export const FABRICATION_STATUS = "Fabrication en cours";

export const ETAT_FACTURATION_OPTIONS = [
  "À facturer",
  "Facture faite",
  "Facture envoyée",
  "Payé",
  "Bloqué"
] as const;

export type InterventionKind = "metrage" | "pose" | "livraison" | "enlevement" | "sav" | "autre";
export type PlanningEventState = "upcoming" | "past" | "kept";

const TERMINAL_STATUSES = new Set(["Facturé", "Archivé"]);
const ARCHIVE_FILTER_STATUSES = new Set(["Archivé"]);
const BILLING_ACTIVE_STATES = new Set(["Facture faite", "Facture envoyée"]);
const PLANNING_HISTORY_STATUSES = new Set(["Pose / livraison terminée", "À facturer", "Facturé", "Archivé"]);
const PLANNING_HISTORY_BILLING_STATES = new Set(["Facture faite", "Facture envoyée", "Payé"]);
const FABRICATION_ORDER_STEP = 60_000;

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function toDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function formatAsDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateInput(value: string | null | undefined) {
  return toDate(value);
}

function dayDifference(from: Date, to: Date) {
  const diff = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.floor(diff / 86_400_000);
}

function getDateOrderValue(value: string | null | undefined) {
  const date = toDate(value);
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
}

function getStableCommandeLabel(commande: Commande) {
  return `${commande.numeroDevis} ${commande.client} ${commande.id}`;
}

function normalizeReadyStatus(typeCommande: string, statutCommande: string) {
  if (statutCommande !== "Prêt") {
    return statutCommande;
  }

  const normalizedType = stripAccents(typeCommande);

  if (normalizedType.includes("livraison")) {
    return "Prêt à livrer";
  }

  if (normalizedType.includes("enlevement")) {
    return "Prêt à l'enlèvement";
  }

  return "Prêt à poser";
}

function syncFacturationToStatut(statutCommande: string, etatFacturation: string) {
  if (etatFacturation === "Payé") {
    return "Archivé";
  }

  if (etatFacturation === "Facture faite" || etatFacturation === "Facture envoyée") {
    return "Facturé";
  }

  return statutCommande;
}

function cleanText(value: string) {
  return value.trim();
}

function cleanOptionalDate(value: string) {
  return value.trim() || null;
}

function cleanJoursExclus(joursExclus: string[], start: string | null, end: string | null) {
  if (!start || !end || end <= start) {
    return [];
  }

  // Les jours de début et de fin restent toujours posés : seuls les jours
  // strictement à l'intérieur de la plage peuvent être exclus.
  return [...new Set(joursExclus)].filter((day) => day > start && day < end).sort();
}

export function createEmptyCommande(): CommandeDraft {
  return {
    numeroDevis: "",
    client: "",
    typeCommande: TYPE_COMMANDE_OPTIONS[0],
    statutCommande: STATUT_COMMANDE_OPTIONS[0],
    dateCommande: "",
    datePosePrevue: "",
    datePoseFin: "",
    joursExclus: [],
    dateSavPrevue: "",
    commentaireSuivi: "",
    etatFacturation: ETAT_FACTURATION_OPTIONS[0],
    numeroFacture: "",
    dateFacture: "",
    commentaireFacturation: ""
  };
}

export function toDraft(commande: Commande): CommandeDraft {
  return {
    id: commande.id,
    numeroDevis: commande.numeroDevis,
    client: commande.client,
    typeCommande: commande.typeCommande,
    statutCommande: commande.statutCommande,
    dateCommande: commande.dateCommande?.slice(0, 10) ?? "",
    datePosePrevue: commande.datePosePrevue?.slice(0, 10) ?? "",
    datePoseFin: commande.datePoseFin?.slice(0, 10) ?? "",
    joursExclus: commande.joursExclus ?? [],
    dateSavPrevue: commande.dateSavPrevue?.slice(0, 10) ?? "",
    commentaireSuivi: commande.commentaireSuivi,
    etatFacturation: commande.etatFacturation,
    numeroFacture: commande.numeroFacture,
    dateFacture: commande.dateFacture?.slice(0, 10) ?? "",
    commentaireFacturation: commande.commentaireFacturation
  };
}

export function prepareCommandeForSave(draft: CommandeDraft, previous?: Commande): Commande {
  const now = new Date();
  const nextId = draft.id ?? previous?.id ?? crypto.randomUUID();
  const hasIdentity = cleanText(draft.numeroDevis) || cleanText(draft.client);
  let nextStatut = normalizeReadyStatus(draft.typeCommande, draft.statutCommande);
  nextStatut = syncFacturationToStatut(nextStatut, draft.etatFacturation);

  const nextDateCommande = cleanOptionalDate(draft.dateCommande) ?? (hasIdentity ? formatAsDateInput(now) : null);
  const keepsFabricationOrder = previous?.statutCommande === FABRICATION_STATUS && nextStatut === FABRICATION_STATUS;
  const nextDatePosePrevue = cleanOptionalDate(draft.datePosePrevue);
  const nextDatePoseFin = cleanOptionalDate(draft.datePoseFin);

  return {
    id: nextId,
    numeroDevis: cleanText(draft.numeroDevis),
    client: cleanText(draft.client),
    typeCommande: draft.typeCommande,
    statutCommande: nextStatut,
    dateCommande: nextDateCommande,
    ordreFabrication: keepsFabricationOrder ? previous?.ordreFabrication ?? null : null,
    datePosePrevue: nextDatePosePrevue,
    datePoseFin: nextDatePoseFin,
    joursExclus: cleanJoursExclus(draft.joursExclus, nextDatePosePrevue, nextDatePoseFin),
    dateSavPrevue: cleanOptionalDate(draft.dateSavPrevue),
    derniereMaj: now.toISOString(),
    commentaireSuivi: cleanText(draft.commentaireSuivi),
    etatFacturation: draft.etatFacturation,
    numeroFacture: cleanText(draft.numeroFacture),
    dateFacture: cleanOptionalDate(draft.dateFacture),
    commentaireFacturation: cleanText(draft.commentaireFacturation)
  };
}

export function getDaysSinceCommande(commande: Commande, now = new Date()) {
  if (TERMINAL_STATUSES.has(commande.statutCommande)) {
    return null;
  }

  const dateCommande = toDate(commande.dateCommande);
  if (!dateCommande) {
    return null;
  }

  return dayDifference(dateCommande, now);
}

export function getAlertInfo(commande: Commande, now = new Date()): AlertInfo {
  if (commande.statutCommande === "Facturé") {
    return { label: "Facturé", tone: "green", priority: 40 };
  }

  if (commande.statutCommande === "Archivé" || commande.etatFacturation === "Payé") {
    return { label: "Archivé", tone: "slate", priority: 10 };
  }

  if (commande.statutCommande === "SAV à prévoir") {
    return { label: "SAV à prévoir", tone: "orange", priority: 92 };
  }

  if (commande.statutCommande === "SAV prévu") {
    return { label: "SAV prévu", tone: "mint", priority: 72 };
  }

  if (commande.statutCommande === "À facturer") {
    return { label: "À facturer", tone: "purple", priority: 80 };
  }

  const datePose = toDate(commande.datePosePrevue);
  if (datePose && startOfDay(datePose) < startOfDay(now) && !TERMINAL_STATUSES.has(commande.statutCommande)) {
    return { label: "Date dépassée", tone: "red", priority: 100 };
  }

  const daysSinceCommande = getDaysSinceCommande(commande, now);
  if (typeof daysSinceCommande === "number" && daysSinceCommande > 30 && !commande.statutCommande.includes("Prêt")) {
    return { label: "À relancer", tone: "orange", priority: 95 };
  }

  if (commande.statutCommande.includes("Prêt")) {
    return { label: commande.statutCommande, tone: "green", priority: 70 };
  }

  if (commande.statutCommande === "En attente de livraison matériel") {
    return { label: "Attente matériel", tone: "yellow", priority: 60 };
  }

  return { label: "En cours", tone: "mint", priority: 50 };
}

export function isActiveCommande(commande: Commande) {
  return !TERMINAL_STATUSES.has(commande.statutCommande);
}

export function isFacturationCommande(commande: Commande) {
  return (
    commande.statutCommande === "À facturer" ||
    commande.statutCommande === "Facturé" ||
    BILLING_ACTIVE_STATES.has(commande.etatFacturation)
  );
}

export function isArchiveCommande(commande: Commande) {
  return ARCHIVE_FILTER_STATUSES.has(commande.statutCommande) || commande.etatFacturation === "Payé";
}

export function isSavCommande(commande: Commande) {
  return commande.typeCommande === "SAV" || commande.statutCommande === "SAV à prévoir" || commande.statutCommande === "SAV prévu";
}

export function isPlanningHistoryCommande(commande: Commande) {
  return PLANNING_HISTORY_STATUSES.has(commande.statutCommande) || PLANNING_HISTORY_BILLING_STATES.has(commande.etatFacturation);
}

export function isFabricationCommande(commande: Commande) {
  return commande.statutCommande === FABRICATION_STATUS;
}

export function hasManualFabricationOrder(commande: Commande) {
  return typeof commande.ordreFabrication === "number" && Number.isFinite(commande.ordreFabrication);
}

export function getAutomaticFabricationOrderValue(commande: Commande) {
  return getDateOrderValue(commande.dateCommande);
}

export function getFabricationOrderValue(commande: Commande) {
  return hasManualFabricationOrder(commande) ? commande.ordreFabrication ?? Number.MAX_SAFE_INTEGER : getAutomaticFabricationOrderValue(commande);
}

export function sortFabricationCommandes(commandes: Commande[]) {
  return [...commandes].sort((left, right) => {
    const orderDifference = getFabricationOrderValue(left) - getFabricationOrderValue(right);
    if (orderDifference !== 0) {
      return orderDifference;
    }

    const dateDifference = getAutomaticFabricationOrderValue(left) - getAutomaticFabricationOrderValue(right);
    if (dateDifference !== 0) {
      return dateDifference;
    }

    return getStableCommandeLabel(left).localeCompare(getStableCommandeLabel(right), "fr-FR");
  });
}

export function getManualFabricationOrderValue(commandes: Commande[], targetIndex: number) {
  const previous = commandes[targetIndex - 1];
  const next = commandes[targetIndex + 1];
  const previousValue = previous ? getFabricationOrderValue(previous) : null;
  const nextValue = next ? getFabricationOrderValue(next) : null;

  if (previousValue !== null && nextValue !== null) {
    if (nextValue - previousValue > 1) {
      return previousValue + (nextValue - previousValue) / 2;
    }

    return null;
  }

  if (previousValue !== null) {
    return previousValue + FABRICATION_ORDER_STEP;
  }

  if (nextValue !== null) {
    return nextValue - FABRICATION_ORDER_STEP;
  }

  return getAutomaticFabricationOrderValue(commandes[targetIndex]);
}

export function createSequentialFabricationOrderUpdates(commandes: Commande[]): FabricationOrderUpdate[] {
  const firstOrderValue = commandes.reduce(
    (currentMin, commande) => Math.min(currentMin, getAutomaticFabricationOrderValue(commande)),
    Number.MAX_SAFE_INTEGER
  );
  const baseOrderValue = firstOrderValue === Number.MAX_SAFE_INTEGER ? Date.now() : firstOrderValue;

  return commandes.map((commande, index) => ({
    id: commande.id,
    ordreFabrication: baseOrderValue + index * FABRICATION_ORDER_STEP
  }));
}

export function formatDate(value: string | null | undefined, withTime = false) {
  const date = withTime && value ? new Date(value) : toDate(value);
  if (!date || Number.isNaN(date.getTime())) {
    return "Non renseignée";
  }

  if (withTime) {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium"
  }).format(date);
}

export function formatShortDate(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit"
  }).format(value);
}

function getIsoWeekNumber(value: Date) {
  const target = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));

  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export function formatWeekTitle(weekDays: Date[]) {
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];
  const dayMonthFormatter = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long"
  });
  const dayMonthYearFormatter = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  const startLabel =
    weekStart.getFullYear() === weekEnd.getFullYear()
      ? dayMonthFormatter.format(weekStart)
      : dayMonthYearFormatter.format(weekStart);

  return `Semaine ${getIsoWeekNumber(weekStart)} du ${startLabel} au ${dayMonthYearFormatter.format(weekEnd)}`;
}

export function matchesSearch(commande: Commande, rawQuery: string) {
  const query = stripAccents(rawQuery.trim());
  if (!query) {
    return true;
  }

  return [
    commande.numeroDevis,
    commande.client,
    commande.typeCommande,
    commande.statutCommande,
    commande.etatFacturation,
    commande.numeroFacture,
    commande.commentaireSuivi,
    commande.commentaireFacturation
  ].some((value) => stripAccents(value).includes(query));
}

export function getInterventionKind(commande: Commande): InterventionKind {
  if (isSavCommande(commande)) {
    return "sav";
  }

  const normalizedType = stripAccents(commande.typeCommande);
  const normalizedStatus = stripAccents(commande.statutCommande);

  if (normalizedStatus.includes("metrage")) {
    return "metrage";
  }

  if (normalizedType.includes("livraison") || normalizedStatus.includes("livrer")) {
    return "livraison";
  }

  if (normalizedType.includes("enlevement") || normalizedStatus.includes("enlevement")) {
    return "enlevement";
  }

  if (normalizedType.includes("pose") || normalizedStatus.includes("poser") || normalizedStatus.includes("pose")) {
    return "pose";
  }

  return "autre";
}

export function getInterventionLabel(commande: Commande) {
  const kind = getInterventionKind(commande);

  if (kind === "metrage") {
    return "Métrage";
  }

  if (kind === "livraison") {
    return "Livraison";
  }

  if (kind === "enlevement") {
    return "Enlèvement";
  }

  if (kind === "sav") {
    return "SAV";
  }

  if (kind === "pose") {
    return "Pose";
  }

  return "Intervention";
}

export function getInterventionStart(commande: Commande) {
  if (isSavCommande(commande) && commande.dateSavPrevue) {
    return commande.dateSavPrevue;
  }

  return commande.datePosePrevue;
}

export function getInterventionEnd(commande: Commande) {
  return commande.datePoseFin || getInterventionStart(commande);
}

export function isJourExclu(commande: Commande, day: Date) {
  return (commande.joursExclus ?? []).includes(formatAsDateInput(day));
}

export function getInterventionDayCount(commande: Commande) {
  const start = toDate(getInterventionStart(commande));
  const end = toDate(getInterventionEnd(commande));

  if (!start || !end) {
    return 0;
  }

  const totalDays = dayDifference(start, end) + 1;
  return Math.max(totalDays - (commande.joursExclus?.length ?? 0), 0);
}

const MAX_JOURS_SELECTION = 31;

export function listRangeDays(startValue: string | null | undefined, endValue: string | null | undefined) {
  const start = toDate(startValue);
  const end = toDate(endValue);

  if (!start || !end) {
    return [];
  }

  const totalDays = dayDifference(start, end) + 1;
  if (totalDays < 2 || totalDays > MAX_JOURS_SELECTION) {
    return [];
  }

  return Array.from({ length: totalDays }, (_, index) => formatAsDateInput(addDays(start, index)));
}

export function hasPlanningEvent(commande: Commande) {
  return Boolean(toDate(getInterventionStart(commande)) && toDate(getInterventionEnd(commande)));
}

export function getPlanningEventState(commande: Commande, now = new Date()): PlanningEventState {
  if (isPlanningHistoryCommande(commande)) {
    return "kept";
  }

  const end = toDate(getInterventionEnd(commande));
  if (end && startOfDay(end) < startOfDay(now)) {
    return "past";
  }

  return "upcoming";
}

export function getWeekDays(anchor = new Date()) {
  const day = anchor.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = startOfDay(addDays(anchor, mondayOffset));

  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function isCommandeInWeek(commande: Commande, weekDays: Date[]) {
  return weekDays.some((day) => isCommandeOnDay(commande, day));
}

export function isCommandeOnDay(commande: Commande, day: Date) {
  const start = toDate(getInterventionStart(commande));
  const end = toDate(getInterventionEnd(commande));

  if (!start || !end) {
    return false;
  }

  const target = startOfDay(day);
  if (target < startOfDay(start) || target > startOfDay(end)) {
    return false;
  }

  return !isJourExclu(commande, target);
}

export function createSeedCommandes(): Commande[] {
  const now = new Date();

  const withOffset = (days: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    return formatAsDateInput(date);
  };

  return [
    prepareCommandeForSave({
      numeroDevis: "DV-24031",
      client: "Mme Martin",
      typeCommande: "Fourniture & Pose",
      statutCommande: "Fabrication en cours",
      dateCommande: withOffset(-12),
      datePosePrevue: withOffset(7),
      datePoseFin: withOffset(8),
      joursExclus: [],
      dateSavPrevue: "",
      commentaireSuivi: "Validation atelier ok, attente vitrage.",
      etatFacturation: "À facturer",
      numeroFacture: "",
      dateFacture: "",
      commentaireFacturation: ""
    }),
    prepareCommandeForSave({
      numeroDevis: "DV-24018",
      client: "M. Bernard",
      typeCommande: "Fourniture seule - livraison",
      statutCommande: "Prêt à livrer",
      dateCommande: withOffset(-38),
      datePosePrevue: withOffset(1),
      datePoseFin: "",
      joursExclus: [],
      dateSavPrevue: "",
      commentaireSuivi: "Prévenir le client 24h avant départ camion.",
      etatFacturation: "À facturer",
      numeroFacture: "",
      dateFacture: "",
      commentaireFacturation: ""
    }),
    prepareCommandeForSave({
      numeroDevis: "DV-23997",
      client: "SCI Horizon",
      typeCommande: "Fourniture & Pose",
      statutCommande: "À facturer",
      dateCommande: withOffset(-45),
      datePosePrevue: withOffset(-3),
      datePoseFin: "",
      joursExclus: [],
      dateSavPrevue: "",
      commentaireSuivi: "PV de réception signé.",
      etatFacturation: "À facturer",
      numeroFacture: "",
      dateFacture: "",
      commentaireFacturation: "À passer cette semaine."
    }),
    prepareCommandeForSave({
      numeroDevis: "DV-23884",
      client: "Mairie de Blaringhem",
      typeCommande: "SAV",
      statutCommande: "SAV prévu",
      dateCommande: withOffset(-20),
      datePosePrevue: "",
      datePoseFin: "",
      joursExclus: [],
      dateSavPrevue: withOffset(4),
      commentaireSuivi: "Attente pièce fournisseur.",
      etatFacturation: "À facturer",
      numeroFacture: "",
      dateFacture: "",
      commentaireFacturation: ""
    }),
    prepareCommandeForSave({
      numeroDevis: "DV-23651",
      client: "Mme Duhamel",
      typeCommande: "Fourniture seule - enlèvement",
      statutCommande: "Archivé",
      dateCommande: withOffset(-90),
      datePosePrevue: withOffset(-56),
      datePoseFin: "",
      joursExclus: [],
      dateSavPrevue: "",
      commentaireSuivi: "Commande clôturée.",
      etatFacturation: "Payé",
      numeroFacture: "FAC-2026-104",
      dateFacture: withOffset(-48),
      commentaireFacturation: "Règlement reçu."
    })
  ];
}
