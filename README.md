# Sarange Suivi

Starter SPA pour le suivi des commandes Sarange, construit autour d'une seule source de donnees `commandes`.

## Stack recommandee

- `Vite + React + TypeScript` pour un front rapide a faire evoluer
- `Firebase Firestore` pour la collection `commandes`, le temps reel et le deploiement simple
- `CSS` maison avec variables de theme pour garder une direction visuelle propre a Sarange

## Vues incluses

- Bureau general
- Onglets par statut commande
- SAV
- Facturation
- Archives
- Planning TV semaine (`/tv`)

## Demarrage

```bash
npm install
npm run dev
```

## Deploiement Vercel

Le projet est pret pour Vercel. Le fichier [vercel.json](vercel.json) redirige les routes React vers `index.html`, ce qui permet d'ouvrir directement `/tv`, `/sav`, `/archives` ou `/corbeille`.

Dans Vercel, ajoute les memes variables que dans `.env.example` :

```bash
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

Parametres Vercel recommandes :

- Framework Preset : `Vite`
- Build Command : `npm run build`
- Output Directory : `dist`

## Connexion Firebase

1. Cree un projet dans la console Firebase.
2. Ajoute une application Web dans `Parametres du projet` > `Vos applications`.
3. Copie la configuration Firebase fournie par la console.
4. Cree un fichier `.env` a la racine du projet avec les valeurs de `.env.example`.
5. Active Firestore Database en mode production ou test.
6. Cree une collection `commandes`. Le premier document peut etre ajoute depuis l'application.
7. Lance `npm run dev`.

Exemple de `.env` :

```bash
VITE_FIREBASE_API_KEY=xxxxxxxx
VITE_FIREBASE_AUTH_DOMAIN=mon-projet.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=mon-projet
VITE_FIREBASE_STORAGE_BUCKET=mon-projet.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

## Temps reel local et Firestore

- Sans variables Firebase, l'application demarre en mode local avec `localStorage` + `BroadcastChannel`.
- Avec les variables `VITE_FIREBASE_*`, elle bascule automatiquement sur Firestore.
- La vue TV ecoute la meme collection `commandes`, donc elle se met a jour automatiquement quand le bureau enregistre une commande.

## Regles Firestore

Le projet Firebase `sarange-pro` est partage avec devis-sarange et sarange-metrage. Les regles vivent dans un fichier unique, `firestore.rules` du depot `devis-sarange` — c'est le SEUL depot depuis lequel `firebase deploy --only firestore:rules` doit etre lance. Ce depot-ci ne contient volontairement ni `firebase.json` ni fichier de regles, pour rendre un deploiement accidentel impossible.

Acces aux collections `commandes` et `commandes_corbeille` : compte Google du domaine `@sarange.fr`, email verifie.
