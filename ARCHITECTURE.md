# Prestiben - Dossier d'Architecture Logicielle v1.0

## 1. Architecture Système Global
L'architecture de **Prestiben** repose sur un modèle hybride : une application mobile performante, un backend temps réel scalable et des services cloud managés pour la sécurité et la flexibilité.

### Composants Principaux
*   **Mobile (Frontend):** React Native (Android/iOS) + Expo pour un cycle de développement rapide.
*   **Backend (Core):** Node.js avec Express, architecture en microservices ou monolithique modulaire (Domain-Driven Design).
*   **Real-time Engine:** Socket.io pour le dispatching et le tracking GPS.
*   **Database:** MongoDB Atlas (Données transactionnelles et profils) + Redis (Cache de proximité et session Socket.io).
*   **Infrastructure:** AWS (EC2/Lambda, S3 pour le stockage, CloudFront pour le CDN).

---

## 2. Structure des Collections MongoDB (Professionnelle)

### `users`
*   `_id`: ObjectId
*   `phone`: String (Unique, indexé)
*   `role`: Enum ['client', 'provider', 'admin']
*   `status`: Enum ['active', 'suspended', 'pending_kyc']
*   `fcmToken`: String (Pour les push notifications)
*   `ratingAvg`: Number
*   `reviewsCount`: Integer

### `providers` (Profil détaillé lié à `users`)
*   `userId`: ObjectId (Ref: users)
*   `isOnline`: Boolean
*   `currentLocation`: { type: "Point", coordinates: [lng, lat] } (Index 2dsphere)
*   `services`: Array<ObjectId> (Ref: services)
*   `kycDocuments`: { idCard: String, selfie: String, certs: Array }
*   `verified`: Boolean
*   `balance`: Number (Montant disponible pour retrait)

### `service_requests`
*   `clientId`: ObjectId (Ref: users)
*   `providerId`: ObjectId (Ref: users, nullable au début)
*   `serviceId`: ObjectId (Ref: services)
*   `status`: Enum ['searching', 'matched', 'in_progress', 'completed', 'cancelled']
*   `pickupLocation`: { type: "Point", coordinates: [lng, lat] }
*   `price`: Number
*   `matchingAttempts`: Integer
*   `trackingLogs`: Array<{ lat, lng, timestamp }>

### `transactions`
*   `requestId`: ObjectId
*   `amount`: Number
*   `type`: Enum ['escrow', 'payout', 'commission']
*   `paymentProvider`: Enum ['MTN_MOMO', 'MOOV_FLOOZ']
*   `externalRef`: String

---

## 3. Architecture Firebase

*   **Auth:** Utilisation stricte de l'authentification par téléphone (OTP). Firebase Auth gère la complexité des SMS et de la validation.
*   **Cloud Messaging (FCM):** Canal critique pour les alertes de nouvelles missions quand l'app du prestataire est en arrière-plan.
*   **Storage:** Buckets S3-compatibles (ou Firebase Storage) avec règles d'accès strictes : seul l'Admin et le Prestataire concerné peuvent voir les pièces d'identité.

---

## 4. Algorithme de Matching "Rapid-Dispatch" (60s)

### Logique de Score
`Score = (D * 0.4) + (R * 0.3) + (H * 0.3)`
*   `D (Distance)`: Normalisé de 0 à 1 (sur un rayon de 10km).
*   `R (Rating)`: Note moyenne sur 5.
*   `H (Historique)`: Taux d'acceptation du prestataire sur les 20 dernières demandes.

### Workflow Backend
1.  **Ingestion:** Client émet `request_service` via Socket.
2.  **Filtrage Géo:** Recherche via MongoDB `$nearSphere` des prestataires `isOnline` & `verified`.
3.  **Classement:** Tri par score.
4.  **Diffusion par vagues:**
    *   *Vague 1 (0-15s):* Les 3 meilleurs scores reçoivent la notif.
    *   *Vague 2 (15-30s):* Extension aux 10 suivants + augmentation rayon.
5.  **Assignation:** "First-to-click" géré par un verrou atomique Redis pour éviter les doubles assignations.

---

## 5. Dashboard Admin & Workflow KYC

### Pages Clés
1.  **KYC Queue:** Vue triée par date d'inscription. Comparaison du selfie biométrique avec la photo de la carte d'identité.
2.  **Live Map:** Supervision de toutes les demandes actives et des prestataires en ligne.
3.  **Litiges:** Système de ticket pour les interventions suite à un bouton SOS ou mauvaise notation.
4.  **Payouts:** Validation manuelle ou semi-auto des retraits vers MTN/Moov.

---

## 6. Roadmap MVP (Priorité Cotonou)

1.  **Semaine 1-2:** Backend Core + Firebase Auth + Schéma DB.
2.  **Semaine 3-4:** App Front-end (Client) Service Selection & Request Flow.
3.  **Semaine 5-6:** App Front-end (Provider) Dispatch System & Real-time Sockets.
4.  **Semaine 7-8:** Intégration Paiement Mobile Money + KYC Validation Panel.
5.  **Semaine 9-10:** Test Beta sur 50 prestataires à Fidjrossè.

---

## 7. Prompts pour Vibe Coding (AI Studio)

### Pour le Backend :
> "Génère un backend Node.js/Express avec Socket.io pour un système de matching type Uber. Inclus un geo-query MongoDB pour trouver les prestataires dans un rayon de 5km et une logique de verrouillage via Redis pour l'acceptation de mission."

### Pour le Frontend :
> "Crée un écran React Native de recherche de prestataire avec une animation de radar pulsé, une liste de catégories de services moderne (style Glovo) et un bottom bar flottant. Utilise Tailwind CSS (NativeWind)."

---

## 8. Bonnes Pratiques Production

*   **Sécurité:** SSL/TLS obligatoire, Rate Limiting sur les OTP, Sanitization des URLs de storage.
*   **Anti-Fraude:** Vérification `email_verified` et `phone_verified`. Système de "Score de confiance" pour bannir les prestataires qui annulent trop souvent.
*   **Monitoring:** Intégration de Sentry pour les crashs mobiles et Morgan/Winston pour les logs backend.
